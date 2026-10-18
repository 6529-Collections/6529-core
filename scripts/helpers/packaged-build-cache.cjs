const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");

const BUILD_CACHE_PATHS = ["renderer/out/cache", "renderer/out/dev/cache"];

// Check the artifact, not the working tree: build caches can remain local to
// speed up subsequent builds, but must never be distributed to users.
function assertNoPackagedBuildCache(resourcesDir, asarEnabled) {
  const archivePath = path.join(resourcesDir, "app.asar");
  const directory = path.join(
    resourcesDir,
    asarEnabled ? "app.asar.unpacked" : "app",
  );
  let cacheEntry;
  if (asarEnabled) {
    asar.uncache(archivePath);
    cacheEntry = asar.listPackage(archivePath).find((entry) => {
      const relativePath = entry.replace(/\\/g, "/").replace(/^\//, "");
      return BUILD_CACHE_PATHS.some(
        (cachePath) =>
          relativePath === cachePath ||
          relativePath.startsWith(`${cachePath}/`),
      );
    });
  }
  cacheEntry ??= BUILD_CACHE_PATHS.find((cachePath) =>
    fs.existsSync(path.join(directory, cachePath)),
  );
  if (cacheEntry) {
    throw new Error(
      `[afterPack] Build-only renderer cache found in packaged app: ${cacheEntry}. ` +
        "Exclude renderer/out/cache and renderer/out/dev/cache in electron-builder files filters.",
    );
  }
}

module.exports = { BUILD_CACHE_PATHS, assertNoPackagedBuildCache };
