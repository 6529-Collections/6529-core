// electron-builder's Windows signing hook (win.signtoolOptions.sign).
//
// electron-builder calls this for every executable it signs: the app
// executable, the uninstaller and the installer. Signing happens inside the
// build, so the installer's block map and latest.yml are computed from the
// signed file and differential updates work.
//
// The unsigned Windows build targets set WINDOWS_SIGNING_REQUIRED=0 to skip
// this hook before inspecting credentials. The signing workflow is unchanged.
// With the Azure Key Vault settings of the "Sign Windows" workflow present,
// files are signed with AzureSignTool. Without them (local and off-CI
// builds) files stay unsigned; set WINDOWS_SIGNING_REQUIRED=1 to make a
// missing signature an error instead.

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const AZURE_SETTINGS = [
  "AZURE_KEY_VAULT_URL",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "AZURE_TENANT_ID",
  "CERT_NAME",
];

function hasSigningSettings(env = process.env) {
  return AZURE_SETTINGS.every((name) => Boolean(env[name]));
}

function azureSignToolArgs(filePath, env = process.env) {
  return [
    "sign",
    "--azure-key-vault-url",
    env.AZURE_KEY_VAULT_URL,
    "--azure-key-vault-client-id",
    env.AZURE_CLIENT_ID,
    "--azure-key-vault-client-secret",
    env.AZURE_CLIENT_SECRET,
    "--azure-key-vault-tenant-id",
    env.AZURE_TENANT_ID,
    "--azure-key-vault-certificate",
    env.CERT_NAME,
    "--file-digest",
    "sha256",
    "--timestamp-rfc3161",
    "http://timestamp.digicert.com",
    "--timestamp-digest",
    "sha256",
    filePath,
  ];
}

function signFile(filePath, env = process.env) {
  if (env.WINDOWS_SIGNING_REQUIRED === "0") {
    console.log(`[windows-sign] signing disabled; leaving ${path.basename(filePath)} unsigned`);
    return false;
  }
  if (!hasSigningSettings(env)) {
    if (env.WINDOWS_SIGNING_REQUIRED === "1") {
      throw new Error(`Windows signing settings are missing; cannot sign ${filePath}`);
    }
    console.log(`[windows-sign] no signing settings; leaving ${path.basename(filePath)} unsigned`);
    return false;
  }
  console.log(`[windows-sign] signing ${path.basename(filePath)}`);
  // Arguments are passed as a list, never through a shell.
  execFileSync("azuresigntool", azureSignToolArgs(filePath, env), {
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });
  return true;
}

module.exports = async function sign(configuration) {
  // Called once per hash algorithm; the configs request sha256 only.
  if (configuration.hash && configuration.hash !== "sha256") {
    return;
  }
  signFile(configuration.path);
};
module.exports.signFile = signFile;
module.exports.hasSigningSettings = hasSigningSettings;
module.exports.azureSignToolArgs = azureSignToolArgs;
