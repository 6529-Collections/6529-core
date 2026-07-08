import { IpcMain } from "electron";
import { IPC_DB_CHANNELS } from "../preload-db";
import { getDb } from "./db";
import { TDHMerkleRoot, ConsolidatedTDH } from "./entities/ITDH";
import Logger from "electron-log";
import { Transaction } from "./entities/ITransaction";
import { PaginatedResponseLocal } from "../../shared/types";
import { NFT } from "./entities/INFT";
import { Brackets, type SelectQueryBuilder } from "typeorm";

interface PaginatedNftsResponseLocal extends PaginatedResponseLocal<NFT> {
  seasonOptions: number[];
}

interface FetchNftsPayload {
  readonly page?: number;
  readonly limit?: number;
  readonly contractAddress?: string;
  readonly search?: string;
  readonly season?: number;
}

const DEFAULT_NFT_PAGE = 1;
const DEFAULT_NFT_PAGE_SIZE = 50;
const MAX_NFT_PAGE_SIZE = 100;
const NFT_LIKE_ESCAPE_CLAUSE = "ESCAPE '\\'";

const coercePositiveInteger = (value: unknown, fallback: number): number => {
  const numericValue =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(1, Math.floor(numericValue));
};

const getSafeNftPagination = (
  page: unknown,
  limit: unknown,
): { page: number; limit: number } => ({
  page: coercePositiveInteger(page, DEFAULT_NFT_PAGE),
  limit: Math.min(
    coercePositiveInteger(limit, DEFAULT_NFT_PAGE_SIZE),
    MAX_NFT_PAGE_SIZE,
  ),
});

const escapeLikeSearch = (value: string): string =>
  value.replace(/[\\%_]/g, (character) => `\\${character}`);

function applyNftContractFilter(
  queryBuilder: SelectQueryBuilder<NFT>,
  contractAddress?: string,
) {
  if (!contractAddress) {
    return;
  }

  queryBuilder.andWhere("nft.contract = :contractAddress", {
    contractAddress: contractAddress.toLowerCase(),
  });
}

function applyNftSearchFilter(
  queryBuilder: SelectQueryBuilder<NFT>,
  search?: string,
) {
  const normalizedSearch = search?.trim().toLowerCase();
  if (!normalizedSearch) {
    return;
  }

  const escapedSearch = `%${escapeLikeSearch(normalizedSearch)}%`;
  queryBuilder.andWhere(
    new Brackets((qb) => {
      qb.where(`LOWER(nft.name) LIKE :search ${NFT_LIKE_ESCAPE_CLAUSE}`, {
        search: escapedSearch,
      }).orWhere(
        `CAST(nft.id AS TEXT) LIKE :search ${NFT_LIKE_ESCAPE_CLAUSE}`,
        {
          search: escapedSearch,
        },
      );
    }),
  );
}

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
    `TDH INFO: [BLOCK] ${tdhMerkle.block} [ROOT] ${tdhMerkle.merkle_root} [LAST CALCULATION] ${tdhMerkle.last_update} [TOTAL TDH] ${totalTDH}`,
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
  contractAddress?: string,
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

async function fetchNftSeasonOptions(
  contractAddress?: string,
  search?: string,
): Promise<number[]> {
  const nftRepository = getDb().getRepository(NFT);
  const queryBuilder = nftRepository
    .createQueryBuilder("nft")
    .select("DISTINCT nft.season", "season")
    .where("nft.season >= 0");

  applyNftContractFilter(queryBuilder, contractAddress);
  applyNftSearchFilter(queryBuilder, search);

  const rows = await queryBuilder
    .orderBy("nft.season", "ASC")
    .getRawMany<{ season: number | string | null }>();

  return rows
    .map((row) => Number(row.season))
    .filter((season) => Number.isInteger(season));
}

async function fetchNfts(
  page: number = 1,
  limit: number = 50,
  contractAddress?: string,
  search?: string,
  season?: number,
): Promise<PaginatedNftsResponseLocal> {
  const nftRepository = getDb().getRepository(NFT);
  const queryBuilder = nftRepository.createQueryBuilder("nft");
  const safePagination = getSafeNftPagination(page, limit);

  applyNftContractFilter(queryBuilder, contractAddress);
  applyNftSearchFilter(queryBuilder, search);

  if (Number.isInteger(season)) {
    queryBuilder.andWhere("nft.season = :season", { season });
  }

  queryBuilder
    .skip((safePagination.page - 1) * safePagination.limit)
    .take(safePagination.limit)
    .orderBy("nft.mint_date", "DESC")
    .addOrderBy("nft.id", "DESC");

  const [results, total] = await queryBuilder.getManyAndCount();
  const seasonOptions = await fetchNftSeasonOptions(contractAddress, search);

  return {
    data: results,
    total,
    page: safePagination.page,
    totalPages: Math.ceil(total / safePagination.limit),
    seasonOptions,
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
    },
  );
  ipcMain.handle(
    IPC_DB_CHANNELS.GET_TRANSACTIONS,
    async (_event, { startDate, endDate, page, limit, contractAddress }) => {
      const transactions = await fetchTransactions(
        startDate,
        endDate,
        page,
        limit,
        contractAddress,
      );
      return transactions;
    },
  );
  ipcMain.handle(
    IPC_DB_CHANNELS.GET_NFTS,
    async (_event, payload: FetchNftsPayload = {}) => {
      const { page, limit, contractAddress, search, season } = payload;
      const nfts = await fetchNfts(
        page,
        limit,
        contractAddress,
        search,
        season,
      );
      return nfts;
    },
  );
}
