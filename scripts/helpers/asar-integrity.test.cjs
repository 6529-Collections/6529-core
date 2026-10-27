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
const builderDir = path.dirname(require.resolve("electron-builder/package.json"));
const libDir = path.dirname(require.resolve("app-builder-lib/package.json", { paths: [builderDir] }));
const plist = require(require.resolve("plist", { paths: [libDir] }));

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

async function makeMacBundle(root, { enabled = true, integrity = true } = {}) {
  const contents = path.join(root, "6529 Test.app", "Contents");
  const resources = path.join(contents, "Resources");
  fs.mkdirSync(resources, { recursive: true });
  const archive = path.join(resources, "app.asar");
  fs.copyFileSync(await makeArchive(root, { "index.js": "before" }), archive);
  const info = {
    CFBundleIdentifier: "com.6529.integrity-test",
    CFBundleVersion: "0.3.16",
    CFBundleURLTypes: [{ CFBundleURLSchemes: ["stagingcore6529"] }],
    NSHighResolutionCapable: true,
    ...(integrity ? { ElectronAsarIntegrity: {
      "Resources/app.asar": { algorithm: "SHA256", hash: asarHeaderHash(archive) },
    } } : {}),
  };
  const plistPath = path.join(contents, "Info.plist");
  fs.writeFileSync(plistPath, plist.build(info));
  return {
    archive, plistPath, info,
    context: {
      electronPlatformName: "darwin",
      appOutDir: root,
      packager: {
        getResourcesDir: () => resources,
        config: { electronFuses: { enableEmbeddedAsarIntegrityValidation: enabled } },
      },
    },
  };
}

test("macOS afterPack replaces the pre-repack hash and preserves bundle metadata", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "6529-mac-integrity-"));
  try {
    const { archive, plistPath, info, context } = await makeMacBundle(root);
    const stale = info.ElectronAsarIntegrity["Resources/app.asar"].hash;
    fs.copyFileSync(await makeArchive(root, {
      "index.js": "before",
      "node_modules/next/index.js": "after",
    }), archive);
    assert.notEqual(asarHeaderHash(archive), stale);

    refreshPackedAsarIntegrity(context);
    const refreshed = plist.parse(fs.readFileSync(plistPath, "utf8"));
    assert.equal(refreshed.ElectronAsarIntegrity["Resources/app.asar"].algorithm, "SHA256");
    assert.equal(refreshed.ElectronAsarIntegrity["Resources/app.asar"].hash, asarHeaderHash(archive));
    assert.notEqual(refreshed.ElectronAsarIntegrity["Resources/app.asar"].hash, stale);
    const { ElectronAsarIntegrity: _integrity, ...metadata } = refreshed;
    const { ElectronAsarIntegrity: _oldIntegrity, ...originalMetadata } = info;
    assert.deepEqual(metadata, originalMetadata);
    assert.equal(asar.extractFile(archive, "node_modules/next/index.js").toString(), "after");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("macOS refuses to package an integrity-enabled app without its hash entry", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "6529-mac-integrity-"));
  try {
    const { context, plistPath, archive } = await makeMacBundle(root, { integrity: false });
    const before = fs.readFileSync(plistPath);
    assert.throws(() => refreshPackedAsarIntegrity(context), /missing the app.asar integrity entry/);
    assert.deepEqual(fs.readFileSync(plistPath), before);
    // An empty dictionary must fail too: otherwise the fuse still kills startup.
    fs.writeFileSync(plistPath, plist.build({ ElectronAsarIntegrity: {} }));
    assert.throws(() => refreshPackedAsarIntegrity(context), /missing the app.asar integrity entry/);
    // Missing archives must not produce a signed bundle with a fabricated hash.
    fs.writeFileSync(plistPath, plist.build({ ElectronAsarIntegrity: {
      "Resources/app.asar": { algorithm: "SHA256", hash: "stale" },
    } }));
    fs.rmSync(archive);
    assert.throws(() => refreshPackedAsarIntegrity(context), /ENOENT/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("macOS leaves explicitly non-validating builds without metadata untouched", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "6529-mac-integrity-"));
  try {
    const { context, plistPath } = await makeMacBundle(root, { enabled: false, integrity: false });
    const before = fs.readFileSync(plistPath);
    assert.equal(refreshPackedAsarIntegrity(context), null);
    assert.deepEqual(fs.readFileSync(plistPath), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("afterPack leaves platforms without ASAR integrity enforcement alone", () => {
  assert.equal(refreshPackedAsarIntegrity({ electronPlatformName: "linux" }), null);
});
