const assert = require("node:assert/strict");
const { test } = require("node:test");
const { azureSignToolArgs, hasSigningSettings, signFile } = require("../windows-sign-hook.cjs");
const { installerName, mergeLatest, RELEASES, zipName } = require("../windows-release.cjs");

const SETTINGS = {
  AZURE_KEY_VAULT_URL: "https://vault.example",
  AZURE_CLIENT_ID: "client",
  AZURE_CLIENT_SECRET: "secret",
  AZURE_TENANT_ID: "tenant",
  CERT_NAME: "cert",
};

test("signing needs every Key Vault setting", () => {
  assert.equal(hasSigningSettings(SETTINGS), true);
  assert.equal(hasSigningSettings({ ...SETTINGS, CERT_NAME: "" }), false);
});

test("AzureSignTool gets its arguments as a list, with sha256 and a timestamp", () => {
  const args = azureSignToolArgs("C:\\dist\\6529 Desktop.exe", SETTINGS);
  assert.equal(args[0], "sign");
  assert.equal(args.at(-1), "C:\\dist\\6529 Desktop.exe");
  assert.equal(args[args.indexOf("--file-digest") + 1], "sha256");
  assert.equal(args[args.indexOf("--timestamp-rfc3161") + 1], "http://timestamp.digicert.com");
});

test("without signing settings files stay unsigned, unless signing is required", () => {
  assert.equal(signFile("app.exe", {}), false);
  assert.throws(() => signFile("app.exe", { WINDOWS_SIGNING_REQUIRED: "1" }), /signing settings are missing/);
});

test("the production feed lists one installer per architecture, x64 first", () => {
  const release = RELEASES.production;
  const merged = mergeLatest(release, {
    x64: { files: [{ url: installerName(release, "x64"), sha512: "x64-hash", size: 10 }] },
    arm64: { files: [{ url: installerName(release, "arm64"), sha512: "arm64-hash", size: 11 }] },
  });
  assert.deepEqual(
    merged.files.map((file) => file.url),
    [installerName(release, "x64"), installerName(release, "arm64")],
  );
  assert.equal(merged.path, installerName(release, "x64"));
  assert.equal(merged.sha512, "x64-hash");
  // electron-updater 6.7+ picks the file whose name contains its architecture.
  for (const file of merged.files) assert.match(file.url, /-(x64|arm64)-/);
  assert.ok(!merged.files.some((file) => !/-(x64|arm64)-/.test(file.url)), "no two-architecture installer");
});

test("artifact names follow the electron-builder configs", () => {
  assert.match(zipName(RELEASES.staging, "x64"), /^6529-DESKTOP-STAGING-win-x64-\d+\.\d+\.\d+\.zip$/);
  assert.match(installerName(RELEASES.production, "arm64"), /^6529-DESKTOP-win-arm64-\d+\.\d+\.\d+\.exe$/);
  assert.deepEqual(RELEASES.staging.archs, ["x64"]);
  assert.deepEqual(RELEASES.production.archs, ["x64", "arm64"]);
});

test("merging fails when a per-architecture latest.yml lacks its installer", () => {
  assert.throws(
    () => mergeLatest(RELEASES.staging, { x64: { files: [{ url: "other.exe", sha512: "h", size: 1 }] } }),
    /does not list/,
  );
});
