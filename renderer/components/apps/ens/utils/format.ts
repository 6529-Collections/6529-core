import { formatEther, formatUnits } from "viem";

export function formatPrice(value: bigint | undefined | null): string {
  if (!value) return "0";
  return formatEther(value);
}

export function formatDuration(seconds: bigint | number): string {
  const days = Number(seconds) / (24 * 60 * 60);
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return `${years} year${years > 1 ? "s" : ""}`;
  }
  return `${Math.floor(days)} days`;
}
