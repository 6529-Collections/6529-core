const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  downloadBinaries,
  downloadWebUi,
  expectedFiles,
  kuboS3Folder,
  readKuboConfig,
  verifyDownload,
} = require("../download-kubo.cjs");

const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");

test("packaging includes only the binary plus a shared WebUI archive on every platform", () => {
  const root = path.resolve(__dirname, "../..");
  for (const name of [
    "local",
    "staging",
    "production",
    "production-mac-x64",
    "production-mac-arm64",
  ]) {
    const config = JSON.parse(
      fs.readFileSync(path.join(root, `electron-builder.${name}.json`), "utf8"),
    );
    assert.ok(
      config.extraResources.some(
        (entry) =>
          entry.to === "ipfs-webui" && entry.filter.includes("ipfs-webui.car"),
      ),
      name,
    );
    const binary = config.extraResources.find(
      (entry) => entry.to === "ipfs-binaries",
    );
    assert.deepEqual(binary.filter, ["ipfs", "ipfs.exe"]);
  }
  const build = fs.readFileSync(
    path.join(root, "scripts/desktop-build-target.cjs"),
    "utf8",
  );
  assert.match(
    build,
    /"dist-mac-local"[\s\S]*?prebuild: \[\["node", \["scripts\/download-kubo.cjs", "mac"\]\]\]/,
  );
});

test("binary downloads request exact keys and do not promote partial or tampered sets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "core-kubo-download-"));
  const config = {
    version: "1.2.3",
    files: { "mac/x64/ipfs": hash("x64"), "mac/arm64/ipfs": hash("arm64") },
  };
  const requests = [];
  let tamper = true;
  try {
    const spawn = (command, args) => {
      assert.equal(command, "aws");
      assert.ok(!args.includes("--recursive"));
      requests.push(args[2]);
      const arch = args[2].includes("/x64/") ? "x64" : "arm64";
      fs.writeFileSync(args[3], tamper && arch === "arm64" ? "bad" : arch);
      return { status: 0 };
    };
    assert.throws(
      () => downloadBinaries(config, "mac", root, spawn),
      /SHA-256/,
    );
    assert.deepEqual(
      fs.readdirSync(root),
      [],
      "failed download leaves no promoted files",
    );
    tamper = false;
    downloadBinaries(config, "mac", root, spawn);
    assert.deepEqual(
      verifyDownload(config, "mac", root),
      Object.keys(config.files),
    );
    assert.ok(requests.every((key) => key.endsWith("/ipfs")));
    downloadBinaries(config, "mac", root, () => {
      throw new Error("valid cache should not download");
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("WebUI downloads are pinned, bounded, cached, and never promote corrupt archives", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "core-webui-download-"));
  const webui = { ...readKuboConfig().webui, size: 4, sha256: hash("good") };
  const config = { webui };
  let requests = 0;
  const download = async (text) =>
    downloadWebUi(config, root, async (url) => {
      assert.equal(url, webui.url);
      requests++;
      return new Response(text);
    });
  try {
    await assert.rejects(download("bad!"), /SHA-256/);
    assert.deepEqual(fs.readdirSync(root), []);
    await assert.rejects(download("oversized"), /pinned size/);
    const target = await download("good");
    assert.equal(fs.readFileSync(target, "utf8"), "good");
    const count = requests;
    await download("bad!");
    assert.equal(requests, count, "valid cache avoids network access");
    fs.writeFileSync(target, "bad!");
    await download("good");
    assert.equal(fs.readFileSync(target, "utf8"), "good");
    await assert.rejects(
      downloadWebUi(
        { webui: { ...webui, url: "http://example.com/ui" } },
        root,
      ),
      /Invalid pinned/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the bundled Kubo version lists a binary for every platform the app ships", () => {
  const config = readKuboConfig();
  assert.match(config.version, /^\d+\.\d+\.\d+$/);
  assert.equal(
    kuboS3Folder(config.version),
    `s3://6529bucket/ipfs-binaries/kubo-v${config.version}`,
  );
  assert.deepEqual(Object.keys(config.files).sort(), [
    "linux/x64/ipfs",
    "mac/arm64/ipfs",
    "mac/x64/ipfs",
    "win/arm64/ipfs.exe",
    "win/x64/ipfs.exe",
  ]);
  for (const value of Object.values(config.files))
    assert.match(value, /^[0-9a-f]{64}$/);
});

test("a download passes only with every listed binary at its recorded SHA-256", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "6529-kubo-"));
  try {
    const config = {
      version: "1.2.3",
      files: {
        "mac/x64/ipfs": hash("x64 build"),
        "mac/arm64/ipfs": hash("arm64 build"),
        "win/x64/ipfs.exe": hash("win"),
      },
    };
    assert.deepEqual(
      expectedFiles(config, "mac").map(([file]) => file),
      ["mac/x64/ipfs", "mac/arm64/ipfs"],
    );
    fs.mkdirSync(path.join(root, "mac", "x64"), { recursive: true });
    fs.mkdirSync(path.join(root, "mac", "arm64"), { recursive: true });
    fs.writeFileSync(path.join(root, "mac", "x64", "ipfs"), "x64 build");

    assert.throws(
      () => verifyDownload(config, "mac", root),
      /missing mac\/arm64\/ipfs/,
    );
    fs.writeFileSync(path.join(root, "mac", "arm64", "ipfs"), "tampered");
    assert.throws(
      () => verifyDownload(config, "mac", root),
      /mac\/arm64\/ipfs has SHA-256/,
    );
    fs.writeFileSync(path.join(root, "mac", "arm64", "ipfs"), "arm64 build");
    assert.deepEqual(verifyDownload(config, "mac", root), [
      "mac/x64/ipfs",
      "mac/arm64/ipfs",
    ]);
    assert.throws(
      () => verifyDownload(config, "linux", root),
      /lists no linux binaries/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
