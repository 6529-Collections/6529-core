const fs = require("node:fs");
const path = require("node:path");
const { finished } = require("node:stream/promises");
const asar = require("@electron/asar");

// Native loaders need real neighbouring files, not ASAR's temporary extraction
// of a single addon. Include versioned Linux libraries as well as macOS/Windows.
const NATIVE_LIBRARY = /\.(?:node|dylib|dll|so(?:\.\d+)*)$/i;

function getUnpackedPaths(archivePath) {
  const unpacked = new Set();
  for (const entry of asar.listPackage(archivePath)) {
    const relativePath = entry.slice(1);
    if (asar.statFile(archivePath, relativePath, false).unpacked) {
      unpacked.add(relativePath);
    }
  }
  return unpacked;
}

async function repackAsar(sourceDir, archivePath, previousUnpackedPaths) {
  const entries = [];
  function visit(relativeDir, inheritedUnpacked = false) {
    const directory = path.join(sourceDir, relativeDir);
    for (const name of fs.readdirSync(directory).sort()) {
      const relativePath = path.join(relativeDir, name);
      const sourcePath = path.join(sourceDir, relativePath);
      const stat = fs.lstatSync(sourcePath);
      const unpacked =
        inheritedUnpacked ||
        previousUnpackedPaths.has(relativePath) ||
        NATIVE_LIBRARY.test(name);
      if (stat.isDirectory()) {
        entries.push({ type: "directory", path: relativePath, unpacked });
        visit(relativePath, unpacked);
      } else if (stat.isSymbolicLink()) {
        entries.push({
          type: "link",
          path: relativePath,
          unpacked,
          stat,
          symlink: fs.readlinkSync(sourcePath),
        });
      } else if (stat.isFile()) {
        entries.push({
          type: "file",
          path: relativePath,
          unpacked,
          stat,
          streamGenerator: () => fs.createReadStream(sourcePath),
        });
      } else {
        throw new Error(`Unsupported packaged file: ${relativePath}`);
      }
    }
  }
  visit("");
  const stream = await asar.createPackageFromStreams(archivePath, entries);
  await finished(stream);
  // afterPack read the original header before rewriting this same path.
  asar.uncache(archivePath);
}

module.exports = { getUnpackedPaths, repackAsar };
