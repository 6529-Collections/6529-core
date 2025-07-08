import { DataSource, In, LessThanOrEqual, Like, MoreThan } from "typeorm";
import {
  CONSOLIDATIONS_LIMIT,
  CONSOLIDATIONS_TABLE,
  TDH_BLOCKS_TABLE,
  WALLETS_TDH_TABLE,
} from "../../../../electron-constants";
import {
  areEqualAddresses,
  buildConsolidationKey,
  isNullAddress,
} from "../../../../shared/helpers";
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
import { Consolidation } from "../../../db/entities/IDelegation";

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
  const sql = `
    WITH RECURSIVE wallet_cluster(wallet1, wallet2) AS (
      -- Seed rows: any row where wallet matches either side
      SELECT 
        LOWER(wallet1) AS wallet1, 
        LOWER(wallet2) AS wallet2
      FROM ${CONSOLIDATIONS_TABLE}
      WHERE confirmed = true
        AND LOWER(?) IN (LOWER(wallet1), LOWER(wallet2))

      UNION

      -- Recursively walk connected edges
      SELECT 
        LOWER(c.wallet1) AS wallet1, 
        LOWER(c.wallet2) AS wallet2
      FROM ${CONSOLIDATIONS_TABLE} c
      INNER JOIN wallet_cluster wc
        ON LOWER(c.wallet1) = wc.wallet2
        OR LOWER(c.wallet2) = wc.wallet1
        OR LOWER(c.wallet1) = wc.wallet1
        OR LOWER(c.wallet2) = wc.wallet2
      WHERE c.confirmed = true
    )
    SELECT DISTINCT
      LOWER(wallet1) AS wallet1,
      LOWER(wallet2) AS wallet2,
      block,
      created_at
    FROM ${CONSOLIDATIONS_TABLE}
    WHERE confirmed = true
      AND (
        LOWER(wallet1) IN (
          SELECT wallet1 FROM wallet_cluster
          UNION
          SELECT wallet2 FROM wallet_cluster
        )
        OR
        LOWER(wallet2) IN (
          SELECT wallet1 FROM wallet_cluster
          UNION
          SELECT wallet2 FROM wallet_cluster
        )
      )
    ORDER BY block DESC
  `;

  const params = [wallet.toLowerCase()];

  return { sql, params };
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
): string[] {
  const clusters = extractConsolidations(consolidations);
  const walletCluster = clusters.find((c) =>
    c.some((w) => areEqualAddresses(w, wallet))
  );
  if (walletCluster) {
    return walletCluster;
  }
  return [wallet];
}

function extractConsolidations(consolidations: Consolidation[]): string[][] {
  // Sort by block descending
  consolidations.sort((a, b) => b.block - a.block);

  const usedWallets = new Set<string>();
  const clusters: string[][] = [];

  // Create a quick lookup of all direct consolidations
  const consolidationSet = new Set<string>();
  for (const c of consolidations) {
    consolidationSet.add(buildConsolidationKey([c.wallet1, c.wallet2]));
  }

  // Convert consolidations into a queue
  const queue = [...consolidations];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const { wallet1, wallet2 } = current;

    if (usedWallets.has(wallet1) || usedWallets.has(wallet2)) {
      continue;
    }

    const cluster = new Set<string>();
    cluster.add(wallet1);
    cluster.add(wallet2);

    let changed = true;

    // Keep trying to expand this cluster
    while (changed && cluster.size < CONSOLIDATIONS_LIMIT) {
      changed = false;

      for (let i = 0; i < queue.length; i++) {
        const candidate = queue[i];
        const { wallet1: w1, wallet2: w2 } = candidate;

        let newWallet: string | null = null;

        if (cluster.has(w1) && !cluster.has(w2) && !usedWallets.has(w2)) {
          newWallet = w2;
        } else if (
          cluster.has(w2) &&
          !cluster.has(w1) &&
          !usedWallets.has(w1)
        ) {
          newWallet = w1;
        }

        if (newWallet) {
          const safeWallet = newWallet.toLowerCase();
          const allConnectionsExist = Array.from(cluster).every((existing) =>
            consolidationSet.has(buildConsolidationKey([existing, safeWallet]))
          );

          if (allConnectionsExist) {
            cluster.add(safeWallet);
            queue.splice(i, 1);
            changed = true;
            break;
          }
        }
      }
    }

    // finalize cluster
    const clusterArray = Array.from(cluster);
    for (const w of clusterArray) {
      usedWallets.add(w);
    }
    clusters.push(clusterArray);
  }

  // Any wallets left out entirely? Add them as singletons.
  const allWallets = new Set<string>();
  for (const c of consolidations) {
    allWallets.add(c.wallet1);
    allWallets.add(c.wallet2);
  }

  for (const w of Array.from(allWallets)) {
    if (!usedWallets.has(w)) {
      clusters.push([w]);
      usedWallets.add(w);
    }
  }

  return clusters;
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
