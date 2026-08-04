import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runShutdownStepWithTimeout } from "./shutdown";

describe("desktop app shutdown", () => {
  it("returns a completed shutdown step result", async () => {
    await assert.doesNotReject(
      runShutdownStepWithTimeout("completed step", async () => "done", 50),
    );
  });

  it("rejects a shutdown step that never settles", async () => {
    await assert.rejects(
      runShutdownStepWithTimeout(
        "stuck step",
        () => new Promise<never>(() => undefined),
        10,
      ),
      /stuck step timed out after 10ms/,
    );
  });

  it("preserves a shutdown step failure", async () => {
    await assert.rejects(
      runShutdownStepWithTimeout("failed step", async () => {
        throw new Error("shutdown failed");
      }),
      /shutdown failed/,
    );
  });
});
