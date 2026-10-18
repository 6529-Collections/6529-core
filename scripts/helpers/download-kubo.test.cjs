const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { expectedFiles, kuboS3Folder, readKuboConfig, verifyDownload } = require("../download-kubo.cjs");

const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");

test("the bundled Kubo version lists a binary for every platform the app ships", () => {
  const config = readKuboConfig();
  assert.match(config.version, /^\d+\.\d+\.\d+$/);
  assert.equal(kuboS3Folder(config.version), `s3://6529bucket/ipfs-binaries/kubo-v${config.version}`);
  assert.deepEqual(
    Object.keys(config.files).sort(),
    ["linux/x64/ipfs", "mac/arm64/ipfs", "mac/x64/ipfs", "win/arm64/ipfs.exe", "win/x64/ipfs.exe"],
  );
  for (const value of Object.values(config.files)) assert.match(value, /^[0-9a-f]{64}$/);
});

test("a download passes only with every listed binary at its recorded SHA-256", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "6529-kubo-"));
  try {
    const config = {
      version: "1.2.3",
      files: { "mac/x64/ipfs": hash("x64 build"), "mac/arm64/ipfs": hash("arm64 build"), "win/x64/ipfs.exe": hash("win") },
    };
    assert.deepEqual(expectedFiles(config, "mac").map(([file]) => file), ["mac/x64/ipfs", "mac/arm64/ipfs"]);
    fs.mkdirSync(path.join(root, "mac", "x64"), { recursive: true });
    fs.mkdirSync(path.join(root, "mac", "arm64"), { recursive: true });
    fs.writeFileSync(path.join(root, "mac", "x64", "ipfs"), "x64 build");

    assert.throws(() => verifyDownload(config, "mac", root), /missing mac\/arm64\/ipfs/);
    fs.writeFileSync(path.join(root, "mac", "arm64", "ipfs"), "tampered");
    assert.throws(() => verifyDownload(config, "mac", root), /mac\/arm64\/ipfs has SHA-256/);
    fs.writeFileSync(path.join(root, "mac", "arm64", "ipfs"), "arm64 build");
    assert.deepEqual(verifyDownload(config, "mac", root), ["mac/x64/ipfs", "mac/arm64/ipfs"]);
    assert.throws(() => verifyDownload(config, "linux", root), /lists no linux binaries/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
