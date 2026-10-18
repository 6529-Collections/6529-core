const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildsNsis, writeWindowsAppUpdateConfig } = require("./app-update-config.cjs");

test("only NSIS targets get app-update.yml from electron-builder itself", () => {
  assert.equal(buildsNsis([{ name: "nsis" }]), true);
  assert.equal(buildsNsis([{ name: "nsis-web" }]), true);
  assert.equal(buildsNsis([{ name: "zip" }]), false);
  assert.equal(buildsNsis([]), false);
  assert.equal(buildsNsis(undefined), false);
});

test("the file is written only for Windows builds without an NSIS target", async () => {
  assert.equal(await writeWindowsAppUpdateConfig({ electronPlatformName: "linux", targets: [] }), null);
  assert.equal(await writeWindowsAppUpdateConfig({ electronPlatformName: "darwin", targets: [{ name: "zip" }] }), null);
  assert.equal(await writeWindowsAppUpdateConfig({ electronPlatformName: "win32", targets: [{ name: "nsis" }] }), null);
});
