#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const asar = require("@electron/asar");
const { copyResolvedTree } = require("./helpers/copy-resolved-tree.cjs");

const SOURCE_RELATIVE_PATH = path.join("renderer", "out", "node_modules");

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

const copyIntoAsar = async (asarPath, sourceDir) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "6529-afterpack-"));
  try {
    asar.extractAll(asarPath, tempDir);
    const targetDir = path.join(tempDir, SOURCE_RELATIVE_PATH);
    copyDir(sourceDir, targetDir);
    await asar.createPackage(tempDir, asarPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

module.exports = async function afterPack(context) {
  const sourceDir = path.join(context.packager.projectDir, SOURCE_RELATIVE_PATH);
  if (!fs.existsSync(sourceDir)) {
    console.log(
      `[afterPack] Skipped: source directory missing (${sourceDir})`
    );
    return;
  }

  const resourcesDir = resolveResourcesDir(context);
  const asarEnabled = Boolean(context.packager.config.asar);

  if (asarEnabled) {
    const asarPath = path.join(resourcesDir, "app.asar");
    if (!fs.existsSync(asarPath)) {
      throw new Error(`[afterPack] app.asar not found at ${asarPath}`);
    }
    await copyIntoAsar(asarPath, sourceDir);
    console.log(
      `[afterPack] Copied ${SOURCE_RELATIVE_PATH} into ${asarPath}`
    );
    return;
  }

  const appDir = path.join(resourcesDir, "app");
  if (!fs.existsSync(appDir)) {
    throw new Error(`[afterPack] app directory not found at ${appDir}`);
  }
  const targetDir = path.join(appDir, SOURCE_RELATIVE_PATH);
  copyDir(sourceDir, targetDir);
  console.log(
    `[afterPack] Copied ${SOURCE_RELATIVE_PATH} into ${targetDir}`
  );
};
