import { MEMES_CONTRACT } from "./abis/memes";
import { areEqualAddresses } from "./helpers";

export const MEMES_EDITION_SIZE_FLOOR_CAP = 310;

export interface CalculationEditionSizeInput {
  actualSupply: number;
  editionSizeFloor?: number | null;
}

export interface MemeEditionSizeFloorRefreshNft {
  contract: string;
  id: number;
  mint_date?: number | null;
}

// These predate the backend's July 2026 floor backfill. Their final supply
// floors are confirmed by issue #241 and the backend NFT metadata. A later
// historical claim lookup can incorrectly replace them with the 310 cap.
export const MEME_CATCH_UP_FLOOR_REPAIRS = [
  { id: 206, floor: 309 },
  { id: 215, floor: 309 },
  { id: 311, floor: 303 },
] as const;

export function repairMemeCatchUpEditionSizeFloor(
  nft: Pick<MemeEditionSizeFloorRefreshNft, "contract" | "id">,
  floor: number | null,
): number | null {
  if (
    floor !== MEMES_EDITION_SIZE_FLOOR_CAP ||
    !areEqualAddresses(nft.contract, MEMES_CONTRACT)
  ) {
    return floor;
  }
  return (
    MEME_CATCH_UP_FLOOR_REPAIRS.find((repair) => repair.id === nft.id)?.floor ??
    floor
  );
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
  latestMemeIsOnChainLatest: boolean,
  nowMillis: number = Date.now(),
): number[] {
  const memes = nfts.filter((nft) =>
    areEqualAddresses(nft.contract, MEMES_CONTRACT),
  );
  if (memes.length === 0) {
    return [];
  }

  const latestMemeId = memes.reduce(
    (latest, nft) => Math.max(latest, nft.id),
    0,
  );
  const cutoffSeconds = (nowMillis - 30 * 24 * 60 * 60 * 1000) / 1000;
  const tokenIds = memes
    .filter(
      (nft) =>
        (latestMemeIsOnChainLatest && nft.id === latestMemeId) ||
        (typeof nft.mint_date === "number" && nft.mint_date >= cutoffSeconds),
    )
    .map((nft) => nft.id);
  return [...new Set(tokenIds)].sort((a, b) => a - b);
}

export async function selectMemeEditionSizeFloorRefreshIds(
  nfts: MemeEditionSizeFloorRefreshNft[],
  fetchTokenUri: (tokenId: number) => Promise<string>,
  nowMillis: number = Date.now(),
): Promise<number[]> {
  const latestMemeId = nfts
    .filter((nft) => areEqualAddresses(nft.contract, MEMES_CONTRACT))
    .reduce((latest, nft) => Math.max(latest, nft.id), 0);
  if (latestMemeId === 0) {
    return [];
  }

  let latestMemeIsOnChainLatest = false;
  try {
    // Match discovery's unused-token URI convention, but let RPC failures
    // remain unverified rather than treating them as discovery completion.
    const nextId = latestMemeId + 1;
    const uri = await fetchTokenUri(nextId);
    latestMemeIsOnChainLatest = !uri || uri === String(nextId);
  } catch {
    // Recent cards still refresh on a later-card probe failure.
  }
  return getMemeTokenIdsForEditionSizeFloorRefresh(
    nfts,
    latestMemeIsOnChainLatest,
    nowMillis,
  );
}
