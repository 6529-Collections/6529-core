import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTdhTransactionMutationGuard,
  getTransactionMutationBlockReason,
} from "./transaction-mutation-guard";
import type { TransactionMutationAction } from "./transaction-mutation-guard";

describe("transaction mutation guard", () => {
  const actions: Array<{
    action: TransactionMutationAction;
    label: string;
  }> = [
    { action: "reset", label: "Transaction reset" },
    { action: "recalculate-owners", label: "Owner recalculation" },
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
});
