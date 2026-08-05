import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canStartScheduledWorker,
  createTdhTransactionMutationGuard,
  createTransactionMutationTdhGuard,
  getTransactionMutationBlockReason,
} from "./transaction-mutation-guard";
import type { TransactionMutationAction } from "./transaction-mutation-guard";

describe("transaction mutation guard", () => {
  it("blocks a scheduled base run while a scoped worker holds the slot", () => {
    assert.equal(canStartScheduledWorker(true, true), false);
    assert.equal(canStartScheduledWorker(false, true), true);
    assert.equal(canStartScheduledWorker(false, false), false);
  });

  const actions: Array<{
    action: TransactionMutationAction;
    label: string;
  }> = [
    { action: "reset", label: "Transaction reset" },
    { action: "recalculate-owners", label: "Ownership rebuild" },
    { action: "reconcile", label: "Transaction reconciliation" },
  ];

  for (const { action, label } of actions) {
    it(`blocks ${label.toLowerCase()} while TDH runs and permits it otherwise`, () => {
      let isTdhRunning = true;
      const guard = createTdhTransactionMutationGuard(() => isTdhRunning);

      assert.equal(
        getTransactionMutationBlockReason(action, null, guard),
        `${label} cannot start while TDH worker is running. Try again after it finishes.`,
      );

      isTdhRunning = false;
      assert.equal(
        getTransactionMutationBlockReason(action, null, guard),
        null,
      );
    });
  }

  it("preserves an existing worker availability failure", () => {
    const guard = createTdhTransactionMutationGuard(() => true);

    assert.equal(
      getTransactionMutationBlockReason(
        "reset",
        "Transactions worker is already running",
        guard,
      ),
      "Transactions worker is already running",
    );
  });

  it("blocks TDH while transaction history is being changed", () => {
    let isTransactionMutationRunning = true;
    const guard = createTransactionMutationTdhGuard(
      () => isTransactionMutationRunning,
    );

    assert.equal(
      guard(),
      "Transactions worker is changing transaction history",
    );

    isTransactionMutationRunning = false;
    assert.equal(guard(), null);
  });
});
