export function roundDecimals(original: number, decimals: number): number {
  const exp = Math.pow(10, decimals);
  return Math.round(original * exp) / exp;
}
