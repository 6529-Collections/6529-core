#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const asar = require("@electron/asar");
const { copyResolvedTree } = require("./helpers/copy-resolved-tree.cjs");

const SOURCE_RELATIVE_PATHS = [
  path.join("renderer", "out", "node_modules"),
  path.join("renderer", "out", "dev", "node_modules"),
];

const copyDir = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.rmSync(to, { recursive: true, force: true });
  copyResolvedTree(from, to);
};

const resolveResourcesDir = (context) => {
  const { appOutDir, electronPlatformName, packager } = context;

  if (electronPlatformName === "darwin") {
    const preferred = path.join(
      appOutDir,
      `${packager.appInfo.productFilename}.app`,
      "Contents",
      "Resources"
    );
    if (fs.existsSync(preferred)) {
      return preferred;
    }

    const macBundle = fs
      .readdirSync(appOutDir, { withFileTypes: true })
      .find((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
    if (!macBundle) {
      throw new Error(`No .app bundle found in ${appOutDir}`);
    }
    return path.join(appOutDir, macBundle.name, "Contents", "Resources");
  }

  return path.join(appOutDir, "resources");
};

const copyIntoAsar = async (asarPath, copyEntries) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "6529-afterpack-"));
  try {
    asar.extractAll(asarPath, tempDir);
    for (const { sourceDir, relativePath } of copyEntries) {
      const targetDir = path.join(tempDir, relativePath);
      copyDir(sourceDir, targetDir);
    }
    await asar.createPackage(tempDir, asarPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

module.exports = async function afterPack(context) {
  const copyEntries = SOURCE_RELATIVE_PATHS.map((relativePath) => ({
    relativePath,
    sourceDir: path.join(context.packager.projectDir, relativePath),
  })).filter(({ sourceDir }) => fs.existsSync(sourceDir));

  if (copyEntries.length === 0) {
    throw new Error(
      `[afterPack] Missing renderer node_modules directories. Expected one of: ${SOURCE_RELATIVE_PATHS.join(
        ", ",
      )}`,
    );
  }

  const resourcesDir = resolveResourcesDir(context);
  const asarEnabled = Boolean(context.packager.config.asar);

  if (asarEnabled) {
    const asarPath = path.join(resourcesDir, "app.asar");
    if (!fs.existsSync(asarPath)) {
      throw new Error(`[afterPack] app.asar not found at ${asarPath}`);
    }
    await copyIntoAsar(asarPath, copyEntries);
    for (const { relativePath } of copyEntries) {
      console.log(`[afterPack] Copied ${relativePath} into ${asarPath}`);
    }
    return;
  }

  const appDir = path.join(resourcesDir, "app");
  if (!fs.existsSync(appDir)) {
    throw new Error(`[afterPack] app directory not found at ${appDir}`);
  }
  for (const { sourceDir, relativePath } of copyEntries) {
    const targetDir = path.join(appDir, relativePath);
    copyDir(sourceDir, targetDir);
    console.log(`[afterPack] Copied ${relativePath} into ${targetDir}`);
  }
};
