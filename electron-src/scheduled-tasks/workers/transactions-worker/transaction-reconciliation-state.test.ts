import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readTransactionReconciliationState } from "./transaction-reconciliation-state";

describe("transaction reconciliation state", () => {
  it("restores a valid persisted reconciliation cursor", () => {
    assert.deepEqual(
      readTransactionReconciliationState({
        reconciliation_from_block: 100,
        reconciliation_next_block: 201,
        reconciliation_checkpoint_block: 500,
      }),
      {
        fromBlock: 100,
        nextBlock: 201,
        checkpointBlock: 500,
      },
    );
    assert.deepEqual(
      readTransactionReconciliationState({
        reconciliation_from_block: 100,
        reconciliation_next_block: 501,
        reconciliation_checkpoint_block: 500,
      }),
      {
        fromBlock: 100,
        nextBlock: 501,
        checkpointBlock: 500,
      },
    );
  });

  it("rejects incomplete or impossible persisted cursors", () => {
    assert.equal(
      readTransactionReconciliationState({
        reconciliation_from_block: 100,
        reconciliation_next_block: null,
        reconciliation_checkpoint_block: 500,
      }),
      null,
    );
    assert.equal(
      readTransactionReconciliationState({
        reconciliation_from_block: 100,
        reconciliation_next_block: 501,
        reconciliation_checkpoint_block: 499,
      }),
      null,
    );
  });
});
