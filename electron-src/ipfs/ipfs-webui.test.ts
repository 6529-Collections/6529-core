import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ensureIpfsWebUi, IPFS_WEBUI, type WebUiSetup } from "./ipfs-webui";

test("already pinned WebUI skips archive access and import", async () => {
  const commands: readonly string[][] = [];
  await ensureIpfsWebUi({
    archivePath: "/missing/archive.car",
    runCommand: async (args) => {
      (commands as string[][]).push([...args]);
    },
    isCancelled: () => false,
    log: () => undefined,
  });
  assert.deepEqual(commands, [
    ["pin", "ls", "--type=recursive", IPFS_WEBUI.cid],
  ]);
});

test("fresh and upgraded profiles import the verified local archive and check its recursive pin", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "core-webui-test-"));
  try {
    const archivePath = path.join(directory, "ui.car");
    const content = Buffer.from("complete test archive");
    fs.writeFileSync(archivePath, content);
    const webui = {
      ...IPFS_WEBUI,
      size: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
    const commands: string[][] = [];
    const setup: WebUiSetup = {
      archivePath,
      runCommand: async (args) => {
        commands.push([...args]);
        if (commands.length === 1) throw new Error("new WebUI not pinned");
      },
      isCancelled: () => false,
      log: () => undefined,
    };
    await ensureIpfsWebUi(setup, webui);
    assert.deepEqual(commands, [
      ["pin", "ls", "--type=recursive", webui.cid],
      ["dag", "import", "--pin-roots=true", archivePath],
      ["pin", "ls", "--type=recursive", webui.cid],
    ]);
    fs.writeFileSync(archivePath, "tampered archive");
    commands.length = 0;
    await assert.rejects(
      ensureIpfsWebUi(setup, webui),
      /integrity verification/,
    );
    assert.equal(commands.length, 1, "never import a mismatched archive");
    fs.writeFileSync(archivePath, content);
    commands.length = 0;
    await assert.rejects(
      ensureIpfsWebUi(
        {
          ...setup,
          runCommand: async (args) => {
            commands.push([...args]);
            throw new Error(args[0] === "dag" ? "import failed" : "not pinned");
          },
        },
        webui,
      ),
      /import failed/,
    );
    assert.equal(commands.length, 2);
    commands.length = 0;
    await assert.rejects(
      ensureIpfsWebUi({ ...setup, isCancelled: () => true }, webui),
      /cancelled/,
    );
    assert.equal(commands.length, 1, "cancel must stop before importing");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
