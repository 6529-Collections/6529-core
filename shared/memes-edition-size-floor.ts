import { MEMES_CONTRACT } from "./abis/memes";
import { areEqualAddresses } from "./helpers";
import { Time } from "./time";

export const MEMES_EDITION_SIZE_FLOOR_CAP = 310;
export const MEMES_EDITION_SIZE_FLOOR_REFRESH_WINDOW_MS =
  Time.days(30).toMillis();

export interface CalculationEditionSizeInput {
  actualSupply: number;
  editionSizeFloor?: number | null;
}

export interface MemeEditionSizeFloorRefreshNft {
  contract: string;
  id: number;
  mint_date?: number | null;
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value === "bigint") {
    if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
    return Number(value);
  }

  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

export function getMemeEditionSizeFloor(
  claimMaxEditionSize: unknown,
): number | null {
  const claimMax = normalizePositiveInteger(claimMaxEditionSize);
  return claimMax === null
    ? null
    : Math.min(claimMax, MEMES_EDITION_SIZE_FLOOR_CAP);
}

export function getCalculationEditionSize({
  actualSupply,
  editionSizeFloor,
}: CalculationEditionSizeInput): number {
  return Math.max(
    normalizePositiveInteger(actualSupply) ?? 0,
    normalizePositiveInteger(editionSizeFloor) ?? 0,
  );
}

export function calculateHodlRate(
  maxSupply: number,
  calculationEditionSize: number,
): number {
  const rate = maxSupply / calculationEditionSize;
  return !Number.isFinite(rate) || rate < 1 ? 1 : rate;
}

export function getMemeTokenIdsForEditionSizeFloorRefresh(
  nfts: MemeEditionSizeFloorRefreshNft[],
  nowMillis: number = Time.currentMillis(),
): number[] {
  const memes = nfts.filter((nft) =>
    areEqualAddresses(nft.contract, MEMES_CONTRACT),
  );
  if (memes.length === 0) {
    return [];
  }

  const refreshCutoff =
    nowMillis - MEMES_EDITION_SIZE_FLOOR_REFRESH_WINDOW_MS;
  const latestMemeId = memes.reduce(
    (latest, nft) => Math.max(latest, nft.id),
    0,
  );
  const tokenIds = new Set<number>([latestMemeId]);

  memes.forEach((nft) => {
    const mintMillis = Number(nft.mint_date) * 1000;
    if (Number.isFinite(mintMillis) && mintMillis >= refreshCutoff) {
      tokenIds.add(nft.id);
    }
  });

  return Array.from(tokenIds).sort((a, b) => a - b);
}
