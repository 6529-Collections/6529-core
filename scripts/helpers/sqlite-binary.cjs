const fs = require("node:fs");
const path = require("node:path");

// better-sqlite3 (13 and later) ships a prebuilt N-API binary for every
// platform it supports, plus the SQLite and addon sources for building one.
// A packaged app loads only its own platform's binary, so the others and the
// sources are left out.

const MODULE_DIR = path.join("node_modules", "better-sqlite3");
const SOURCES = ["deps", "src", "build", "binding.gyp"];

function entrySize(target) {
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory()) return stat.size;
  let bytes = 0;
  for (const name of fs.readdirSync(target)) bytes += entrySize(path.join(target, name));
  return bytes;
}

/** The prebuilt binaries a build for this platform and arch loads. */
function keptBinaries(platform, arch) {
  // Electron's Linux AppImage/zip targets run on glibc, not Alpine/musl.
  // Keep linux-<arch>.node; linuxmusl-<arch>.node is not a desktop target.
  const archs = arch === "universal" ? ["x64", "arm64"] : [arch];
  return archs.map((name) => `${platform}-${name}.node`);
}

/**
 * Removes the sources and every other platform's binary from better-sqlite3
 * under `root` (an extracted app, or app.asar.unpacked). Returns the bytes
 * removed. Throws when a binary the app loads is missing, so a build cannot
 * ship without one. The complete app must have its direct dependency at the
 * top level after materializePackagedNodeModules; requireModule makes a
 * missing/unexpected nested-only layout fail instead of silently skipping it.
 * The app.asar.unpacked overlay may legitimately omit the module entirely.
 */
function pruneSqliteModule(root, platform, arch, { requireModule = false } = {}) {
  const dir = path.join(root, MODULE_DIR);
  if (!fs.existsSync(dir)) {
    if (requireModule) {
      throw new Error(`[afterPack] Required better-sqlite3 is missing at ${dir}; materialize the app's direct dependency before pruning`);
    }
    return 0;
  }
  const keep = keptBinaries(platform, arch);
  let bytes = 0;
  const remove = (target) => {
    if (!fs.existsSync(target)) return;
    bytes += entrySize(target);
    fs.rmSync(target, { recursive: true, force: true });
  };
  for (const name of SOURCES) remove(path.join(dir, name));
  const prebuilds = path.join(dir, "prebuilds");
  if (fs.existsSync(prebuilds)) {
    for (const name of fs.readdirSync(prebuilds)) {
      if (!keep.includes(name)) remove(path.join(prebuilds, name));
    }
  }
  const missing = keep.filter((name) => !fs.existsSync(path.join(prebuilds, name)));
  if (missing.length > 0) {
    throw new Error(`[afterPack] better-sqlite3 has no prebuilt binary for this build: ${missing.join(", ")}`);
  }
  return bytes;
}

module.exports = { keptBinaries, pruneSqliteModule };
