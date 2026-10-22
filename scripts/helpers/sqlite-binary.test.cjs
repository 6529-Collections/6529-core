const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { test } = require("node:test");
const asar = require("@electron/asar");
const { getUnpackedPaths, repackAsar } = require("./repack-asar.cjs");
const { keptBinaries, pruneSqliteModule } = require("./sqlite-binary.cjs");

const PREBUILDS = [
  "darwin-arm64.node",
  "darwin-x64.node",
  "linux-arm64.node",
  "linux-x64.node",
  "linuxmusl-x64.node",
  "win32-arm64.node",
  "win32-x64.node",
];

function makeModule(root) {
  const dir = path.join(root, "node_modules", "better-sqlite3");
  fs.mkdirSync(path.join(dir, "prebuilds"), { recursive: true });
  fs.mkdirSync(path.join(dir, "deps", "sqlite3"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "build", "Release"), { recursive: true });
  fs.mkdirSync(path.join(dir, "lib"), { recursive: true });
  for (const name of PREBUILDS) fs.writeFileSync(path.join(dir, "prebuilds", name), "x".repeat(10));
  fs.writeFileSync(path.join(dir, "deps", "sqlite3", "sqlite3.c"), "x".repeat(100));
  fs.writeFileSync(path.join(dir, "src", "better_sqlite3.cpp"), "x".repeat(20));
  fs.writeFileSync(path.join(dir, "build", "Release", "better_sqlite3.node"), "x".repeat(30));
  fs.writeFileSync(path.join(dir, "binding.gyp"), "x".repeat(5));
  fs.writeFileSync(path.join(dir, "lib", "index.js"), "");
  fs.writeFileSync(path.join(dir, "package.json"), "{}");
  return dir;
}

function withRoot(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "6529-sqlite-"));
  try {
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("only the target platform's binary and the loader stay", () => {
  withRoot((root) => {
    const dir = makeModule(root);

    const bytes = pruneSqliteModule(root, "win32", "x64");

    assert.deepEqual(fs.readdirSync(path.join(dir, "prebuilds")), ["win32-x64.node"]);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["lib", "package.json", "prebuilds"]);
    assert.equal(bytes, 6 * 10 + 100 + 20 + 30 + 5);
  });
});

test("a universal macOS build keeps both macOS binaries", () => {
  assert.deepEqual(keptBinaries("darwin", "universal"), ["darwin-x64.node", "darwin-arm64.node"]);
  withRoot((root) => {
    const dir = makeModule(root);
    pruneSqliteModule(root, "darwin", "universal");
    assert.deepEqual(fs.readdirSync(path.join(dir, "prebuilds")).sort(), ["darwin-arm64.node", "darwin-x64.node"]);
  });
});

test("a build whose binary is missing fails", () => {
  withRoot((root) => {
    makeModule(root);
    assert.throws(() => pruneSqliteModule(root, "linux", "riscv64"), /no prebuilt binary for this build: linux-riscv64\.node/);
  });
});

test("Linux desktop keeps the glibc binary and deliberately excludes musl", () => {
  withRoot((root) => {
    const dir = makeModule(root);
    pruneSqliteModule(root, "linux", "x64", { requireModule: true });
    assert.deepEqual(fs.readdirSync(path.join(dir, "prebuilds")), ["linux-x64.node"]);
  });
});

test("a hoisted pnpm symlink prunes the package Node resolves", () => {
  withRoot((root) => {
    const dir = makeModule(root);
    const nested = path.join(root, "node_modules", ".pnpm", "better-sqlite3@13", "node_modules", "better-sqlite3");
    fs.mkdirSync(path.dirname(nested), { recursive: true });
    fs.renameSync(dir, nested);
    fs.symlinkSync(path.relative(path.dirname(dir), nested), dir, process.platform === "win32" ? "junction" : "dir");
    const appRequire = createRequire(path.join(root, "probe.cjs"));
    assert.equal(appRequire.resolve("better-sqlite3/package.json"), fs.realpathSync(path.join(nested, "package.json")));
    pruneSqliteModule(root, "win32", "x64", { requireModule: true });
    assert.deepEqual(fs.readdirSync(path.join(nested, "prebuilds")), ["win32-x64.node"]);
    assert.equal(fs.existsSync(path.join(nested, "build")), false);
  });
});

test("a complete app with only a nested pnpm package fails closed", () => {
  withRoot((root) => {
    const dir = makeModule(root);
    const nested = path.join(root, "node_modules", ".pnpm", "better-sqlite3@13", "node_modules", "better-sqlite3");
    fs.mkdirSync(path.dirname(nested), { recursive: true });
    fs.renameSync(dir, nested);
    assert.throws(
      () => pruneSqliteModule(root, "win32", "x64", { requireModule: true }),
      /Required better-sqlite3 is missing/,
    );
    assert.equal(fs.existsSync(path.join(nested, "prebuilds", "win32-x64.node")), true);
  });
});

test("an app without better-sqlite3 is fine", () => {
  withRoot((root) => {
    assert.equal(pruneSqliteModule(root, "win32", "x64"), 0);
  });
});

for (const [platform, arch] of [
  ["darwin", "arm64"],
  ["darwin", "x64"],
  ["darwin", "universal"],
  ["win32", "x64"],
  ["win32", "arm64"],
  ["linux", "x64"],
]) {
  test(`repacking puts SQLite ${platform}/${arch} binaries in the unpacked overlay`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "6529-sqlite-asar-"));
    try {
      const source = path.join(root, "source");
      makeModule(source);
      const archive = path.join(root, "app.asar");
      // Start with packed native files, so the test does not rely on previous
      // unpacking metadata supplied by electron-builder.
      await asar.createPackage(source, archive);
      const previousUnpackedPaths = getUnpackedPaths(archive);
      const keep = keptBinaries(platform, arch);
      const relative = (name) => path.join("node_modules", "better-sqlite3", "prebuilds", name);
      for (const name of keep) {
        assert.notEqual(asar.statFile(archive, relative(name)).unpacked, true);
      }
      pruneSqliteModule(source, platform, arch, { requireModule: true });
      await repackAsar(source, archive, previousUnpackedPaths);

      const overlay = `${archive}.unpacked`;
      for (const name of keep) {
        assert.equal(asar.statFile(archive, relative(name)).unpacked, true);
        assert.deepEqual(
          fs.readFileSync(path.join(overlay, relative(name))),
          fs.readFileSync(path.join(source, relative(name))),
        );
      }
      // Simulate stale files left by a prior archive: only the target's
      // physical binaries may survive the overlay cleanup pass.
      const stale = PREBUILDS.find((name) => !keep.includes(name));
      fs.writeFileSync(path.join(overlay, relative(stale)), "stale");
      assert.equal(pruneSqliteModule(overlay, platform, arch), 5);
      assert.deepEqual(
        fs.readdirSync(path.join(overlay, "node_modules", "better-sqlite3", "prebuilds")).sort(),
        [...keep].sort(),
      );
      // Do not soften the guard: a target binary missing from the physical
      // overlay really is a broken artifact, even if its header entry exists.
      fs.unlinkSync(path.join(overlay, relative(keep[0])));
      assert.throws(() => pruneSqliteModule(overlay, platform, arch), /no prebuilt binary for this build/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
