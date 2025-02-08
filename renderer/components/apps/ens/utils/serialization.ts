export function serializeBigInt(value: bigint | undefined | null): string {
  if (value === undefined || value === null) return "";
  return value.toString();
}

export function safeQueryKey(key: any): any {
  if (typeof key === "bigint") return key.toString();
  if (Array.isArray(key)) return key.map(safeQueryKey);
  if (typeof key === "object" && key !== null) {
    return Object.fromEntries(
      Object.entries(key).map(([k, v]) => [k, safeQueryKey(v)])
    );
  }
  return key;
}
