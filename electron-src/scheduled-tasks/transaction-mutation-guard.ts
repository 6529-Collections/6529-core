export type WorkerStartGuard = () => string | null;

export type TransactionMutationAction =
  | "reset"
  | "recalculate-owners"
  | "reconcile";

const TRANSACTION_MUTATION_LABELS: Record<TransactionMutationAction, string> = {
  reset: "Transaction reset",
  "recalculate-owners": "Ownership rebuild",
  reconcile: "Transaction reconciliation",
};

export function createTdhTransactionMutationGuard(
  isTdhRunning: () => boolean,
): WorkerStartGuard {
  return () => (isTdhRunning() ? "TDH worker is running" : null);
}

export function getTransactionMutationBlockReason(
  action: TransactionMutationAction,
  unavailableReason: string | null,
  mutationGuard: WorkerStartGuard | null,
): string | null {
  if (unavailableReason) {
    return unavailableReason;
  }

  const blockedReason = mutationGuard?.();
  return blockedReason
    ? `${TRANSACTION_MUTATION_LABELS[action]} cannot start while ${blockedReason}. Try again after it finishes.`
    : null;
}
