import assert from "node:assert/strict";
import { it } from "node:test";
import { summarizeWorkerError } from "./worker-error-summary";

it("uses the concise ethers reason without changing the full logged error", () => {
  const message = `missing revert data (action="call", transaction={"data":"0x${"0".repeat(1000)}"})`;
  const error = Object.assign(new Error(message), {
    shortMessage: "missing revert data",
  });
  const stack = error.stack;
  assert.equal(summarizeWorkerError(error), "missing revert data");
  assert.equal(error.message, message);
  assert.equal(error.stack, stack);
});

it("retains useful generic errors while bounding long and multiline diagnostics", () => {
  assert.equal(
    summarizeWorkerError(
      new Error(
        "Delegation state snapshot is no longer recent; retry to resume",
      ),
    ),
    "Delegation state snapshot is no longer recent; retry to resume",
  );
  assert.equal(
    summarizeWorkerError(new Error("RPC unavailable\nfull diagnostic details")),
    "RPC unavailable",
  );
  const result = summarizeWorkerError(
    new Error(`RPC failed: 0x${"a".repeat(1000)}`),
  );
  assert.ok(result.startsWith("RPC failed: 0x"));
  assert.ok(result.endsWith("…"));
  assert.ok(result.length <= 240);
});

it("falls back safely for empty or non-string RPC summaries and thrown strings", () => {
  assert.equal(
    summarizeWorkerError({ shortMessage: " ", message: "Connection refused" }),
    "Connection refused",
  );
  assert.equal(
    summarizeWorkerError({ shortMessage: 123, message: "Connection refused" }),
    "Connection refused",
  );
  assert.equal(
    summarizeWorkerError("Connection refused"),
    "Connection refused",
  );
  assert.equal(summarizeWorkerError(null), "Worker failed");
});
