import { ethers, Filter, Interface, Log } from "ethers";
import { parentPort, workerData } from "worker_threads";
import {
  MEMELAB_CONTRACT,
  MEMES_ABI,
  MEMES_CONTRACT,
} from "../../../../shared/abis/memes";
import { Time } from "../../../../shared/time";
import {
  getLatestTransactionsBlock,
  OwnerDeltaError,
  persistTransactionsAndOwners,
  recalculateTransactionOwners,
} from "./transactions-worker.db";
import { DataSourceOptions, MoreThan } from "typeorm";
import { NFTOwner } from "../../../db/entities/INFTOwner";
import {
  Transaction,
  TransactionBlock,
} from "../../../db/entities/ITransaction";
import { findTransactionValues } from "./transaction-values";
import { areEqualAddresses, sleep } from "../../../../shared/helpers";
import { extractNFTOwnerDeltas, NFTOwnerDelta } from "./nft-owners";
import {
  getBlockTimestamp,
  logInfo,
  logWarn,
  sendStatusUpdate,
} from "../../worker-helpers";
import {
  GRADIENT_ABI,
  GRADIENT_CONTRACT,
} from "../../../../shared/abis/gradient";
import { NEXTGEN_ABI, NEXTGEN_CONTRACT } from "../../../../shared/abis/nextgen";
import { CoreWorker } from "../core-worker";
import {
  ScheduledWorkerStatus,
  TRANSACTIONS_START_BLOCK,
  TransactionsWorkerScope,
} from "../../../../shared/types";
import { TransactionsWorkerData } from "../../scheduled-worker";

const data: TransactionsWorkerData = workerData;

export const NAMESPACE = "TRANSACTIONS_WORKER >";

function getInterface(contract: string) {
  switch (contract) {
    case MEMES_CONTRACT:
      return new ethers.Interface(MEMES_ABI);
    case GRADIENT_CONTRACT:
      return new ethers.Interface(GRADIENT_ABI);
    case NEXTGEN_CONTRACT:
      return new ethers.Interface(NEXTGEN_ABI);
    case MEMELAB_CONTRACT:
      return new ethers.Interface(MEMES_ABI);
  }

  throw new Error(`Unknown contract: ${contract}`);
}

export class TransactionsWorker extends CoreWorker {
  private transferTopic = ethers.id("Transfer(address,address,uint256)");
  private transferSingleTopic = ethers.id(
    "TransferSingle(address,address,address,uint256,uint256)"
  );
  private transferBatchTopic = ethers.id(
    "TransferBatch(address,address,address,uint256[],uint256[])"
  );

  private scope?: TransactionsWorkerScope;
  private block?: number;

  constructor(
    rpcUrl: string,
    dbParams: DataSourceOptions,
    blockRange: number,
    maxConcurrentRequests: number,
    scope?: TransactionsWorkerScope,
    block?: number
  ) {
    super(rpcUrl, dbParams, blockRange, maxConcurrentRequests, parentPort, [
      Transaction,
      NFTOwner,
      TransactionBlock,
    ]);
    this.scope = scope;
    this.block = block;
  }

