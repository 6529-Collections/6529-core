const fs = require("node:fs");
const path = require("node:path");

// Reserve 80 characters for the legacy NSIS temporary rollback directory.
// MAX_PATH includes the terminating NUL. This is a relative-path budget for
// supported normal install/temp locations, not a promise for arbitrary paths.
const MAX_RELATIVE_PATH = 259 - 80;
const SQLITE_BUILD_TOOLS = /(?:^|\/)node_modules\/better-sqlite3\/node_modules\/prebuild-install(?:\/|$)/i;

function assertWindowsRelativePath(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (SQLITE_BUILD_TOOLS.test(normalized)) {
    throw new Error(`[windows-package] Unused SQLite build tools must not ship: ${relativePath}`);
  }
  if (normalized.length > MAX_RELATIVE_PATH) {
    throw new Error(`[windows-package] Path risks exceeding the NSIS rollback limit (${normalized.length} > ${MAX_RELATIVE_PATH}): ${relativePath}`);
  }
}

// Inspect physical files, including stale app.asar.unpacked entries; logical
// paths inside app.asar never become individual files during uninstallation.
function assertWindowsInstallPaths(appDir) {
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      assertWindowsRelativePath(path.relative(appDir, absolute));
      if (entry.isSymbolicLink()) {
        throw new Error(`[windows-package] Unexpected installed symlink: ${absolute}`);
      }
      if (entry.isDirectory()) visit(absolute);
    }
  }
  visit(appDir);
}

module.exports = { MAX_RELATIVE_PATH, assertWindowsRelativePath, assertWindowsInstallPaths };
