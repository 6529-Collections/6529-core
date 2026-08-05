import type { Transaction } from "../../../db/entities/ITransaction";

export interface TransactionMismatch {
  local: Transaction;
  chain: Transaction;
}

export interface TransactionTokenKey {
  contract: string;
  tokenId: number;
}

export interface TransactionReconciliationDiff {
  unchanged: Transaction[];
  missing: Transaction[];
  inconsistent: TransactionMismatch[];
  orphaned: Transaction[];
  affectedTokens: TransactionTokenKey[];
}

export function getTransactionIdentity(transaction: Transaction): string {
  return [
    transaction.transaction,
    transaction.contract,
    transaction.from_address,
    transaction.to_address,
    transaction.token_id,
  ]
    .map((value) => value.toString().toLowerCase())
    .join(":");
}

export function getTransactionTokenIdentity(transaction: Transaction): string {
  return `${transaction.contract.toLowerCase()}:${transaction.token_id}`;
}

function hasSameChainData(local: Transaction, chain: Transaction): boolean {
  return (
    Number(local.block) === Number(chain.block) &&
    Number(local.transaction_date) === Number(chain.transaction_date) &&
    Number(local.token_count) === Number(chain.token_count)
  );
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
