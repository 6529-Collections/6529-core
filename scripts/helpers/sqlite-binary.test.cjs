const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
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
  fs.mkdirSync(path.join(dir, "lib"), { recursive: true });
  for (const name of PREBUILDS) fs.writeFileSync(path.join(dir, "prebuilds", name), "x".repeat(10));
  fs.writeFileSync(path.join(dir, "deps", "sqlite3", "sqlite3.c"), "x".repeat(100));
  fs.writeFileSync(path.join(dir, "src", "better_sqlite3.cpp"), "x".repeat(20));
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
    assert.equal(bytes, 6 * 10 + 100 + 20 + 5);
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

test("an app without better-sqlite3 is fine", () => {
  withRoot((root) => {
    assert.equal(pruneSqliteModule(root, "win32", "x64"), 0);
  });
});
