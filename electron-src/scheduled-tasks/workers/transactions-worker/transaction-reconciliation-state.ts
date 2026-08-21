import { TRANSACTIONS_START_BLOCK } from "../../../../shared/types";

export interface TransactionReconciliationState {
  fromBlock: number;
  nextBlock: number;
  checkpointBlock: number;
}

interface PersistedTransactionReconciliationState {
  reconciliation_from_block: number | null;
  reconciliation_next_block: number | null;
  reconciliation_checkpoint_block: number | null;
}

export function isValidTransactionReconciliationState(
  state: TransactionReconciliationState,
): boolean {
  return (
    Number.isInteger(state.fromBlock) &&
    Number.isInteger(state.nextBlock) &&
    Number.isInteger(state.checkpointBlock) &&
    state.fromBlock >= TRANSACTIONS_START_BLOCK &&
    state.fromBlock <= state.nextBlock &&
    state.fromBlock <= state.checkpointBlock &&
    state.nextBlock <= state.checkpointBlock + 1
  );
}

export function readTransactionReconciliationState(
  block: PersistedTransactionReconciliationState | null,
): TransactionReconciliationState | null {
  if (
    !block ||
    !Number.isInteger(block.reconciliation_from_block) ||
    !Number.isInteger(block.reconciliation_next_block) ||
    !Number.isInteger(block.reconciliation_checkpoint_block)
  ) {
    return null;
  }

  const state = {
    fromBlock: Number(block.reconciliation_from_block),
    nextBlock: Number(block.reconciliation_next_block),
    checkpointBlock: Number(block.reconciliation_checkpoint_block),
  };
  return isValidTransactionReconciliationState(state) ? state : null;
}
