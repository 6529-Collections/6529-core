import type { BaseTDH } from "../../../db/entities/ITDH";

type RankRow = BaseTDH & {
  wallet?: string;
  consolidation_key?: string;
  wallets?: string[];
};
type Collection = "memes" | "gradients" | "nextgen";

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function canonicalTdhIdentity(row: {
  wallet?: string;
  consolidation_key?: string;
  wallets?: string[];
}): string {
  return (
    row.consolidation_key?.toLowerCase() ??
    row.wallet?.toLowerCase() ??
    (row.wallets ?? [])
      .map((w) => w.toLowerCase())
      .sort(compareStrings)
      .join("-")
  );
}

function compareIdentity(a: RankRow, b: RankRow): number {
  return compareStrings(canonicalTdhIdentity(a), canonicalTdhIdentity(b));
}

export function compareOverallTdh(a: RankRow, b: RankRow): number {
  return (
    b.boosted_tdh - a.boosted_tdh ||
    b.tdh - a.tdh ||
    b.gradients_tdh - a.gradients_tdh ||
    b.nextgen_tdh - a.nextgen_tdh ||
    compareIdentity(a, b)
  );
}

export function compareCollectionTdh(
  collection: Collection,
  a: RankRow,
  b: RankRow,
): number {
  return (
    b[`boosted_${collection}_tdh`] - a[`boosted_${collection}_tdh`] ||
    b[`${collection}_tdh`] - a[`${collection}_tdh`] ||
    b[`${collection}_balance`] - a[`${collection}_balance`] ||
    b.balance - a.balance ||
    compareIdentity(a, b)
  );
}

export function compareMemeOwnerTdh(
  tokenId: number,
  a: RankRow,
  b: RankRow,
): number {
  const score = (row: RankRow) =>
    row.memes.find((token) => Number(token.id) === Number(tokenId))!.tdh;
  return (
    score(b) - score(a) ||
    b.boosted_tdh - a.boosted_tdh ||
    compareIdentity(a, b)
  );
}

export function compareTokenTdh(
  a: { tdh: number; id: number | string },
  b: { tdh: number; id: number | string },
): number {
  return b.tdh - a.tdh || Number(a.id) - Number(b.id);
}

export function shouldIncludeWalletTdh(
  totalTdh: number,
  totalBalance: number,
  consolidationSize: number,
): boolean {
  return totalTdh > 0 || totalBalance > 0 || consolidationSize > 1;
}
