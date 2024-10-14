import { ethers, Filter, Log } from "ethers";
import { parentPort, workerData } from "worker_threads";
import Logger from "electron-log";
import { MEMES_ABI, MEMES_CONTRACT } from "../../../../shared/abis/memes";
import { Time } from "../../../../renderer/helpers/time";
import pLimit from "p-limit";
import {
  getLatestTransactionsBlock,
  persistTransactionsAndOwners,
} from "./transactions-worker.db";
import { WorkerData } from "../../scheduler";
import { getWorkerDb } from "../workers.db";
import { initWorkerDb } from "../workers.db";
import { DataSource, DataSourceOptions } from "typeorm";
import { NFTOwner } from "../../../db/entities/INFTOwner";
import { Transaction } from "../../../db/entities/ITransaction";
import { findTransactionValues } from "./transaction-values";
import { sleep } from "../../../../shared/helpers";
import { extractNFTOwnerDeltas } from "./nft-owners";

const data: WorkerData = workerData;

export const NAMESPACE = "TRANSACTIONS_WORKER >";
const MAX_BLOCK_RANGE = 1000;
const MAX_CURRENT_LIMIT = 10;
const MAX_CONCURRENT_REQUESTS = pLimit(MAX_CURRENT_LIMIT);

let provider: ethers.JsonRpcProvider;
let iface: ethers.Interface;
let transferSingleTopic: string;
let transferBatchTopic: string;

let initialized = false;
let db: DataSource;

const init = async (rpcUrl: string) => {
  if (initialized) return;

  provider = new ethers.JsonRpcProvider(rpcUrl);

  iface = new ethers.Interface(MEMES_ABI);
  transferSingleTopic = ethers.id(
    "TransferSingle(address,address,address,uint256,uint256)"
  );
  transferBatchTopic = ethers.id(
    "TransferBatch(address,address,address,uint256[],uint256[])"
  );

  initialized = true;
};

async function work(dbParams: DataSourceOptions) {
  await initWorkerDb(dbParams, [Transaction, NFTOwner]);
  db = getWorkerDb();
  try {
    Logger.info(NAMESPACE, "Starting...");

    // alchemy
    await init(
      "https://eth-mainnet.alchemyapi.io/v2/nSToAcVJAdygeXyWsaRNBRvV6NRC-wz4"
    );

    // infura
    // await init("https://mainnet.infura.io/v3/ca0ac42160524b71a351c2a5e338a371");

    const fromBlock = await getLatestTransactionsBlock(db);
    Logger.info(NAMESPACE, "Latest block in DB:", fromBlock);

    const toBlock = await provider.getBlockNumber();
    Logger.info(NAMESPACE, "Latest block on chain:", toBlock);

    const transactions = await getAllERC1155Transactions(
      MEMES_CONTRACT,
      fromBlock + 1,
      toBlock
    );

    Logger.info(NAMESPACE, "Transactions:", transactions.length);
    Logger.info(NAMESPACE, "Finished successfully");
  } catch (error) {
    Logger.error(NAMESPACE, error);
    parentPort?.postMessage(
      `${NAMESPACE} Error: ${error instanceof Error ? error.message : error}`
    );
  }
}

