#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { copyResolvedTree } = require("./helpers/copy-resolved-tree.cjs");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "assets");
const DESTINATION = path.join(ROOT, "main", "electron-src", "assets");
const targetPlatform =
  process.argv[2] ?? process.env.DESKTOP_BUILD_PLATFORM ?? process.platform;
const keychainBinary = path.join(DESTINATION, "native", "macos-wallet-keychain.node");

copyResolvedTree(SOURCE, DESTINATION, { allowedRoots: [ROOT] });

// Native modules belong to the generated app tree. The source assets are
// also copied separately by Electron Builder for every package target.
if (targetPlatform === "darwin") {
  execFileSync(
    process.execPath,
    [path.join(ROOT, "scripts/build-macos-wallet-keychain.cjs"), keychainBinary],
    { stdio: "inherit" }
  );
} else {
  fs.rmSync(keychainBinary, { force: true });
}

console.log(
  `[copy-electron-assets] Copied ${path.relative(ROOT, SOURCE)} to ${path.relative(
    ROOT,
    DESTINATION,
  )}`
);
