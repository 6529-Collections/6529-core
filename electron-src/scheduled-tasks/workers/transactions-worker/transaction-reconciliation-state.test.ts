import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TRANSACTIONS_START_BLOCK } from "../../../../shared/types";
import { readTransactionReconciliationState } from "./transaction-reconciliation-state";

const FROM_BLOCK = TRANSACTIONS_START_BLOCK + 100;
const NEXT_BLOCK = FROM_BLOCK + 101;
const CHECKPOINT_BLOCK = FROM_BLOCK + 400;

describe("transaction reconciliation state", () => {
  it("restores a valid persisted reconciliation cursor", () => {
    assert.deepEqual(
      readTransactionReconciliationState({
        reconciliation_from_block: FROM_BLOCK,
        reconciliation_next_block: NEXT_BLOCK,
        reconciliation_checkpoint_block: CHECKPOINT_BLOCK,
      }),
      {
        fromBlock: FROM_BLOCK,
        nextBlock: NEXT_BLOCK,
        checkpointBlock: CHECKPOINT_BLOCK,
      },
    );
    assert.deepEqual(
      readTransactionReconciliationState({
        reconciliation_from_block: FROM_BLOCK,
        reconciliation_next_block: CHECKPOINT_BLOCK + 1,
        reconciliation_checkpoint_block: CHECKPOINT_BLOCK,
      }),
      {
        fromBlock: FROM_BLOCK,
        nextBlock: CHECKPOINT_BLOCK + 1,
        checkpointBlock: CHECKPOINT_BLOCK,
      },
    );
  });

  it("rejects incomplete or impossible persisted cursors", () => {
    assert.equal(
      readTransactionReconciliationState({
        reconciliation_from_block: FROM_BLOCK,
        reconciliation_next_block: null,
        reconciliation_checkpoint_block: CHECKPOINT_BLOCK,
      }),
      null,
    );
    assert.equal(
      readTransactionReconciliationState({
        reconciliation_from_block: FROM_BLOCK,
        reconciliation_next_block: CHECKPOINT_BLOCK + 1,
        reconciliation_checkpoint_block: CHECKPOINT_BLOCK - 1,
      }),
      null,
    );
    assert.equal(
      readTransactionReconciliationState({
        reconciliation_from_block: TRANSACTIONS_START_BLOCK - 1,
        reconciliation_next_block: TRANSACTIONS_START_BLOCK,
        reconciliation_checkpoint_block: TRANSACTIONS_START_BLOCK + 1,
      }),
      null,
    );
    assert.equal(
      readTransactionReconciliationState({
        reconciliation_from_block: FROM_BLOCK,
        reconciliation_next_block: FROM_BLOCK + 0.5,
        reconciliation_checkpoint_block: CHECKPOINT_BLOCK,
      }),
      null,
    );
  });
});
