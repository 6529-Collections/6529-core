export const MIN_TRANSACTION_HASH_SEARCH_LENGTH = 4;
export const MAX_TRANSACTION_HASH_SEARCH_LENGTH = 64;

export interface TransactionHashSearch {
  readonly match: "exact" | "contains";
  readonly normalizedHash: string;
}

export const parseTransactionHashSearch = (
  value: string,
): TransactionHashSearch | undefined => {
  const trimmedValue = value.trim().toLowerCase();
  const normalizedHash = trimmedValue.startsWith("0x")
    ? trimmedValue.slice(2)
    : trimmedValue;

  if (
    normalizedHash.length < MIN_TRANSACTION_HASH_SEARCH_LENGTH ||
    normalizedHash.length > MAX_TRANSACTION_HASH_SEARCH_LENGTH ||
    !/^[a-f0-9]+$/.test(normalizedHash)
  ) {
    return undefined;
  }

  return {
    match:
      normalizedHash.length === MAX_TRANSACTION_HASH_SEARCH_LENGTH
        ? "exact"
        : "contains",
    normalizedHash,
  };
};
