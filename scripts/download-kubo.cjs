#!/usr/bin/env node

// Downloads the bundled Kubo (IPFS) binaries for one platform into
// ipfs-binaries/<platform>, from the S3 folder of the version that
// config/kubo.json names, and checks each file's SHA-256 against that file.
//
//   node scripts/download-kubo.cjs <win|mac|linux>

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const CONFIG = path.join(ROOT, "config", "kubo.json");
const PLATFORMS = ["win", "mac", "linux"];

function readKuboConfig(file = CONFIG) {
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  if (typeof config.version !== "string" || !/^\d+\.\d+\.\d+$/.test(config.version)) {
    throw new Error(`[kubo] ${file} has no valid version`);
  }
  return config;
}

function kuboS3Folder(version) {
  return `s3://6529bucket/ipfs-binaries/kubo-v${version}`;
}

/** The binaries config/kubo.json lists for a platform, as [relative path, sha256]. */
function expectedFiles(config, platform) {
  return Object.entries(config.files).filter(([file]) => file.startsWith(`${platform}/`));
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Throws unless every listed binary is present with its recorded SHA-256. */
function verifyDownload(config, platform, binariesRoot) {
  const files = expectedFiles(config, platform);
  if (files.length === 0) {
    throw new Error(`[kubo] config/kubo.json lists no ${platform} binaries`);
  }
  for (const [relative, expected] of files) {
    const file = path.join(binariesRoot, ...relative.split("/"));
    if (!fs.existsSync(file)) {
      throw new Error(`[kubo] missing ${relative} after download`);
    }
    const actual = sha256(file);
    if (actual !== expected) {
      throw new Error(`[kubo] ${relative} has SHA-256 ${actual}, expected ${expected}`);
    }
  }
  return files.map(([relative]) => relative);
}

function main() {
  const platform = process.argv[2];
  if (!PLATFORMS.includes(platform)) {
    console.error("Usage: node scripts/download-kubo.cjs <win|mac|linux>");
    process.exit(2);
  }
  const config = readKuboConfig();
  const binariesRoot = path.join(ROOT, "ipfs-binaries");
  const target = path.join(binariesRoot, platform);
  const result = spawnSync(
    "aws",
    ["s3", "cp", `${kuboS3Folder(config.version)}/${platform}`, target, "--recursive", "--only-show-errors"],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`[kubo] aws s3 cp exited with code ${result.status}`);
  }
  const files = verifyDownload(config, platform, binariesRoot);
  if (platform !== "win") {
    for (const relative of files) fs.chmodSync(path.join(binariesRoot, ...relative.split("/")), 0o755);
  }
  console.log(`[kubo] ${config.version}: ${files.join(", ")} downloaded and verified`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = { expectedFiles, kuboS3Folder, readKuboConfig, verifyDownload };
