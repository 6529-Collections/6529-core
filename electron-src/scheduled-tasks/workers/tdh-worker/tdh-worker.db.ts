import { DataSource, In, LessThanOrEqual, Like, MoreThan } from "typeorm";
import {
  CONSOLIDATIONS_LIMIT,
  CONSOLIDATIONS_TABLE,
  TDH_BLOCKS_TABLE,
  WALLETS_TDH_TABLE,
} from "../../../../constants";
import { areEqualAddresses, isNullAddress } from "../../../../shared/helpers";
import { Transaction } from "../../../db/entities/ITransaction";
import {
  ConsolidatedTDH,
  TDH,
  TDHBlock,
  TDHMerkleRoot,
} from "../../../db/entities/ITDH";
import { Time } from "../../../../shared/time";
import { NFT } from "../../../db/entities/INFT";
import { batchSave } from "../../worker-helpers";
import { getMerkleRoot } from "./tdh-worker.merkle";

export async function fetchAllConsolidationAddresses(db: DataSource) {
  const sql = `SELECT wallet FROM (
      SELECT wallet1 AS wallet FROM consolidations WHERE confirmed = 1
      UNION
      SELECT wallet2 AS wallet FROM consolidations WHERE confirmed = 1
  ) AS unique_wallets;`;

  const results = await db.query(sql);
  return results;
}

export function getConsolidationsSql(wallet: string) {
  const sql = `SELECT * FROM ${CONSOLIDATIONS_TABLE} 
    WHERE 
      (wallet1 = ? OR wallet2 = ?
      OR wallet1 IN (SELECT wallet2 FROM consolidations WHERE wallet1 = ? AND confirmed = true)
      OR wallet2 IN (SELECT wallet1 FROM consolidations WHERE wallet2 = ? AND confirmed = true)
      OR wallet2 IN (SELECT wallet2 FROM consolidations WHERE wallet1 = ? AND confirmed = true)
      OR wallet1 IN (SELECT wallet1 FROM consolidations WHERE wallet2 = ? AND confirmed = true)
      )
      AND confirmed = true
    ORDER BY block DESC`;

  const params = [wallet, wallet, wallet, wallet, wallet, wallet];

  return {
    sql,
    params,
  };
}

export async function retrieveWalletConsolidations(
  db: DataSource,
  wallet: string
) {
  const { sql, params } = getConsolidationsSql(wallet);
  const consolidations: any[] = await db.query(sql, params);
  return extractConsolidationWallets(consolidations, wallet);
}

export function extractConsolidationWallets(
  consolidations: any[],
  wallet: string
) {
  const uniqueWallets: string[] = [];
  const seenWallets = new Set();

  consolidations.forEach((consolidation) => {
    if (!seenWallets.has(consolidation.wallet1)) {
      seenWallets.add(consolidation.wallet1);
      const shouldAdd = shouldAddConsolidation(
        uniqueWallets,
        consolidations,
        consolidation.wallet1
      );
      if (shouldAdd) {
        uniqueWallets.push(consolidation.wallet1);
        if (uniqueWallets.length === CONSOLIDATIONS_LIMIT) return;
      }
    }
    if (!seenWallets.has(consolidation.wallet2)) {
      seenWallets.add(consolidation.wallet2);
      const shouldAdd = shouldAddConsolidation(
        uniqueWallets,
        consolidations,
        consolidation.wallet2
      );
      if (shouldAdd) {
        uniqueWallets.push(consolidation.wallet2);
        if (uniqueWallets.length === CONSOLIDATIONS_LIMIT) return;
      }
    }
  });

  if (uniqueWallets.some((w) => areEqualAddresses(w, wallet))) {
    return uniqueWallets.sort((a, b) => a.localeCompare(b));
  }

  return [wallet];
}

function shouldAddConsolidation(
  uniqueWallets: any[],
  consolidations: any[],
  wallet: string
) {
  let hasConsolidationsWithAll = true;
  uniqueWallets.forEach((w) => {
    if (
      !consolidations.some(
        (c) =>
          (areEqualAddresses(c.wallet1, w) &&
            areEqualAddresses(c.wallet2, wallet)) ||
          (areEqualAddresses(c.wallet2, w) &&
            areEqualAddresses(c.wallet1, wallet))
      )
    ) {
      hasConsolidationsWithAll = false;
    }
  });
  return hasConsolidationsWithAll;
}

export async function fetchWalletTransactions(
  db: DataSource,
  contracts: string[],
  wallet: string,
  block: number
): Promise<Transaction[]> {
  const where: any[] = [
    {
      contract: In(contracts),
      block: LessThanOrEqual(block),
      to_address: wallet,
    },
  ];
  if (!isNullAddress(wallet)) {
    where.push({
      contract: In(contracts),
      block: LessThanOrEqual(block),
      from_address: wallet,
    });
  }
  return await db.getRepository(Transaction).find({
    where,
  });
}

