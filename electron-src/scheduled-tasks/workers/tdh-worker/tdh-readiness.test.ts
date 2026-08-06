import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getTdhCheckpointWaitingMessage } from "./tdh-readiness";

describe("TDH checkpoint readiness", () => {
  it("starts without a waiting state when both checkpoints are ready", () => {
    assert.equal(getTdhCheckpointWaitingMessage(100, 100, 101), null);
  });

  it("reports the exact Transactions checkpoint when it is behind", () => {
    assert.equal(
      getTdhCheckpointWaitingMessage(100, 98, 105),
      "Waiting for Transactions to reach block 100 — currently 98",
    );
  });

  it("reports the exact NFTDelegation checkpoint when it is behind", () => {
    assert.equal(
      getTdhCheckpointWaitingMessage(100, 105, 99),
      "Waiting for NFTDelegation to reach block 100 — currently 99",
    );
  });
});
