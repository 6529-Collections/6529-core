import { ethers } from "ethers";
import { parentPort, workerData } from "worker_threads";
import { ResettableWorkerData } from "../../scheduled-worker";
import { DataSourceOptions } from "typeorm";
import {
  getBlockTimestamp,
  logInfo,
  sendStatusUpdate,
} from "../../worker-helpers";
import {
  Consolidation,
  ConsolidationEvent,
  Delegation,
  DelegationEvent,
  ReplayConsolidation,
  ReplayDelegation,
  NFTDelegationReplayBlock,
  NFTDelegationBlock,
} from "../../../db/entities/IDelegation";
import { sleep } from "../../../../shared/helpers";
import { DELEGATION_CONTRACT } from "../../../../electron-constants";
import { Time } from "../../../../shared/time";
import {
  getLatestNFTDBlock,
  isNativeDelegationIndexReady,
  completeNativeDelegationReplay,
  resetNativeDelegationReplay,
  persistNftDelegations,
} from "./nftdelegation-worker.db";
import { CoreWorker } from "../core-worker";
import { ScheduledWorkerStatus } from "../../../../shared/types";
import {
  ConsolidatedTDH,
  TDH,
  TDHBlock,
  TDHMerkleRoot,
} from "../../../db/entities/ITDH";
import { getLastTDH } from "../tdh-worker/tdh-worker.helpers";
import { calculateTDH } from "../tdh-worker/tdh";
import {
  Transaction,
  TransactionBlock,
} from "../../../db/entities/ITransaction";
import { NFT } from "../../../db/entities/INFT";
import { NFTOwner } from "../../../db/entities/INFTOwner";
import { findLatestBlockBeforeTimestamp } from "../tdh-worker/tdh";

import { mapDelegationLogs } from "./delegation-logs";
import { createDelegationStateReader } from "./delegation-registration-expiry";
import { expandAffectedConsolidationWallets } from "../tdh-worker/tdh-worker.db";

const data: ResettableWorkerData = workerData;

export const NAMESPACE = "NFT_DELEGATION_WORKER >";

class NFTDelegationWorker extends CoreWorker {
  private reset?: boolean;

  constructor(
    rpcUrl: string,
    dbParams: DataSourceOptions,
    blockRange: number,
    maxConcurrentRequests: number,
    reset?: boolean,
  ) {
    super(rpcUrl, dbParams, blockRange, maxConcurrentRequests, parentPort, [
      NFTDelegationBlock,
      Delegation,
      Consolidation,
      ReplayConsolidation,
      ReplayDelegation,
      NFTDelegationReplayBlock,
      TDHBlock,
      TDH,
      ConsolidatedTDH,
      Transaction,
      TransactionBlock,
      NFT,
      NFTOwner,
      TDHMerkleRoot,
    ]);
    this.reset = reset;
  }

  async work() {
    if (this.reset) {
      await resetNativeDelegationReplay(this.getDb());
      sendStatusUpdate(parentPort, {
        update: {
          status: ScheduledWorkerStatus.COMPLETED,
          message:
            "Delegation replay reset; run NFTDelegation to rebuild the index",
        },
      });
      return;
    }
    if (!(await isNativeDelegationIndexReady(this.getDb()))) {
      await this.replayNativeDelegations();
      return;
    }
    await this.baseWork();
  }

