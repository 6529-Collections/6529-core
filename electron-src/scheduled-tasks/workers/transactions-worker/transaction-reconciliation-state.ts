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
  if (
    state.fromBlock > state.nextBlock ||
    state.fromBlock > state.checkpointBlock ||
    state.nextBlock > state.checkpointBlock + 1
  ) {
    return null;
  }
  return state;
}
