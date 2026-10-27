const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { MAX_RELATIVE_PATH, assertWindowsRelativePath, assertWindowsInstallPaths } = require("./windows-install-paths.cjs");

test("the published 0.3.15 SQLite tooling path fails the Windows rollback budget", () => {
  const legacyPath = "resources/app.asar.unpacked/node_modules/better-sqlite3/node_modules/prebuild-install/node_modules/tar-fs/node_modules/tar-stream/node_modules/bl/node_modules/readable-stream/node_modules/string_decoder/node_modules/safe-buffer/package.json";
  assert.throws(() => assertWindowsRelativePath(legacyPath), /Unused SQLite build tools/);
  assert.throws(() => assertWindowsRelativePath(legacyPath.replaceAll("/", "\\")), /Unused SQLite build tools/);
  assert.throws(() => assertWindowsRelativePath("x".repeat(MAX_RELATIVE_PATH + 1)), /NSIS rollback limit/);
  assert.doesNotThrow(() => assertWindowsRelativePath("x".repeat(MAX_RELATIVE_PATH)));
  assert.doesNotThrow(() => assertWindowsRelativePath("resources/app.asar.unpacked/node_modules/better-sqlite3/prebuilds/win32-arm64.node"));
});

test("the artifact guard checks stale physical overlay files but leaves packed paths alone", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "core-win-paths-"));
  try {
    fs.mkdirSync(path.join(root, "resources"));
    fs.writeFileSync(path.join(root, "resources", "app.asar"), "archive contents are not individual installed paths");
    assert.doesNotThrow(() => assertWindowsInstallPaths(root));
    const tooling = path.join(root, "resources/app.asar.unpacked/node_modules/better-sqlite3/node_modules/prebuild-install");
    fs.mkdirSync(tooling, { recursive: true });
    assert.throws(() => assertWindowsInstallPaths(root), /Unused SQLite build tools/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
