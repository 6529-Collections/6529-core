import { IpcMain } from "electron";
import { IPC_DB_CHANNELS } from "../preload-db";
import { getDb } from "./db";
import { TDHMerkleRoot, ConsolidatedTDH } from "./entities/ITDH";
import Logger from "electron-log";
import { Transaction } from "./entities/ITransaction";
import { PaginatedResponseLocal } from "../../shared/types";

async function fetchTdhInfo() {
  const tdhMerkle = await getDb().getRepository(TDHMerkleRoot).findOneBy({
    id: 1,
  });

  if (!tdhMerkle) {
    return undefined;
  }

  const totalTDH = await getDb()
    .getRepository(ConsolidatedTDH)
    .sum("boosted_tdh");

  if (!totalTDH) {
    return undefined;
  }

  Logger.info(
    `TDH INFO: [BLOCK] ${tdhMerkle.block} [ROOT] ${tdhMerkle.merkle_root} [LAST CALCULATION] ${tdhMerkle.last_update} [TOTAL TDH] ${totalTDH}`
  );

  return {
    block: tdhMerkle.block,
    blockTimestamp: tdhMerkle.timestamp,
    merkleRoot: tdhMerkle.merkle_root,
    lastCalculation: tdhMerkle.last_update,
    totalTDH,
  };
}

async function fetchTdhInfoForKey(key: string) {
  Logger.info(`Fetching TDH info for key: ${key}`);

  const addressTDH = await getDb().getRepository(ConsolidatedTDH).findOneBy({
    consolidation_key: key,
  });

  if (!addressTDH) {
    return undefined;
  }

  return addressTDH;
}

async function fetchTransactions(
  startDate?: number,
  endDate?: number,
  page: number = 1,
  limit: number = 50,
  contractAddress?: string
): Promise<PaginatedResponseLocal<Transaction>> {
  const transactionRepository = getDb().getRepository(Transaction);

  const queryBuilder = transactionRepository.createQueryBuilder("transaction");

  if (startDate) {
    queryBuilder.andWhere("transaction.transaction_date >= :startDate", {
      startDate,
    });
  }
  if (endDate) {
    queryBuilder.andWhere("transaction.transaction_date <= :endDate", {
      endDate,
    });
  }

  if (contractAddress) {
    queryBuilder.andWhere("transaction.contract = :contractAddress", {
      contractAddress: contractAddress.toLowerCase(),
    });
  }

  // Apply pagination
  queryBuilder
    .skip((page - 1) * limit)
    .take(limit)
    .orderBy("transaction.transaction_date", "DESC");

  // Execute query
  const [results, total] = await queryBuilder.getManyAndCount();

  return {
    data: results,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export function registerIpcHandlers(ipcMain: IpcMain) {
  ipcMain.handle(IPC_DB_CHANNELS.GET_TDH_INFO, async (_event) => {
    const tdhInfo = await fetchTdhInfo();
    return tdhInfo;
  });
  ipcMain.handle(
    IPC_DB_CHANNELS.GET_TDH_INFO_FOR_KEY,
    async (_event, key: string) => {
      const tdhInfo = await fetchTdhInfoForKey(key);
      return tdhInfo;
    }
  );
  ipcMain.handle(
    IPC_DB_CHANNELS.GET_TRANSACTIONS,
    async (_event, { startDate, endDate, page, limit, contractAddress }) => {
      console.log("getting", startDate, endDate, page, limit, contractAddress);
      const transactions = await fetchTransactions(
        startDate,
        endDate,
        page,
        limit,
        contractAddress
      );
      return transactions;
    }
  );
}