  private async resetToBlock(block: number) {
    logInfo(parentPort, `Resetting to block ${block}`);
    const latestBlock = await this.getProvider().getBlockNumber();
    const statusPercentage =
      ((block - TRANSACTIONS_START_BLOCK) /
        (latestBlock - TRANSACTIONS_START_BLOCK)) *
      100;
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.RUNNING,
        message: `Resetting to block ${block}...`,
        statusPercentage,
      },
    });

    await this.resetToBlockInternal(block);

    logInfo(parentPort, "Reset to block", block, "completed");
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.COMPLETED,
        message: `Reset to block ${block} completed`,
        statusPercentage,
      },
    });
  }

  private async recalculateOwners() {
    const latestBlockDb = await getLatestTransactionsBlock(
      this.getDb().manager
    );
    const resetBlock =
      latestBlockDb > TRANSACTIONS_START_BLOCK
        ? latestBlockDb - 5000
        : latestBlockDb;

    const latestBlockChain = await this.getProvider().getBlockNumber();
    const statusPercentage =
      ((resetBlock - TRANSACTIONS_START_BLOCK) /
        (latestBlockChain - TRANSACTIONS_START_BLOCK)) *
      100;
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.RUNNING,
        message: `Recalculating owners...`,
        statusPercentage,
      },
    });
    logInfo(parentPort, "Recalculating owners...");

    logInfo(parentPort, "Resetting to block", resetBlock);

    await this.resetToBlockInternal(resetBlock);

    logInfo(parentPort, "Owner recalculation completed");
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.COMPLETED,
        message: "Owner recalculation completed",
        statusPercentage,
      },
    });
  }

  private async resetToBlockInternal(block: number) {
    const blockTimestamp = await getBlockTimestamp(
      parentPort,
      this.getProvider(),
      NAMESPACE,
      block
    );

    await this.getDb().transaction(async (manager) => {
      const transactionsRepo = manager.getRepository(Transaction);
      const blocksRepo = manager.getRepository(TransactionBlock);

      await transactionsRepo.delete({ block: MoreThan(block) });
      await blocksRepo.upsert(
        {
          id: 1,
          block,
          timestamp: Math.round(blockTimestamp.toSeconds()),
        },
        ["id"]
      );

      try {
        await recalculateTransactionOwners(manager, parentPort);
      } catch (error: any) {
        if (error instanceof OwnerDeltaError) {
          await this.findMissingTransactions(
            block,
            error.getAddress(),
            error.getContract(),
            error.getTokenId()
          );
          await recalculateTransactionOwners(manager, parentPort);
        } else {
          throw error;
        }
      }
    });
  }

  private async baseWork() {
    let fromBlock = await getLatestTransactionsBlock(this.getDb().manager);
    logInfo(parentPort, "Latest block in DB:", fromBlock);

    if (fromBlock === 0) {
      fromBlock = TRANSACTIONS_START_BLOCK;
    }

    const toBlock = await this.getProvider().getBlockNumber();
    logInfo(parentPort, "Latest block on chain:", toBlock);

    await this.getAllTransactions(
      [
        {
          contract: MEMES_CONTRACT,
          iface: new ethers.Interface(MEMES_ABI),
        },
        {
          contract: GRADIENT_CONTRACT,
          iface: new ethers.Interface(GRADIENT_ABI),
        },
        {
          contract: NEXTGEN_CONTRACT,
          iface: new ethers.Interface(NEXTGEN_ABI),
        },
        {
          contract: MEMELAB_CONTRACT,
          iface: new ethers.Interface(MEMES_ABI),
        },
      ],
      fromBlock + 1,
      toBlock
    );

    logInfo(parentPort, "Finished successfully");
  }

  async work() {
    if (this.scope === TransactionsWorkerScope.RESET_TO_BLOCK) {
      if (this.block) {
        await this.resetToBlock(this.block);
      } else {
        throw new Error("Block is required for reset to block");
      }
    } else if (this.scope === TransactionsWorkerScope.RECALCULATE_OWNERS) {
      await this.recalculateOwners();
    } else {
      await this.baseWork();
    }
  }

  private async getAllTransactions(
    contracts: { contract: string; iface: Interface }[],
    fromBlock: number,
    toBlock: number
  ) {
    logInfo(
      parentPort,
      "Blocks",
      `[${fromBlock} - ${toBlock}]`,
      "Fetching all transactions..."
    );

    let currentFromBlock = fromBlock;

    while (currentFromBlock <= toBlock) {
      const statusPercentage =
        ((currentFromBlock - TRANSACTIONS_START_BLOCK) /
          (toBlock - TRANSACTIONS_START_BLOCK)) *
        100;
      const nextToBlock = Math.min(
        currentFromBlock + this.getBlockRange(),
        toBlock
      );

      const sendUpdate = (action: string) => {
        sendStatusUpdate(parentPort, {
          update: {
            status: ScheduledWorkerStatus.RUNNING,
            message: `Syncing Blocks [${currentFromBlock} - ${toBlock}]`,
            action: action,
            statusPercentage: statusPercentage,
          },
        });
      };

      const allContractTransactions: Transaction[] = [];
      const allContractOwnerDeltas: NFTOwnerDelta[] = [];

      const printStatus = (...args: any[]) => {
        logInfo(
          parentPort,
          "Blocks",
          `[${currentFromBlock} - ${nextToBlock}]`,
          ...args
        );
      };

      for (const contract of contracts) {
        const printContractStatus = (...args: any[]) => {
          printStatus("Fetching...", `[${contract.contract}]`, ...args);
        };
        printContractStatus("Fetching...");
        sendUpdate("Getting Logs");

        const filter: Filter = {
          address: contract.contract,
          fromBlock: currentFromBlock,
          toBlock: nextToBlock,
          topics: [
            [
              this.transferTopic,
              this.transferSingleTopic,
              this.transferBatchTopic,
            ],
          ],
        };

        const logs = await this.getProvider().getLogs(filter);

        if (logs.length > 0) {
          this.setBlockRange(250);
          printContractStatus(
            "Fetched",
            logs.length.toLocaleString(),
            "Decoding..."
          );
          sendUpdate(`Decoding (${logs.length.toLocaleString()})`);
          const decodedTransactions = await this.decodeLogs(logs, contract);

          printContractStatus(
            "Decoded",
            decodedTransactions.length.toLocaleString(),
            "Finding values..."
          );
          sendUpdate(
            `Finding values (${decodedTransactions.length.toLocaleString()})`
          );

          const transactionsWithValues = await findTransactionValues(
            this.getProvider(),
            decodedTransactions,
            printContractStatus
          );

          printContractStatus(
            "Found values",
            transactionsWithValues.length.toLocaleString(),
            "Extracting owners..."
          );
          sendUpdate(
            `Extracting owners (${transactionsWithValues.length.toLocaleString()})`
          );
          const ownerDeltas = await extractNFTOwnerDeltas(
            transactionsWithValues
          );

          printContractStatus(
            "Resolved owners",
            ownerDeltas.length.toLocaleString()
          );

          allContractTransactions.push(...transactionsWithValues);
          allContractOwnerDeltas.push(...ownerDeltas);
        } else {
          this.setBlockRange(1000);
          printContractStatus("No logs");
        }
      }

      sendUpdate("Updating Database");

      const blockTimestamp = await getBlockTimestamp(
        parentPort,
        this.getProvider(),
        NAMESPACE,
        nextToBlock
      );

      const persistTransactionData = async () =>
        await persistTransactionsAndOwners(
          this.getDb(),
          allContractTransactions,
          allContractOwnerDeltas,
          nextToBlock,
          blockTimestamp.toSeconds()
        );

      try {
        await persistTransactionData();
      } catch (error) {
        if (error instanceof OwnerDeltaError) {
          sendUpdate("Owner Error - Searching for missing transactions...");
          await this.findMissingTransactions(
            currentFromBlock,
            error.getAddress(),
            error.getContract(),
            error.getTokenId()
          );
          sendUpdate("Owner Error - Recalculating...");
          await recalculateTransactionOwners(this.getDb().manager, parentPort);
          await persistTransactionData();
        } else {
          throw error;
        }
      }

      printStatus(
        "> Persisted transactions",
        allContractTransactions.length.toLocaleString()
      );
      printStatus(
        "> Persisted owners",
        allContractOwnerDeltas.length.toLocaleString()
      );
      sendUpdate("Database Updated");

      currentFromBlock = nextToBlock + 1;

      await sleep(250);
    }

    logInfo(parentPort, "Completed");

    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.COMPLETED,
        message: `Completed at ${Time.now().toLocaleDateTimeString()} - Latest Block: ${toBlock}`,
        statusPercentage: 100,
      },
    });
  }

  private async decodeLogs(
    logs: Log[],
    contract: { contract: string; iface: Interface }
  ): Promise<Transaction[]> {
    const transactionRecords: { [key: string]: Transaction } = {};

    const decodedLogPromises = logs.map((log) => {
      return this.getBottleneck().schedule(async () => {
        let decoded;
        if (log.topics[0] === this.transferSingleTopic) {
          try {
            decoded = contract.iface.decodeEventLog(
              "TransferSingle",
              log.data,
              log.topics
            );
            const key = `${log.transactionHash}-${decoded.from}-${
              decoded.to
            }-${decoded.id.toString()}`;

            const transactionDate = await getBlockTimestamp(
              parentPort,
              this.getProvider(),
              NAMESPACE,
              log.blockNumber
            );

            const decodedValue = parseInt(
              Array.from(decoded.values())[4].toString()
            );

            if (!transactionRecords[key]) {
              transactionRecords[key] = {
                transaction: log.transactionHash.toLowerCase(),
                block: log.blockNumber,
                transaction_date: Math.round(transactionDate.toSeconds()),
                from_address: decoded.from.toLowerCase(),
                to_address: decoded.to.toLowerCase(),
                contract: contract.contract.toLowerCase(),
                token_id: Number(decoded.id),
                token_count: decodedValue,
                value: 0,
                primary_proceeds: 0,
                royalties: 0,
                gas_gwei: 0,
                gas_price: 0,
                gas_price_gwei: 0,
                gas: 0,
                eth_price_usd: 0,
                value_usd: 0,
                gas_usd: 0,
              };
            } else {
              transactionRecords[key].token_count =
                transactionRecords[key].token_count + decodedValue;
            }
          } catch (error) {
            logWarn(parentPort, "Failed to decode TransferSingle log:", error);
          }
        } else if (log.topics[0] === this.transferBatchTopic) {
          try {
            decoded = contract.iface.decodeEventLog(
              "TransferBatch",
              log.data,
              log.topics
            );

            const transactionDate = await getBlockTimestamp(
              parentPort,
              this.getProvider(),
              NAMESPACE,
              log.blockNumber
            );

            for (let i = 0; i < decoded.ids.length; i++) {
              const key = `${log.transactionHash}-${decoded.from}-${
                decoded.to
              }-${decoded.ids[i].toString()}`;

              const decodedValues = Array.from(decoded.values())[4].map(
                (value: any) => parseInt(value.toString())
              );

              if (!transactionRecords[key]) {
                transactionRecords[key] = {
                  transaction: log.transactionHash.toLowerCase(),
                  block: log.blockNumber,
                  transaction_date: Math.round(transactionDate.toSeconds()),
                  from_address: decoded.from.toLowerCase(),
                  to_address: decoded.to.toLowerCase(),
                  contract: contract.contract.toLowerCase(),
                  token_id: decoded.ids[i],
                  token_count: decodedValues[i],
                  value: 0,
                  primary_proceeds: 0,
                  royalties: 0,
                  gas_gwei: 0,
                  gas_price: 0,
                  gas_price_gwei: 0,
                  gas: 0,
                  eth_price_usd: 0,
                  value_usd: 0,
                  gas_usd: 0,
                };
              } else {
                transactionRecords[key].token_count =
                  transactionRecords[key].token_count + decodedValues[i];
              }
            }
          } catch (error) {
            logWarn(
              parentPort,
              NAMESPACE,
              "[warning]",
              "Failed to decode TransferBatch log:",
              error
            );
          }
        } else if (log.topics[0] === this.transferTopic) {
          try {
            decoded = contract.iface.decodeEventLog(
              "Transfer",
              log.data,
              log.topics
            );

            const transactionDate = await getBlockTimestamp(
              parentPort,
              this.getProvider(),
              NAMESPACE,
              log.blockNumber
            );

            const from = decoded[0];
            const to = decoded[1];
            const tokenId = Number(decoded[2]);
            const tokenCount = 1;

            const key = `${
              log.transactionHash
            }-${from}-${to}-${tokenId.toString()}`;

            if (!transactionRecords[key]) {
              transactionRecords[key] = {
                transaction: log.transactionHash.toLowerCase(),
                block: log.blockNumber,
                transaction_date: Math.round(transactionDate.toSeconds()),
                from_address: decoded[0].toLowerCase(),
                to_address: decoded[1].toLowerCase(),
                contract: contract.contract.toLowerCase(),
                token_id: tokenId,
                token_count: tokenCount,
                value: 0,
                primary_proceeds: 0,
                royalties: 0,
                gas_gwei: 0,
                gas_price: 0,
                gas_price_gwei: 0,
                gas: 0,
                eth_price_usd: 0,
                value_usd: 0,
                gas_usd: 0,
              };
            } else {
              transactionRecords[key].token_count =
                transactionRecords[key].token_count + tokenCount;
            }
          } catch (error) {
            logWarn(parentPort, "Failed to decode Transfer log:", error);
          }
        }
      });
    });

    await Promise.all(decodedLogPromises);

    return Object.values(transactionRecords).sort((a, b) => {
      return a.block - b.block || a.transaction_date - b.transaction_date;
    });
  }

  private async findMissingTransactions(
    block: number,
    address: string,
    contract: string,
    tokenId: number
  ): Promise<Transaction | null> {
    const blockStep = 25_000;
    const iface = getInterface(contract);
    let currentBlock = block;

    logInfo(
      parentPort,
      "[Missing Transactions]",
      `[Address ${address}]`,
      `[${contract} - #${tokenId}]`
    );

    while (currentBlock > TRANSACTIONS_START_BLOCK) {
      const fromBlock = Math.max(
        currentBlock - blockStep,
        TRANSACTIONS_START_BLOCK
      );
      const toBlock = currentBlock;

      logInfo(
        parentPort,
        "[Missing Transactions]",
        "> Checking blocks",
        `[${fromBlock} - ${toBlock}]`
      );

      const filterFrom: Filter = {
        address: contract,
        fromBlock,
        toBlock,
        topics: [
          [
            this.transferTopic,
            this.transferSingleTopic,
            this.transferBatchTopic,
          ],
          null,
          ethers.zeroPadValue(address, 32),
          null,
        ],
      };

      const filterTo: Filter = {
        address: contract,
        fromBlock: fromBlock,
        toBlock: toBlock,
        topics: [
          [
            this.transferTopic,
            this.transferSingleTopic,
            this.transferBatchTopic,
          ],
          null,
          null,
          ethers.zeroPadValue(address, 32),
        ],
      };

      const logsFrom = await this.getProvider().getLogs(filterFrom);
      const logsTo = await this.getProvider().getLogs(filterTo);

      const uniqueLogs = [...logsFrom, ...logsTo]
        .filter((log) => {
          const first32Bytes = log.data.slice(0, 66);
          const logTokenId = BigInt(first32Bytes);
          return logTokenId === BigInt(tokenId);
        })
        .filter(
          (log, index, self) =>
            index ===
            self.findIndex((t) =>
              areEqualAddresses(t.transactionHash, log.transactionHash)
            )
        );

      if (uniqueLogs.length > 0) {
        const decodedTransactions = await this.decodeLogs(uniqueLogs, {
          contract,
          iface,
        });

        decodedTransactions.sort((a, b) => b.block - a.block);

        for (const decodedTransaction of decodedTransactions) {
          const transactionExists = await this.checkTransactionExists(
            decodedTransaction
          );

          if (!transactionExists) {
            const transactionsWithValues = await findTransactionValues(
              this.getProvider(),
              [decodedTransaction],
              () => {}
            );
            const repo = this.getDb().getRepository(Transaction);
            await repo.save(transactionsWithValues[0]);
            logInfo(
              parentPort,
              "[Missing Transactions]",
              "> Found missing transaction!",
              transactionsWithValues[0].transaction
            );
            return transactionsWithValues[0];
          }
        }
      }

      currentBlock = fromBlock;
    }

    logInfo(
      parentPort,
      "[Missing Transactions]",
      "> No missing transactions found"
    );
    return null;
  }

  private async checkTransactionExists(
    transaction: Transaction
  ): Promise<boolean> {
    const repo = this.getDb().getRepository(Transaction);
    const existingTransaction = await repo.findOne({
      where: {
        transaction: transaction.transaction,
        block: transaction.block,
        from_address: transaction.from_address,
        to_address: transaction.to_address,
        contract: transaction.contract,
        token_id: transaction.token_id,
        token_count: transaction.token_count,
      },
    });

    return !!existingTransaction;
  }
}

new TransactionsWorker(
  data.rpcUrl,
  data.dbParams,
  data.blockRange,
  data.maxConcurrentRequests,
  data.scope,
  data.block
);
