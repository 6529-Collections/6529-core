const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const asar = require("@electron/asar");
const {
  asarHeaderHash,
  readWinAsarIntegrity,
  refreshPackedAsarIntegrity,
} = require("./asar-integrity.cjs");

const electronExe = path.join(path.dirname(require.resolve("electron/package.json")), "dist", "electron.exe");

async function makeArchive(root, files) {
  const source = path.join(root, "source");
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(source, name)), { recursive: true });
    fs.writeFileSync(path.join(source, name), content);
  }
  const archive = path.join(root, "app", "resources", "app.asar");
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  await asar.createPackage(source, archive);
  fs.rmSync(source, { recursive: true, force: true });
  return archive;
}

test("the header hash changes when the archive's files change", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "6529-integrity-"));
  try {
    const first = asarHeaderHash(await makeArchive(path.join(root, "a"), { "index.js": "1" }));
    const second = asarHeaderHash(await makeArchive(path.join(root, "b"), { "index.js": "1", "extra.js": "2" }));
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.notEqual(first, second);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test(
  "afterPack replaces a stale Windows integrity hash with the final one",
  { skip: !fs.existsSync(electronExe) && "needs Electron's Windows executable" },
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "6529-integrity-"));
    try {
      const archive = await makeArchive(root, { "index.js": "before" });
      const appOutDir = path.dirname(path.dirname(archive));
      const exePath = path.join(appOutDir, "6529 Test.exe");
      fs.copyFileSync(electronExe, exePath);
      const context = {
        electronPlatformName: "win32",
        appOutDir,
        packager: { appInfo: { productFilename: "6529 Test" } },
      };
      // electron-builder's list, then afterPack rewrites the archive.
      const { writeWinAsarIntegrity } = require("./asar-integrity.cjs");
      writeWinAsarIntegrity(exePath, { "resources\\app.asar": archive });
      const stale = readWinAsarIntegrity(exePath)[0].value;
      fs.rmSync(archive);
      await makeArchive(root, { "index.js": "before", "node_modules/next/index.js": "after" });

      refreshPackedAsarIntegrity(context);
      const list = readWinAsarIntegrity(exePath);
      assert.equal(list.length, 1);
      assert.equal(list[0].file, "resources\\app.asar");
      assert.equal(list[0].alg, "SHA256");
      assert.equal(list[0].value, asarHeaderHash(archive));
      assert.notEqual(list[0].value, stale);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test("afterPack leaves other platforms and builds without an integrity list alone", () => {
  assert.equal(refreshPackedAsarIntegrity({ electronPlatformName: "linux" }), null);
  assert.equal(refreshPackedAsarIntegrity({ electronPlatformName: "darwin" }), null);
});
