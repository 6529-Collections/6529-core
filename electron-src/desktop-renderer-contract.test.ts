import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

describe("desktop renderer contract", () => {
  it("preserves secure desktop auth and an escapable auth prompt", () => {
    const repositoryRoot = path.resolve(__dirname, "..");
    const result = spawnSync(
      process.execPath,
      [path.join(repositoryRoot, "scripts/assert-desktop-renderer-contract.cjs")],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
      }
    );

    assert.equal(
      result.status,
      0,
      [result.stdout, result.stderr].filter(Boolean).join("\n")
    );
  });
});
