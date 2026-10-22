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
  if (
    typeof config.version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(config.version)
  ) {
    throw new Error(`[kubo] ${file} has no valid version`);
  }
  return config;
}

function kuboS3Folder(version) {
  return `s3://6529bucket/ipfs-binaries/kubo-v${version}`;
}

/** The binaries config/kubo.json lists for a platform, as [relative path, sha256]. */
function expectedFiles(config, platform) {
  return Object.entries(config.files).filter(([file]) =>
    file.startsWith(`${platform}/`),
  );
}

function sha256(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
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
      throw new Error(
        `[kubo] ${relative} has SHA-256 ${actual}, expected ${expected}`,
      );
    }
  }
  return files.map(([relative]) => relative);
}

/** Download only named binaries, verifying the complete set before replacing any. */
function downloadBinaries(config, platform, binariesRoot, spawn = spawnSync) {
  try {
    const cached = verifyDownload(config, platform, binariesRoot);
    if (platform !== "win") {
      for (const relative of cached) {
        fs.chmodSync(path.join(binariesRoot, ...relative.split("/")), 0o755);
      }
    }
    return cached;
  } catch {
    // A valid cache avoids a network request; changed releases are re-fetched.
  }
  fs.mkdirSync(binariesRoot, { recursive: true });
  const staging = fs.mkdtempSync(path.join(binariesRoot, ".kubo-"));
  try {
    const files = expectedFiles(config, platform);
    for (const [relative] of files) {
      const target = path.join(staging, ...relative.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const result = spawn(
        "aws",
        [
          "s3",
          "cp",
          `${kuboS3Folder(config.version)}/${relative}`,
          target,
          "--only-show-errors",
        ],
        { stdio: "inherit" },
      );
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(`[kubo] aws s3 cp exited with code ${result.status}`);
    }
    const verified = verifyDownload(config, platform, staging);
    for (const relative of verified) {
      const source = path.join(staging, ...relative.split("/"));
      const target = path.join(binariesRoot, ...relative.split("/"));
      if (platform !== "win") fs.chmodSync(source, 0o755);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(source, target);
    }
    return verified;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function verifyWebUi(file, webui) {
  if (fs.statSync(file).size !== webui.size || sha256(file) !== webui.sha256) {
    throw new Error(
      "[kubo] WebUI archive size or SHA-256 does not match config/kubo.json",
    );
  }
}

/** Cache only the exact official archive; temporary/failed downloads never ship. */
async function downloadWebUi(config, binariesRoot, fetchArchive = fetch) {
  const webui = config.webui;
  if (
    !webui ||
    !/^\d+\.\d+\.\d+$/.test(webui.version) ||
    !/^bafy[a-z2-7]+$/.test(webui.cid) ||
    !/^[a-f0-9]{64}$/.test(webui.sha256) ||
    !Number.isSafeInteger(webui.size) ||
    webui.size <= 0 ||
    webui.size > 64 * 1024 * 1024 ||
    webui.url !==
      `https://github.com/ipfs/ipfs-webui/releases/download/v${webui.version}/ipfs-webui%40v${webui.version}.car`
  ) {
    throw new Error("[kubo] Invalid pinned WebUI release metadata");
  }
  const target = path.join(binariesRoot, "webui", "ipfs-webui.car");
  if (fs.existsSync(target)) {
    try {
      verifyWebUi(target, webui);
      return target;
    } catch {
      // Replace a stale/tampered cache only after verifying its replacement.
    }
  }
  fs.mkdirSync(binariesRoot, { recursive: true });
  const staging = fs.mkdtempSync(path.join(binariesRoot, ".kubo-"));
  try {
    const response = await fetchArchive(webui.url, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok)
      throw new Error(`[kubo] WebUI download HTTP ${response.status}`);
    if (!response.body) throw new Error("[kubo] WebUI download has no body");
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > webui.size)
          throw new Error("[kubo] WebUI download exceeds its pinned size");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const temporaryFile = path.join(staging, "ipfs-webui.car");
    fs.writeFileSync(temporaryFile, Buffer.concat(chunks, length));
    verifyWebUi(temporaryFile, webui);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(temporaryFile, target);
    return target;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

async function main() {
  const platform = process.argv[2];
  if (!PLATFORMS.includes(platform)) {
    console.error("Usage: node scripts/download-kubo.cjs <win|mac|linux>");
    process.exit(2);
  }
  const config = readKuboConfig();
  const binariesRoot = path.join(ROOT, "ipfs-binaries");
  const files = downloadBinaries(config, platform, binariesRoot);
  await downloadWebUi(config, binariesRoot);
  console.log(
    `[kubo] ${config.version}: ${files.join(", ")} downloaded and verified`,
  );
  console.log(`[kubo] WebUI ${config.webui.version}: downloaded and verified`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  downloadBinaries,
  downloadWebUi,
  expectedFiles,
  kuboS3Folder,
  readKuboConfig,
  verifyDownload,
  verifyWebUi,
};
