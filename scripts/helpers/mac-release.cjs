const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createReadStream } = require("node:fs");

// electron-updater compares minimumSystemVersion with os.release() (Darwin),
// while LSMinimumSystemVersion in the app bundle uses the macOS version.
function minimumDarwinVersion(config) {
  const minimum = config.mac?.minimumSystemVersion;
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(minimum ?? "")) {
    throw new Error("Mac releases require an explicit minimumSystemVersion");
  }
  const [major, minor, patch = 0] = minimum.split(".").map(Number);
  if (major < 13 || minor !== 0 || patch !== 0) {
    throw new Error(
      "Expected a macOS 13+ major-version minimum for Electron 44",
    );
  }
  return `${major + 9}.0.0`;
}

function normalizeMacManifest(manifest, config) {
  if (!/^\d+\.\d+\.\d+$/.test(manifest?.version ?? "")) {
    throw new Error("Invalid Mac release version");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("Mac release has no files");
  }
  const files = new Map();
  for (const file of manifest.files) {
    if (
      !/^6529-DESKTOP(?:-STAGING)?-mac-(?:arm64|x64)-\d+\.\d+\.\d+\.(?:zip|dmg)$/.test(
        file.url ?? "",
      ) ||
      !file.url.endsWith(
        `-${manifest.version}.${file.url.endsWith(".zip") ? "zip" : "dmg"}`,
      ) ||
      // A 64-byte SHA-512 digest is 86 base64 characters followed by ==.
      !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512 ?? "") ||
      !Number.isSafeInteger(file.size) ||
      file.size <= 0
    ) {
      throw new Error(`Invalid Mac release file: ${file.url}`);
    }
    const previous = files.get(file.url);
    if (
      previous &&
      (previous.sha512 !== file.sha512 || previous.size !== file.size)
    ) {
      throw new Error(`Conflicting duplicate Mac artifact: ${file.url}`);
    }
    files.set(file.url, { ...file });
  }
  const unique = [...files.values()];
  const defaultFile = unique.find((file) => file.url === manifest.path);
  if (
    !defaultFile?.url.endsWith(".zip") ||
    defaultFile.sha512 !== manifest.sha512
  ) {
    throw new Error("Mac updater path/hash must identify a listed ZIP");
  }
  for (const arch of ["arm64", "x64"]) {
    const archFiles = unique.filter((file) =>
      file.url.includes(`-mac-${arch}-`),
    );
    if (
      archFiles.length &&
      (!archFiles.some((file) => file.url.endsWith(".zip")) ||
        !archFiles.some((file) => file.url.endsWith(".dmg")))
    ) {
      throw new Error(`Mac release needs both ZIP and DMG for ${arch}`);
    }
  }
  return {
    ...manifest,
    files: unique,
    minimumSystemVersion: minimumDarwinVersion(config),
  };
}

async function hashFile(file) {
  const hash = crypto.createHash("sha512");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("base64");
}

async function verifyMacArtifacts(manifest, directories) {
  const artifacts = new Map();
  for (const directory of directories) {
    for (const name of fs.readdirSync(directory)) {
      if (!manifest.files.some((file) => file.url === name)) continue;
      if (artifacts.has(name))
        throw new Error(`Ambiguous artifact location: ${name}`);
      artifacts.set(name, path.join(directory, name));
    }
  }
  for (const file of manifest.files) {
    const location = artifacts.get(file.url);
    if (
      !location ||
      fs.statSync(location).size !== file.size ||
      (await hashFile(location)) !== file.sha512
    ) {
      throw new Error(`Mac artifact size/hash mismatch: ${file.url}`);
    }
    const blockmap = `${location}.blockmap`;
    if (!fs.existsSync(blockmap) || fs.statSync(blockmap).size === 0) {
      throw new Error(`Missing Mac blockmap: ${file.url}.blockmap`);
    }
  }
  return artifacts;
}

module.exports = {
  minimumDarwinVersion,
  normalizeMacManifest,
  hashFile,
  verifyMacArtifacts,
};
