const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { test } = require("node:test");
const asar = require("@electron/asar");
const { getUnpackedPaths, repackAsar } = require("./repack-asar.cjs");
const {
  BUILD_CACHE_PATHS,
  assertNoPackagedBuildCache,
} = require("./packaged-build-cache.cjs");
const builderRequire = createRequire(require.resolve("electron-builder"));
const { FileMatcher } = builderRequire("app-builder-lib/out/fileMatcher");

test("all desktop packaging filters exclude build caches while retaining runtime assets", () => {
  const root = path.resolve(__dirname, "../..");
  const configs = fs
    .readdirSync(root)
    .filter((name) => /^electron-builder.*\.json$/.test(name));
  assert.ok(configs.length > 0);
  for (const configName of configs) {
    const config = JSON.parse(
      fs.readFileSync(path.join(root, configName), "utf8"),
    );
    const filter = new FileMatcher(
      root,
      path.join(root, "unused-output"),
      (value) => value,
      config.files,
    ).createFilter();
    for (const cachePath of BUILD_CACHE_PATHS) {
      for (const [suffix, isDirectory] of [
        ["", true],
        ["/turbopack", true],
        ["/turbopack/data.sst", false],
        ["/.hidden", false],
      ]) {
        const relativePath = cachePath + suffix;
        assert.equal(
          filter(path.join(root, relativePath), {
            isDirectory: () => isDirectory,
          }),
          false,
          `${configName}: ${relativePath}`,
        );
      }
    }
    for (const relativePath of [
      "renderer/out/BUILD_ID",
      "renderer/out/prerender-manifest.json",
      "renderer/out/server/app/[id]/page.js",
      "renderer/out/static/chunks/app.js",
      "renderer/out/node_modules/next/package.json",
      "renderer/out/dev/node_modules/addon/addon.node",
      "renderer/public/pdfjs/worker.mjs",
      "main/electron-src/index.js",
    ]) {
      assert.equal(
        filter(path.join(root, relativePath), { isDirectory: () => false }),
        true,
        `${configName}: ${relativePath}`,
      );
    }
    assert.equal(
      config.afterPack,
      "scripts/after-pack-copy-next-node-modules.cjs",
    );
  }
});

for (const cachePath of BUILD_CACHE_PATHS) {
  test(`artifact guard rejects ${cachePath} in ASAR and directory packages`, async () => {
    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), "6529-cache-test-"),
    );
    try {
      const source = path.join(temporary, "app");
      const archive = path.join(temporary, "app.asar");
      const runtime = path.join(source, "renderer/out/server/app.js");
      fs.mkdirSync(path.dirname(runtime), { recursive: true });
      fs.writeFileSync(runtime, "module.exports = {};");
      await repackAsar(source, archive, new Set());
      assert.doesNotThrow(() => assertNoPackagedBuildCache(temporary, true));
      assert.doesNotThrow(() => assertNoPackagedBuildCache(temporary, false));
      const cache = path.join(source, cachePath, "turbopack/data.sst");
      fs.mkdirSync(path.dirname(cache), { recursive: true });
      fs.writeFileSync(cache, "build-only cache");
      await repackAsar(source, archive, new Set());
      assert.throws(
        () => assertNoPackagedBuildCache(temporary, true),
        /Build-only renderer cache/,
      );
      assert.throws(
        () => assertNoPackagedBuildCache(temporary, false),
        /Build-only renderer cache/,
      );
      // Cache entries marked unpacked must be rejected as well.
      await repackAsar(source, archive, new Set([cachePath]));
      assert.throws(
        () => assertNoPackagedBuildCache(temporary, true),
        /Build-only renderer cache/,
      );
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
}

test("artifact guard rejects stray unpacked cache files absent from the ASAR index", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "6529-cache-test-"));
  try {
    const source = path.join(temporary, "app");
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "main.js"), "module.exports = {};");
    await repackAsar(source, path.join(temporary, "app.asar"), new Set());
    const cache = path.join(
      temporary,
      "app.asar.unpacked",
      BUILD_CACHE_PATHS[0],
      "data.sst",
    );
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.writeFileSync(cache, "build-only cache");
    assert.throws(
      () => assertNoPackagedBuildCache(temporary, true),
      /Build-only renderer cache/,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("repacking preserves existing unpacking and unpacks new native libraries", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "6529-asar-test-"));
  try {
    const source = path.join(temporary, "source");
    const archive = path.join(temporary, "app.asar");
    const put = (name, contents = name) => {
      const file = path.join(source, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
    };
    put("existing/keep.txt");
    put("app/main.js");
    await repackAsar(source, archive, new Set(["existing"]));
    const unpacked = getUnpackedPaths(archive);
    const nativeFiles = [
      "renderer/out/node_modules/@img/sharp-darwin-arm64/lib/sharp.node",
      "renderer/out/node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips.dylib",
      "renderer/out/dev/node_modules/addon/addon.node",
      "node_modules/addon/lib.dll",
      "node_modules/addon/lib.so",
      "node_modules/addon/lib.so.42.1",
    ];
    for (const file of nativeFiles) put(file);
    put("existing/new.txt");
    // Archive paths containing glob syntax must be retained literally.
    put("app/[route]/keep.txt");
    unpacked.add(path.join("app", "[route]", "keep.txt"));
    if (process.platform !== "win32") {
      fs.symlinkSync("main.js", path.join(source, "app", "alias.js"));
    }
    await repackAsar(source, archive, unpacked);
    for (const file of [
      ...nativeFiles,
      "existing/keep.txt",
      "existing/new.txt",
      "app/[route]/keep.txt",
    ]) {
      assert.equal(asar.statFile(archive, file).unpacked, true, file);
      assert.equal(
        fs.readFileSync(path.join(`${archive}.unpacked`, file), "utf8"),
        file,
      );
    }
    assert.equal(asar.statFile(archive, "app/main.js").unpacked, undefined);
    assert.equal(
      asar.extractFile(archive, "app/main.js").toString(),
      "app/main.js",
    );
    if (process.platform !== "win32") {
      assert.equal(
        asar.extractFile(archive, "app/alias.js").toString(),
        "app/main.js",
      );
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
