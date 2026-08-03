#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");

function assertSourceIncludes(relativePath, requiredSnippets) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const missingSnippets = requiredSnippets.filter(
    (snippet) => !source.includes(snippet),
  );

  if (missingSnippets.length === 0) {
    return;
  }

  console.error(`Desktop renderer contract failed in ${relativePath}:`);
  for (const snippet of missingSnippets) {
    console.error(`  missing ${JSON.stringify(snippet)}`);
  }
  process.exitCode = 1;
}

assertSourceIncludes("renderer/services/auth/session-v2.utils.ts", [
  'return "desktop";',
  "nativeAuthBridge?.sessionLogin",
  "Desktop session login bridge is unavailable",
  "window.nativeAuth?.sessionRefresh",
  "Desktop session refresh bridge is unavailable",
  "window.nativeAuth?.sessionLogout",
  "Desktop session logout bridge is unavailable",
  "window.nativeAuth?.createConnectionShare",
  "window.nativeAuth?.createLegacyDesktopConnectionShare",
  "window.nativeAuth?.redeemConnectionShare",
]);

assertSourceIncludes("electron-src/preload.ts", [
  'ipcRenderer.invoke("native-auth:session-login"',
  'ipcRenderer.invoke("native-auth:session-refresh"',
  'ipcRenderer.invoke("native-auth:session-logout"',
  'ipcRenderer.invoke("native-auth:connection-share"',
]);

assertSourceIncludes("electron-src/index.ts", [
  'ipcMain.handle("native-auth:session-login"',
  'ipcMain.handle("native-auth:session-refresh"',
  'ipcMain.handle("native-auth:session-logout"',
  'ipcMain.handle("native-auth:connection-share"',
]);

assertSourceIncludes("shared/preload-types.ts", [
  "export interface ElectronNativeAuth",
  "sessionLogin:",
  "sessionRefresh:",
  "sessionLogout:",
  "createConnectionShare:",
]);

assertSourceIncludes("renderer/components/auth/AuthProvider.tsx", [
  "dismissedAuthPromptAddress",
  "isDisconnecting",
  "setDismissedAuthPromptAddress(address?.trim().toLowerCase() ?? null)",
]);

assertSourceIncludes("renderer/components/auth/AuthSignModal.tsx", [
  "canDismissSignModal",
  "onCancel={(event) => {",
  "onCancelSignRequest();",
]);

if (!process.exitCode) {
  console.log("Desktop renderer contract passed.");
}
