export const MEMES_EDITION_SIZE_FLOOR_CAP = 310;

export interface CalculationEditionSizeInput {
  actualSupply: number;
  editionSizeFloor?: number | null;
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
