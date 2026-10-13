import { setTdhRecalculationNeeded } from "../transactions-worker/transactions-worker.db";
import { loadConsolidationPolicy } from "../tdh-worker/consolidation-policy";
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
  NativeDelegationRegistration,
  ReplayNativeDelegationRegistration,
} from "../../../db/entities/IDelegation";
import { sleep } from "../../../../shared/helpers";
import { DELEGATION_CONTRACT } from "../../../../electron-constants";
import { Time } from "../../../../shared/time";
import {
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
import {
  createDelegationStateReader,
  readRecentDelegationState,
} from "./delegation-registration-expiry";
import { syncNativeDelegations } from "./delegation-sync";
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
      NativeDelegationRegistration,
      ReplayNativeDelegationRegistration,
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
    const consolidations: ConsolidationEvent[] = [];
    const provider = this.getProvider();
    let reconciliationPercentage = 0;
    const reportReconciliation = (waiting: boolean) =>
      sendStatusUpdate(parentPort, {
        update: {
          status: ScheduledWorkerStatus.RUNNING,
          message: "Reconciling delegation scope and expiry",
          action: waiting
            ? "Waiting for database"
            : "Reading recent contract state",
          statusPercentage: reconciliationPercentage,
        },
      });
    const result = await syncNativeDelegations(
      this.getDb(),
      provider,
      createDelegationStateReader(
        (to, callData, blockTag) =>
          this.getBottleneck().schedule(() =>
            readRecentDelegationState(
              blockTag,
              () => provider.getBlockNumber(),
              () => provider.call({ to, data: callData, blockTag }),
            ),
          ),
        DELEGATION_CONTRACT.contract,
      ),
      async (fromBlock, toBlock) => {
        logInfo(
          parentPort,
          "Scanning native delegation logs",
          `[${fromBlock}-${toBlock}]`,
        );
        const scanned = await this.findAllDelegationTransactions(
          fromBlock,
          toBlock,
        );
        consolidations.push(...scanned.consolidations);
      },
      (completed, total) => {
        reconciliationPercentage = total > 0 ? (completed / total) * 100 : 0;
        reportReconciliation(false);
      },
      reportReconciliation,
    );
    if (result.upgrade) {
      sendStatusUpdate(parentPort, {
        update: {
          status: ScheduledWorkerStatus.COMPLETED,
          message: `Delegation replay completed at block ${result.block}; full TDH recalculation required`,
          statusPercentage: 100,
        },
      });
      return;
    }
    if (consolidations.length) await this.reconsolidateWallets(consolidations);
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.COMPLETED,
        message: `Completed at ${Time.now().toLocaleDateTimeString()} - Latest Block: ${result.block}`,
        statusPercentage: 100,
      },
    });
  }

  private async findAllDelegationTransactions(
    fromBlock: number,
    toBlock: number,
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
      const scanBlock = await this.getProvider().getBlock(nextToBlock);
      if (!scanBlock?.hash)
        throw new Error(`Missing delegation scan block ${nextToBlock}`);
      const verifyScanBlock = async () => {
        if (
          (await this.getProvider().getBlock(nextToBlock))?.hash !==
          scanBlock.hash
        ) {
          throw new Error(
            "Delegation scan block changed; retry to resume from the last checkpoint",
          );
        }
      };

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

        await verifyScanBlock();
        await persistNftDelegations(
          this.getDb(),
          nextToBlock,
          latestBlockTime.toSeconds(),
          mappedDelegations,
          5,
          100,
          true,
          scanBlock.hash,
        );

        allDelegations.push(...mappedDelegations.registrations);
        allConsolidations.push(...mappedDelegations.consolidations);
        allRevocations.push(...mappedDelegations.revocations);

        printStatus("> Mapped", logs.length.toLocaleString());
      } else {
        await verifyScanBlock();
        await persistNftDelegations(
          this.getDb(),
          nextToBlock,
          latestBlockTime.toSeconds(),
          {
            consolidations: [],
            registrations: [],
            revocations: [],
            registrationLogs: [],
          },
          5,
          100,
          true,
          scanBlock.hash,
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

      let policy;
      try {
        policy = await loadConsolidationPolicy(
          data.consolidationSettingsRequest,
        );
      } catch {
        await setTdhRecalculationNeeded(this.getDb().manager, true);
        logInfo(
          parentPort,
          "Reconsolidation deferred until backend consolidation settings are available; previous TDH is preserved",
        );
        return;
      }

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
        policy,
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
