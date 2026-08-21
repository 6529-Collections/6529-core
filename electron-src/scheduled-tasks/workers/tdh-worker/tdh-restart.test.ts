import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getTdhRestartAction } from "./tdh-restart";

describe("TDH restart behavior", () => {
  it("reruns an interrupted TDH calculation when the worker is enabled", () => {
    assert.equal(getTdhRestartAction(true, true), "rerun");
  });

  it("keeps an interrupted TDH calculation pending without an RPC provider", () => {
    assert.equal(getTdhRestartAction(true, false), "defer");
  });

  it("does not start TDH automatically when no run was interrupted", () => {
    assert.equal(getTdhRestartAction(false, true), "none");
  });
});
