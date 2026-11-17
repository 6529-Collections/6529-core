const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { archName } = require("./size-budget.cjs");

function buildClassicMacBundleMove(context) {
  if (context.electronPlatformName !== "darwin") return;
  const options = context.packager.platformSpecificBuildOptions;
  // The compatibility executable name marks builds delivered by ShipIt.
  if (!options.extendInfo?.CFBundleExecutable) return;

  const contents = path.dirname(context.packager.getResourcesDir(context.appOutDir));
  const helpers = path.join(contents, "Helpers");
  fs.mkdirSync(helpers, { recursive: true });
  const arch = archName(context.arch);
  execFileSync("xcrun", [
    "clang", "-fobjc-arc", "-Wall", "-Wextra", "-Werror",
    "-arch", arch === "x64" ? "x86_64" : arch,
    `-mmacosx-version-min=${options.minimumSystemVersion}`,
    "-framework", "Foundation",
    path.resolve(__dirname, "../../native/classic-mac-bundle-move.m"),
    "-o", path.join(helpers, "classic-bundle-move"),
  ], { stdio: "inherit" });
}

module.exports = { buildClassicMacBundleMove };