async function getAllERC1155Transactions(
  contractAddress: string,
  fromBlock: number,
  toBlock: number
) {
  Logger.info(
    NAMESPACE,
    "Blocks",
    `[${fromBlock}-${toBlock}]`,
    "Fetching all transactions..."
  );

  let currentFromBlock = fromBlock;
  let transactions: Transaction[] = [];

  while (currentFromBlock <= toBlock) {
    const nextToBlock = Math.min(currentFromBlock + MAX_BLOCK_RANGE, toBlock);
    const printStatus = (...args: any[]) => {
      Logger.info(
        NAMESPACE,
        "Blocks",
        `[${currentFromBlock}-${nextToBlock}]`,
        ...args
      );
    };

    printStatus("> Fetching...");

    const filter: Filter = {
      address: contractAddress,
      fromBlock: BigInt(currentFromBlock),
      toBlock: BigInt(nextToBlock),
      topics: [[transferSingleTopic, transferBatchTopic]],
    };

    const logs = await provider.getLogs(filter);

    printStatus("> Fetched", logs.length.toLocaleString(), "Decoding...");

    if (logs.length > 0) {
      const decodedTransactions = await decodeLogs(
        logs,
        iface,
        contractAddress
      );

      printStatus(
        "> Decoded",
        decodedTransactions.length.toLocaleString(),
        "Finding values..."
      );

      const transactionsWithValues = await findTransactionValues(
        provider,
        decodedTransactions,
        printStatus
      );

      printStatus(
        "> Found values",
        transactionsWithValues.length.toLocaleString(),
        "Extracting owners..."
      );

      const ownerDeltas = await extractNFTOwnerDeltas(transactionsWithValues);

      printStatus("> Resolved owners", ownerDeltas.length.toLocaleString());

      await persistTransactionsAndOwners(
        db,
        transactionsWithValues,
        ownerDeltas
      );
      printStatus(
        "> Persisted transactions",
        transactionsWithValues.length.toLocaleString()
      );
      printStatus("> Persisted owners", ownerDeltas.length.toLocaleString());
      transactions = transactions.concat(transactionsWithValues);
    } else {
      printStatus("> No logs");
    }

    const completionPercentage = (
      ((nextToBlock - fromBlock) / (toBlock - fromBlock)) *
      100
    ).toFixed(2);

    printStatus(
      "> Finished",
      transactions.length.toLocaleString(),
      `(${completionPercentage}%)`
    );

    currentFromBlock = nextToBlock + 1;

    await sleep(1000);
  }

  Logger.info(NAMESPACE, "Total transactions", transactions.length);
  return transactions;
}

async function decodeLogs(
  logs: Log[],
  iface: ethers.Interface,
  contractAddress: string
): Promise<Transaction[]> {
  const transactionRecords: { [key: string]: Transaction } = {};

  const decodedLogPromises = logs.map((log) => {
    return MAX_CONCURRENT_REQUESTS(async () => {
      let decoded;
      if (log.topics[0] === transferSingleTopic) {
        try {
          decoded = iface.decodeEventLog(
            "TransferSingle",
            log.data,
            log.topics
          );
          const key = `${log.transactionHash}-${decoded.from}-${
            decoded.to
          }-${decoded.id.toString()}`;

          const transactionDate = await getTransactionDate(log.blockNumber);

          const decodedValue = parseInt(
            Array.from(decoded.values())[4].toString()
          );

          if (!transactionRecords[key]) {
            transactionRecords[key] = {
              transaction: log.transactionHash,
              block: log.blockNumber,
              transaction_date: Math.round(transactionDate.toSeconds()),
              from_address: decoded.from,
              to_address: decoded.to,
              contract: contractAddress,
              token_id: decoded.id,
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
          Logger.warn(
            NAMESPACE,
            "[warning]",
            "Failed to decode TransferSingle log:",
            error
          );
        }
      } else if (log.topics[0] === transferBatchTopic) {
        try {
          decoded = iface.decodeEventLog("TransferBatch", log.data, log.topics);

          const transactionDate = await getTransactionDate(log.blockNumber);

          for (let i = 0; i < decoded.ids.length; i++) {
            const key = `${log.transactionHash}-${decoded.from}-${
              decoded.to
            }-${decoded.ids[i].toString()}`;

            const decodedValues = Array.from(decoded.values())[4].map(
              (value: any) => parseInt(value.toString())
            );

            if (!transactionRecords[key]) {
              transactionRecords[key] = {
                transaction: log.transactionHash,
                block: log.blockNumber,
                transaction_date: Math.round(transactionDate.toSeconds()),
                from_address: decoded.from,
                to_address: decoded.to,
                contract: contractAddress,
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
          Logger.warn(
            NAMESPACE,
            "[warning]",
            "Failed to decode TransferBatch log:",
            error
          );
        }
      }
    });
  });

  await Promise.all(decodedLogPromises);

  return Object.values(transactionRecords).sort((a, b) => {
    return a.block - b.block || a.transaction_date - b.transaction_date;
  });
}

async function getTransactionDate(blockNumber: number): Promise<Time> {
  const block = await provider.getBlock(blockNumber);
  if (block) {
    return Time.seconds(block.timestamp);
  }
  Logger.warn(
    NAMESPACE,
    "[warning]",
    "Block not found for block number:",
    blockNumber
  );
  return Time.now();
}

work(data.dbParams);
