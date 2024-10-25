import { ethers } from "ethers";
import { parentPort, workerData } from "worker_threads";
import { MEMES_CONTRACT } from "../../../../shared/abis/memes";
import { WorkerData } from "../../scheduled-worker";
import { DataSource, DataSourceOptions } from "typeorm";
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
  EventType,
  Event,
  NFTDelegationBlock,
} from "../../../db/entities/IDelegation";
import { areEqualAddresses, sleep } from "../../../../shared/helpers";
import {
  CONSOLIDATED_WALLETS_TDH_TABLE,
  DELEGATION_ALL_ADDRESS,
  DELEGATION_CONTRACT,
  USE_CASE_CONSOLIDATION,
  USE_CASE_PRIMARY_ADDRESS,
  USE_CASE_SUB_DELEGATION,
} from "../../../../constants";
import { DELEGATIONS_IFACE } from "../../../../shared/abis/delegations";
import { Time } from "../../../../shared/time";
import {
  fetchLatestNftDelegationBlock,
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
import { fetchLatestTransactionsBlockForDate } from "../tdh-worker/tdh-worker.db";
import {
  Transaction,
  TransactionBlock,
} from "../../../db/entities/ITransaction";
import { NFT } from "../../../db/entities/INFT";
import { NFTOwner } from "../../../db/entities/INFTOwner";

const data: WorkerData = workerData;

export const NAMESPACE = "NFT_DELEGATION_WORKER >";

async function getConsolidationsContainingAddress(
  db: DataSource,
  wallets: Set<string>
): Promise<ConsolidatedTDH[]> {
  const likeConditions = Array.from(wallets)
    .map((wallet) => `consolidation_key LIKE '%${wallet.toLowerCase()}%'`)
    .join(" OR ");

  const query = `
    SELECT * FROM ${CONSOLIDATED_WALLETS_TDH_TABLE}
    WHERE ${likeConditions}
  `;

  return await db.query(query);
}

async function getAffectedWallets(db: DataSource, wallets: Set<string>) {
  const allConsolidations = await getConsolidationsContainingAddress(
    db,
    wallets
  );
  allConsolidations.map((c) => {
    const cWallets = JSON.parse(c.wallets);
    cWallets.forEach((w: string) => wallets.add(w.toLowerCase()));
  });

  return wallets;
}

class NFTDelegationWorker extends CoreWorker {
  constructor(
    rpcUrl: string,
    dbParams: DataSourceOptions,
    blockRange: number,
    maxConcurrentRequests: number
  ) {
    super(rpcUrl, dbParams, blockRange, maxConcurrentRequests, parentPort, [
      NFTDelegationBlock,
      Delegation,
      Consolidation,
      TDHBlock,
      TDH,
      ConsolidatedTDH,
      Transaction,
      TransactionBlock,
      NFT,
      NFTOwner,
      Consolidation,
      TDHMerkleRoot,
    ]);
  }

  async work() {
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
      delegationsResponse.revocations.length
    );
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.COMPLETED,
        message: `Completed at ${Time.now().toLocaleDateTimeString()} - Latest Block: ${
          delegationsResponse.latestBlock
        }`,
      },
    });
  }

  private async findNewDelegations(): Promise<{
    latestBlock: number;
    consolidations: ConsolidationEvent[];
    registrations: DelegationEvent[];
    revocations: DelegationEvent[];
  }> {
    let startBlock = await fetchLatestNftDelegationBlock(this.getDb());
    if (startBlock === 0) {
      startBlock = DELEGATION_CONTRACT.deploy_block;
    }
    const latestBlock = await this.getProvider().getBlockNumber();
    logInfo(
      parentPort,
      "Blocks",
      `[${startBlock}-${latestBlock}]`,
      "> Fetching all transactions..."
    );

    const response = await this.findAllDelegationTransactions(
      startBlock + 1,
      latestBlock
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
    toBlock: number
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
        toBlock
      );

      const latestBlockTime = await getBlockTimestamp(
        parentPort,
        this.getProvider(),
        NAMESPACE,
        nextToBlock
      );

      const printStatus = (...args: any[]) => {
        logInfo(
          parentPort,
          "Blocks",
          `[${currentFromBlock}-${nextToBlock}]`,
          ...args
        );
      };

      const sendUpdate = (action: string) => {
        sendStatusUpdate(parentPort, {
          update: {
            status: ScheduledWorkerStatus.RUNNING,
            message: "Syncing Blocks",
            action,
            progress: currentFromBlock,
            target: toBlock,
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
          `[REVOCATIONS ${mappedDelegations.revocations.length}]`
        );

        printStatus(
          "> Persisting...",
          `[DELEGATIONS ${mappedDelegations.registrations.length}] [CONSOLIDATIONS ${mappedDelegations.consolidations.length}] [REVOCATIONS ${mappedDelegations.revocations.length}]`
        );
        sendUpdate("Updating Database");

        await persistNftDelegations(
          this.getDb(),
          nextToBlock,
          latestBlockTime.toSeconds(),
          mappedDelegations
        );

        allDelegations.push(...mappedDelegations.registrations);
        allConsolidations.push(...mappedDelegations.consolidations);
        allRevocations.push(...mappedDelegations.revocations);

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
          }
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
    const consolidations: ConsolidationEvent[] = [];
    const registrations: DelegationEvent[] = [];
    const revocations: DelegationEvent[] = [];

    const decodedLogPromises = logs.map((d) => {
      this.getBottleneck().schedule(async () => {
        const delResult = DELEGATIONS_IFACE.parseLog(d);
        if (!delResult) {
          return;
        }
        const collection = delResult.args.collectionAddress.toLowerCase();
        const from = delResult.args.delegator
          ? delResult.args.delegator
          : delResult.args.from;
        const to = delResult.args.delegationAddress;
        const useCase = Number(delResult.args.useCase);

        if (
          !areEqualAddresses(from, to) ||
          useCase === USE_CASE_PRIMARY_ADDRESS
        ) {
          if (
            [
              "RegisterDelegation",
              "RegisterDelegationUsingSubDelegation",
            ].includes(delResult.name)
          ) {
            const e: Event = {
              block: d.blockNumber,
              type: EventType.REGISTER,
              wallet1: from.toLowerCase(),
              wallet2: to.toLowerCase(),
            };
            if (useCase === USE_CASE_CONSOLIDATION) {
              if (
                [MEMES_CONTRACT, DELEGATION_ALL_ADDRESS].includes(collection)
              ) {
                consolidations.push(e);
              }
            } else if (useCase === USE_CASE_SUB_DELEGATION) {
              registrations.push({
                ...e,
                use_case: useCase,
                collection: collection.toLowerCase(),
              });
            } else {
              const delegationDetails = await this.getDelegationDetails(
                d.transactionHash
              );
              registrations.push({
                ...e,
                use_case: useCase,
                collection: collection.toLowerCase(),
                expiry: delegationDetails?.expiry,
                all_tokens: delegationDetails?.allTokens,
                token_id: delegationDetails?.tokenId,
              });
            }
          } else if (
            ["RevokeDelegation", "RevokeDelegationUsingSubDelegation"].includes(
              delResult.name
            )
          ) {
            const e: Event = {
              block: d.blockNumber,
              type: EventType.REVOKE,
              wallet1: from.toLowerCase(),
              wallet2: to.toLowerCase(),
            };
            if (useCase === USE_CASE_CONSOLIDATION) {
              if (
                [MEMES_CONTRACT, DELEGATION_ALL_ADDRESS].includes(collection)
              ) {
                consolidations.push(e);
              }
            } else {
              revocations.push({
                ...e,
                use_case: useCase,
                collection: collection.toLowerCase(),
              });
            }
          }
        }
      });
    });

    await Promise.all(decodedLogPromises);

    return {
      consolidations,
      registrations,
      revocations,
    };
  }

  private getDelegationDetails = async (txHash: string) => {
    await sleep(100);
    const tx = await this.getProvider().getTransaction(txHash);
    if (tx) {
      const data = tx.data;
      try {
        const parsed = DELEGATIONS_IFACE.parseTransaction({ data, value: 0 });
        if (parsed?.args._expiryDate) {
          return {
            expiry: parsed.args._expiryDate.toNumber(),
            allTokens: parsed.args._allTokens,
            tokenId: parsed.args._tokenId.toNumber(),
          };
        }
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  private async reconsolidateWallets(events: ConsolidationEvent[]) {
    logInfo(parentPort, "Reconsolidating wallets");
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.RUNNING,
        message: "Reconsolidating wallets",
        progress: events.length,
      },
    });

    const wallets = new Set<string>();
    events.forEach((c) => {
      wallets.add(c.wallet1.toLowerCase());
      wallets.add(c.wallet2.toLowerCase());
    });

    const affectedWallets = await getAffectedWallets(this.getDb(), wallets);

    if (affectedWallets.size > 0) {
      logInfo(
        parentPort,
        `[RECONSOLIDATING FOR ${affectedWallets.size} DISTINCT WALLETS]`
      );

      const lastTDHCalc = getLastTDH();
      const block = await fetchLatestTransactionsBlockForDate(
        this.getDb(),
        lastTDHCalc
      );
      const blockTimestamp = await getBlockTimestamp(
        parentPort,
        this.getProvider(),
        NAMESPACE,
        block
      );

      const walletsArray = Array.from(affectedWallets);

      await calculateTDH(
        this.getDb(),
        block,
        lastTDHCalc,
        blockTimestamp,
        walletsArray
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
  data.maxConcurrentRequests
);
