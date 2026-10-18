const fs = require("node:fs");
const path = require("node:path");

// resources/app-update.yml tells electron-updater where the update feed is
// and whose signature to expect. electron-builder writes it only when it
// builds an NSIS installer. Windows release builds stop at a zip, and CI
// builds the installers from that prepackaged app, which skips the step, so
// without this the installed app could never update. The file is written
// here with electron-builder's own function, so its content is the same.

function appBuilderLibDir() {
  const builderDir = path.dirname(require.resolve("electron-builder/package.json"));
  return path.dirname(require.resolve("app-builder-lib/package.json", { paths: [builderDir] }));
}

/** Whether electron-builder writes app-update.yml itself for these targets. */
function buildsNsis(targets) {
  return (targets ?? []).some((target) => target.name === "nsis" || target.name.startsWith("nsis-"));
}

/**
 * afterPack step for Windows builds without an NSIS target (the release zip
 * and app-folder-only builds). Returns the file written, or null.
 */
async function writeWindowsAppUpdateConfig(context) {
  if (context.electronPlatformName !== "win32" || buildsNsis(context.targets)) {
    return null;
  }
  const libDir = appBuilderLibDir();
  const { getAppUpdatePublishConfiguration } = require(path.join(libDir, "out", "publish", "PublishManager.js"));
  const { serializeToYaml } = require(require.resolve("builder-util", { paths: [libDir] }));
  const config = await getAppUpdatePublishConfiguration(context.packager, null, context.arch, false);
  if (config == null) {
    return null;
  }
  const file = path.join(context.packager.getResourcesDir(context.appOutDir), "app-update.yml");
  fs.writeFileSync(file, serializeToYaml(config));
  console.log(`[app-update] wrote ${file}`);
  return file;
}

module.exports = { buildsNsis, writeWindowsAppUpdateConfig };
