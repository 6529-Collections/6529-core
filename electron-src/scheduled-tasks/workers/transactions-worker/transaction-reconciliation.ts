import type { Transaction } from "../../../db/entities/ITransaction";

export const TRANSACTION_IDENTITY_COLUMNS = [
  "transaction",
  "contract",
  "from_address",
  "to_address",
  "token_id",
] as const satisfies readonly (keyof Transaction)[];

export interface TransactionMismatch {
  local: Transaction;
  chain: Transaction;
}

export interface TransactionTokenKey {
  contract: string;
  tokenId: number;
}

export type ConfirmedRpcValue<T> =
  | { status: "present"; value: T }
  | { status: "absent" };

export interface TransactionReconciliationDiff {
  unchanged: Transaction[];
  missing: Transaction[];
  inconsistent: TransactionMismatch[];
  orphaned: Transaction[];
  affectedTokens: TransactionTokenKey[];
}

export type ReceiptTransactionClassification =
  | { status: "inconclusive" }
  | { status: "orphaned" }
  | { status: "omitted"; canonical: Transaction }
  | { status: "beyond-checkpoint"; canonical: Transaction }
  | { status: "relocated"; canonical: Transaction };

export function getTransactionIdentity(transaction: Transaction): string {
  return TRANSACTION_IDENTITY_COLUMNS.map((column) => transaction[column])
    .map((value) => value.toString().toLowerCase())
    .join(":");
}

function getTransactionDatabaseIdentity(transaction: Transaction): string {
  return TRANSACTION_IDENTITY_COLUMNS.map((column) => transaction[column])
    .map((value) => value.toString())
    .join(":");
}

export function getTransactionTokenIdentity(transaction: Transaction): string {
  return `${transaction.contract.toLowerCase()}:${transaction.token_id}`;
}

export function getTransactionTokenKeys(
  transactions: Transaction[],
): TransactionTokenKey[] {
  const tokens = new Map<string, TransactionTokenKey>();
  for (const transaction of transactions) {
    tokens.set(getTransactionTokenIdentity(transaction), {
      contract: transaction.contract.toLowerCase(),
      tokenId: Number(transaction.token_id),
    });
  }
  return Array.from(tokens.values());
}

export function hasSameChainData(
  local: Transaction,
  chain: Transaction
): boolean {
  // Value, gas, proceeds, royalties, and USD fields are enrichment data, not
  // canonical Transfer-log facts. Reconciliation refreshes them only when a
  // canonical field below requires the transaction to be repaired.
  return (
    Number(local.block) === Number(chain.block) &&
    Number(local.transaction_date) === Number(chain.transaction_date) &&
    Number(local.token_count) === Number(chain.token_count)
  );
}

export function excludeOrphansRepairedByIdentity(
  orphaned: Transaction[],
  repairs: Transaction[]
): Transaction[] {
  const repairedIdentities = new Set(
    repairs.map(getTransactionDatabaseIdentity)
  );
  return orphaned.filter(
    (transaction) =>
      !repairedIdentities.has(getTransactionDatabaseIdentity(transaction))
  );
}

export function classifyReceiptTransaction(
  localTransaction: Transaction,
  canonicalTransactions: Transaction[],
  rangeFromBlock: number,
  rangeToBlock: number,
  latestIndexedBlock: number
): ReceiptTransactionClassification {
  if (canonicalTransactions.length === 0) {
    return { status: "inconclusive" };
  }

  const canonical = canonicalTransactions.find(
    (transaction) =>
      getTransactionIdentity(transaction) ===
      getTransactionIdentity(localTransaction)
  );
  if (!canonical) {
    return { status: "orphaned" };
  }
  if (
    canonical.block >= rangeFromBlock &&
    canonical.block <= rangeToBlock
  ) {
    return { status: "omitted", canonical };
  }
  if (canonical.block > latestIndexedBlock) {
    return { status: "beyond-checkpoint", canonical };
  }
  return { status: "relocated", canonical };
}