  private async replayNativeDelegations() {
    const checkpoint = await this.getDb()
      .getRepository(NFTDelegationReplayBlock)
      .findOne({ where: { id: 1 } });
    const fromBlock =
      (checkpoint?.block ?? DELEGATION_CONTRACT.deploy_block - 1) + 1;
    const latestBlock = await this.getProvider().getBlockNumber();
    logInfo(
      parentPort,
      "Replaying native delegations",
      `[${fromBlock}-${latestBlock}]`,
    );
    await this.findAllDelegationTransactions(fromBlock, latestBlock, true);
    await completeNativeDelegationReplay(this.getDb(), latestBlock);
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.COMPLETED,
        message: `Delegation replay completed at block ${latestBlock}; full TDH recalculation required`,
        statusPercentage: 100,
      },
    });
  }

  async baseWork() {
    const delegationsResponse = await this.findNewDelegations();
    if (delegationsResponse.consolidations.length > 0) {
      await this.reconsolidateWallets(delegationsResponse.consolidations);
    } else {
      logInfo(parentPort, "Skipping reconsolidation");
    }

    logInfo(
      parentPort,
      "Finished",
      delegationsResponse.consolidations.length,
      delegationsResponse.registrations.length,
      delegationsResponse.revocations.length,
    );
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.COMPLETED,
        message: `Completed at ${Time.now().toLocaleDateTimeString()} - Latest Block: ${
          delegationsResponse.latestBlock
        }`,
        statusPercentage: 100,
      },
    });
  }

  private async findNewDelegations(): Promise<{
    latestBlock: number;
    consolidations: ConsolidationEvent[];
    registrations: DelegationEvent[];
    revocations: DelegationEvent[];
  }> {
    let startBlock = await getLatestNFTDBlock(this.getDb());
    if (startBlock === 0) {
      startBlock = DELEGATION_CONTRACT.deploy_block - 1;
    }
    const latestBlock = await this.getProvider().getBlockNumber();
    logInfo(
      parentPort,
      "Blocks",
      `[${startBlock}-${latestBlock}]`,
      "> Fetching all transactions...",
    );

    const response = await this.findAllDelegationTransactions(
      startBlock + 1,
      latestBlock,
    );

    return {
      latestBlock: latestBlock,
      consolidations: response.consolidations,
      registrations: response.registrations,
      revocations: response.revocations,
    };
  }

  private async findAllDelegationTransactions(
    fromBlock: number,
    toBlock: number,
    replay = false,
  ) {
    let currentFromBlock = fromBlock;

    const allDelegations: DelegationEvent[] = [];
    const allConsolidations: ConsolidationEvent[] = [];
    const allRevocations: DelegationEvent[] = [];

    while (currentFromBlock <= toBlock) {
      const statusPercentage =
        ((currentFromBlock - DELEGATION_CONTRACT.deploy_block) /
          (toBlock - DELEGATION_CONTRACT.deploy_block)) *
        100;
      const nextToBlock = Math.min(
        currentFromBlock + this.getBlockRange(),
        toBlock,
      );

      const latestBlockTime = await getBlockTimestamp(
        parentPort,
        this.getProvider(),
        NAMESPACE,
        nextToBlock,
      );

      const printStatus = (...args: any[]) => {
        logInfo(
          parentPort,
          "Blocks",
          `[${currentFromBlock}-${nextToBlock}]`,
          ...args,
        );
      };

      const sendUpdate = (action: string) => {
        sendStatusUpdate(parentPort, {
          update: {
            status: ScheduledWorkerStatus.RUNNING,
            message: `Syncing Blocks [${currentFromBlock}-${nextToBlock}]`,
            action,
            statusPercentage: statusPercentage,
          },
        });
      };

      printStatus("> Fetching...");
      sendUpdate("Getting Logs");

      await sleep(100);

      const logs = await this.getProvider().getLogs({
        address: DELEGATION_CONTRACT.contract,
        fromBlock: currentFromBlock,
        toBlock: nextToBlock,
      });

      if (logs.length > 0) {
        printStatus("> Fetched", logs.length.toLocaleString(), "Mapping...");
        sendUpdate(`Mapping (${logs.length.toLocaleString()})`);

        const mappedDelegations = await this.mapDelegations(logs);

        printStatus(
          "> Mapped",
          `[REGISTRATIONS ${mappedDelegations.registrations.length}]`,
          `[CONSOLIDATIONS ${mappedDelegations.consolidations.length}]`,
          `[REVOCATIONS ${mappedDelegations.revocations.length}]`,
        );

        printStatus(
          "> Persisting...",
          `[DELEGATIONS ${mappedDelegations.registrations.length}] [CONSOLIDATIONS ${mappedDelegations.consolidations.length}] [REVOCATIONS ${mappedDelegations.revocations.length}]`,
        );
        sendUpdate("Updating Database");

        await persistNftDelegations(
          this.getDb(),
          nextToBlock,
          latestBlockTime.toSeconds(),
          mappedDelegations,
          5,
          100,
          replay,
        );

        if (!replay) {
          allDelegations.push(...mappedDelegations.registrations);
          allConsolidations.push(...mappedDelegations.consolidations);
          allRevocations.push(...mappedDelegations.revocations);
        }

        printStatus("> Mapped", logs.length.toLocaleString());
      } else {
        await persistNftDelegations(
          this.getDb(),
          nextToBlock,
          latestBlockTime.toSeconds(),
          {
            consolidations: [],
            registrations: [],
            revocations: [],
          },
          5,
          100,
          replay,
        );
        printStatus("> No logs");
      }

      currentFromBlock = nextToBlock + 1;
    }

    return {
      consolidations: allConsolidations,
      registrations: allDelegations,
      revocations: allRevocations,
    };
  }

  private async mapDelegations(logs: ethers.Log[]) {
    const provider = this.getProvider();
    return mapDelegationLogs(
      logs,
      createDelegationStateReader(
        (to, data, blockTag) =>
          this.getBottleneck().schedule(() =>
            provider.call({ to, data, blockTag }),
          ),
        DELEGATION_CONTRACT.contract,
      ),
      (block) =>
        this.getBottleneck().schedule(async () => {
          const result = await provider.getBlock(block);
          if (!result) throw new Error(`Missing timestamp for block ${block}`);
          return result.timestamp;
        }),
      (message) => logInfo(parentPort, message),
    );
  }

  private async reconsolidateWallets(events: ConsolidationEvent[]) {
    logInfo(parentPort, "Reconsolidating wallets");
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.RUNNING,
        message: `Reconsolidating wallets [${events.length}]`,
      },
    });

    const wallets = new Set<string>();
    events.forEach((c) => {
      wallets.add(c.wallet1.toLowerCase());
      wallets.add(c.wallet2.toLowerCase());
    });

    const affectedWallets = await expandAffectedConsolidationWallets(
      this.getDb(),
      Array.from(wallets),
    );

    if (affectedWallets.length > 0) {
      logInfo(
        parentPort,
        `[RECONSOLIDATING FOR ${affectedWallets.length} DISTINCT WALLETS]`,
      );

      const lastTDHCalc = getLastTDH();
      const blockBefore = await findLatestBlockBeforeTimestamp(
        this.getProvider(),
        lastTDHCalc.getTime() / 1000,
      );
      const block = blockBefore.number;
      const blockTimestamp = await getBlockTimestamp(
        parentPort,
        this.getProvider(),
        NAMESPACE,
        block,
      );

      const walletsArray = affectedWallets;

      await calculateTDH(
        this.getDb(),
        block,
        lastTDHCalc,
        blockTimestamp,
        walletsArray,
      );
    } else {
      logInfo(parentPort, `[NO WALLETS TO RECONSOLIDATE]`);
      sendStatusUpdate(parentPort, {
        update: {
          status: ScheduledWorkerStatus.RUNNING,
          message: "No wallets to reconsolidate",
        },
      });
    }
  }
}

new NFTDelegationWorker(
  data.rpcUrl,
  data.dbParams,
  data.blockRange,
  data.maxConcurrentRequests,
  data.reset,
);