export function parseTdhDataFromDB(d: any) {
  if (d.memes) {
    d.memes = JSON.parse(d.memes);
  }
  if (d.memes_ranks) {
    d.memes_ranks = JSON.parse(d.memes_ranks);
  }
  if (d.gradients) {
    d.gradients = JSON.parse(d.gradients);
  }
  if (d.gradients_ranks) {
    d.gradients_ranks = JSON.parse(d.gradients_ranks);
  }
  if (d.nextgen) {
    d.nextgen = JSON.parse(d.nextgen);
  }
  if (d.nextgen_ranks) {
    d.nextgen_ranks = JSON.parse(d.nextgen_ranks);
  }
  if (d.wallets) {
    if (!Array.isArray(d.wallets)) {
      d.wallets = JSON.parse(d.wallets);
    }
  }
  if (d.boost_breakdown) {
    d.boost_breakdown = JSON.parse(d.boost_breakdown);
  }
  return d;
}

export async function fetchTDHForBlock(db: DataSource, block: number) {
  const sql = `SELECT ${WALLETS_TDH_TABLE}.* FROM ${WALLETS_TDH_TABLE} WHERE block=?;`;
  const results = await db.query(sql, [block]);
  const parsed = results.map((r: any) => parseTdhDataFromDB(r));
  return parsed;
}

export async function persistTDH(
  db: DataSource,
  block: number,
  tdh: TDH[],
  wallets?: string[]
) {
  await db.transaction(async (manager) => {
    const tdhRepo = manager.getRepository(TDH);
    if (wallets) {
      await Promise.all(
        wallets.map(async (wallet) => {
          await tdhRepo.delete({
            wallet: wallet.toLowerCase(),
            block: block,
          });
        })
      );
    } else {
      await tdhRepo.clear();
    }

    await batchSave(tdhRepo, tdh);
  });
}

async function computeMerkleRoot(db: DataSource) {
  type PartialConsolidatedTDH = Pick<
    ConsolidatedTDH,
    "consolidation_key" | "boosted_tdh"
  >;
  const data = (await db.getRepository(ConsolidatedTDH).find({
    select: ["consolidation_key", "boosted_tdh"],
    where: { boosted_tdh: MoreThan(0) },
    order: {
      boosted_tdh: "DESC",
      consolidation_key: "ASC",
    },
  })) as PartialConsolidatedTDH[];

  const merkleRoot = getMerkleRoot(
    data.map((item) => ({
      key: item.consolidation_key,
      value: item.boosted_tdh,
    }))
  );

  return merkleRoot;
}

export async function persistTDHBlock(
  db: DataSource,
  block: number,
  blockTimestamp: Time
) {
  const merkleRoot = await computeMerkleRoot(db);
  await db.transaction(async (manager) => {
    const timestamp = blockTimestamp.toSeconds();
    await manager
      .getRepository(TDHBlock)
      .upsert([{ block, timestamp }], ["block"]);

    await manager.getRepository(TDHMerkleRoot).upsert(
      [
        {
          id: 1,
          block,
          timestamp,
          merkle_root: merkleRoot,
          last_update: Math.floor(Date.now() / 1000),
        },
      ],
      ["id"]
    );
  });

  return merkleRoot;
}

export async function fetchAllConsolidatedTdh(db: DataSource) {
  const tdh = await db.getRepository(ConsolidatedTDH).find();
  return tdh;
}

export async function fetchAllTDH(
  db: DataSource,
  block: number,
  wallets?: string[]
) {
  let sql = `SELECT * FROM ${WALLETS_TDH_TABLE} WHERE block=? `;
  const params: any[] = [block];

  if (wallets && wallets.length > 0) {
    const placeholders = wallets.map(() => "?").join(", ");
    sql += `AND ${WALLETS_TDH_TABLE}.wallet IN (${placeholders})`;
    params.push(...wallets);
  }

  const results = await db.query(sql, params);
  return results.map(parseTdhDataFromDB);
}

export async function fetchLatestTDHBlockNumber(
  db: DataSource
): Promise<number> {
  const sql = `SELECT block FROM ${TDH_BLOCKS_TABLE} order by block desc limit 1;`;
  const r = await db.query(sql);
  return r.length > 0 ? r[0].block : 0;
}

export async function persistConsolidatedTDH(
  db: DataSource,
  tdh: ConsolidatedTDH[],
  wallets?: string[]
) {
  await db.transaction(async (manager) => {
    const tdhRepo = manager.getRepository(ConsolidatedTDH);
    if (wallets) {
      await Promise.all(
        wallets.map(async (wallet) => {
          const walletPattern = `%${wallet}%`;
          await tdhRepo.delete({
            consolidation_key: Like(walletPattern),
          });
        })
      );
    } else {
      await tdhRepo.clear();
    }

    await batchSave(tdhRepo, tdh);
  });
}

export async function persistNFTs(db: DataSource, nfts: NFT[]) {
  const distinctContracts = [...new Set(nfts.map((nft) => nft.contract))];
  await db.transaction(async (manager) => {
    const nftRepo = manager.getRepository(NFT);
    await nftRepo.delete({
      contract: In(distinctContracts),
    });
    await batchSave(nftRepo, nfts);
  });
}