export function isRpcLogRangeLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const rpcError = error as {
    code?: number | string;
    message?: string;
    shortMessage?: string;
    error?: { code?: number | string; message?: string };
    info?: { error?: { code?: number | string; message?: string } };
  };
  const codes = [
    rpcError.code,
    rpcError.error?.code,
    rpcError.info?.error?.code,
  ];
  if (codes.some((code) => Number(code) === -32005)) {
    return true;
  }

  const message = [
    rpcError.message,
    rpcError.shortMessage,
    rpcError.error?.message,
    rpcError.info?.error?.message,
  ]
    .filter(Boolean)
    .join(" ");
  return /too many (?:results|logs|records)|more than [\d,]+ results|response size|result limit|query returned more than|block range.{0,40}limit|limit.{0,40}block range/i.test(
    message
  );
}

export async function fetchRpcValueWithConfirmedAbsence<T>(
  fetchValue: () => Promise<T | null>,
  maxAttempts: number = 3,
  wait?: (delayMs: number) => Promise<unknown>,
): Promise<ConfirmedRpcValue<T>> {
  let confirmedAbsences = 0;
  let lastError: unknown;
  const waitForRetry =
    wait ??
    ((delayMs: number) =>
      new Promise((resolve) => setTimeout(resolve, delayMs)));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await fetchValue();
      if (value !== null) {
        return { status: "present", value };
      }
      confirmedAbsences++;
    } catch (error) {
      lastError = error;
    }

    if (attempt < maxAttempts) {
      await waitForRetry(250 * attempt);
    }
  }

  if (confirmedAbsences === maxAttempts) {
    return { status: "absent" };
  }
  if (lastError) {
    throw lastError;
  }
  throw new Error("RPC value lookup was inconclusive");
}

export function isRetryableSqliteLockError(error: unknown): boolean {
  if (
    error &&
    typeof error === "object" &&
    String((error as { code?: unknown }).code ?? "")
      .toUpperCase()
      .startsWith("SQLITE_BUSY")
  ) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /SQLITE_BUSY|database is locked|database table is locked/i.test(
    message
  );
}

export async function retryOnSqliteLock(
  operation: () => Promise<void>,
  maxRetries: number,
  delayMs: number,
  operationName: string
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await operation();
      return;
    } catch (error) {
      if (!isRetryableSqliteLockError(error)) {
        throw error;
      }
      if (attempt === maxRetries) {
        throw new Error(
          `${operationName} failed after ${maxRetries} retries due to database lock.`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw new Error(`${operationName} did not complete.`);
}

export function diffTransactions(
  chainTransactions: Transaction[],
  localTransactions: Transaction[]
): TransactionReconciliationDiff {
  const localByIdentity = new Map(
    localTransactions.map((transaction) => [
      getTransactionIdentity(transaction),
      transaction,
    ])
  );
  const chainByIdentity = new Map(
    chainTransactions.map((transaction) => [
      getTransactionIdentity(transaction),
      transaction,
    ])
  );

  const unchanged: Transaction[] = [];
  const missing: Transaction[] = [];
  const inconsistent: TransactionMismatch[] = [];
  const orphaned: Transaction[] = [];
  const affectedByIdentity = new Map<string, TransactionTokenKey>();

  const markAffected = (transaction: Transaction) => {
    affectedByIdentity.set(getTransactionTokenIdentity(transaction), {
      contract: transaction.contract.toLowerCase(),
      tokenId: Number(transaction.token_id),
    });
  };

  for (const chainTransaction of chainTransactions) {
    const localTransaction = localByIdentity.get(
      getTransactionIdentity(chainTransaction)
    );
    if (!localTransaction) {
      missing.push(chainTransaction);
      markAffected(chainTransaction);
    } else if (hasSameChainData(localTransaction, chainTransaction)) {
      unchanged.push(localTransaction);
    } else {
      inconsistent.push({
        local: localTransaction,
        chain: chainTransaction,
      });
      markAffected(localTransaction);
      markAffected(chainTransaction);
    }
  }

  for (const localTransaction of localTransactions) {
    if (!chainByIdentity.has(getTransactionIdentity(localTransaction))) {
      orphaned.push(localTransaction);
      markAffected(localTransaction);
    }
  }

  return {
    unchanged,
    missing,
    inconsistent,
    orphaned,
    affectedTokens: Array.from(affectedByIdentity.values()),
  };
}

export function hasTransactionRepairs(
  diff: TransactionReconciliationDiff
): boolean {
  return (
    diff.missing.length > 0 ||
    diff.inconsistent.length > 0 ||
    diff.orphaned.length > 0
  );
}
