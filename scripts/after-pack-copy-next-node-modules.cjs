#!/usr/bin/env node

const fs = require("node:fs");
const { createRequire } = require("node:module");
const os = require("node:os");
const path = require("node:path");
const asar = require("@electron/asar");
const { copyResolvedTree } = require("./helpers/copy-resolved-tree.cjs");

const SOURCE_RELATIVE_PATHS = [
  path.join("renderer", "out", "node_modules"),
  path.join("renderer", "out", "dev", "node_modules"),
];

const copyDir = (from, to, allowedRoots = []) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.rmSync(to, { recursive: true, force: true });
  copyResolvedTree(from, to, { allowedRoots });
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const packageFolderName = (packageName) => {
  if (packageName.startsWith("@")) {
    const [scope, name] = packageName.split("/");
    return path.join(scope, name);
  }
  return packageName;
};

const resolvePackageDir = (packageName, fromDir) => {
  const fromRequire = createRequire(path.join(fromDir, "__resolve.js"));
  const findPackageDirFromLookupPaths = () => {
    const candidateRoots = [
      path.join(fromDir, "node_modules"),
      ...(fromRequire.resolve.paths(packageName) || []),
    ];
    for (const candidateRoot of candidateRoots) {
      const packageJsonPath = path.join(
        candidateRoot,
        packageFolderName(packageName),
        "package.json",
      );
      if (fs.existsSync(packageJsonPath)) {
        return fs.realpathSync(path.dirname(packageJsonPath));
      }
    }
    return null;
  };

  try {
    const packageJsonPath = fromRequire.resolve(
      path.join(packageName, "package.json"),
    );
    return fs.realpathSync(path.dirname(packageJsonPath));
  } catch (error) {
    if (
      error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED" &&
      error.code !== "MODULE_NOT_FOUND"
    ) {
      throw error;
    }
  }

  const packageDir = findPackageDirFromLookupPaths();
  if (packageDir) {
    return packageDir;
  }

  try {
    let currentDir = path.dirname(fromRequire.resolve(packageName));
    while (currentDir !== path.dirname(currentDir)) {
      if (fs.existsSync(path.join(currentDir, "package.json"))) {
        return fs.realpathSync(currentDir);
      }
      currentDir = path.dirname(currentDir);
    }
  } catch (error) {
    if (
      error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED" &&
      error.code !== "MODULE_NOT_FOUND"
    ) {
      throw error;
    }
  }

  throw new Error(`Unable to locate package.json for ${packageName}`);
};

const dependencyNames = (packageJson) =>
  Object.keys({
    ...(packageJson.dependencies || {}),
    ...(packageJson.optionalDependencies || {}),
  });

const packageVersion = (packageDir) => {
  const packageJsonPath = path.join(packageDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }
  return readJson(packageJsonPath).version ?? null;
};

const targetPackageMatchesSource = (sourcePackageDir, targetPackageDir) => {
  const sourceVersion = packageVersion(sourcePackageDir);
  const targetVersion = packageVersion(targetPackageDir);
  return sourceVersion != null && sourceVersion === targetVersion;
};

const materializeDependencyTree = (
  sourcePackageDir,
  targetPackageDir,
  allowedRoots,
  visited = new Set(),
) => {
  const sourcePackageJsonPath = path.join(sourcePackageDir, "package.json");
  const targetPackageJsonPath = path.join(targetPackageDir, "package.json");
  if (!fs.existsSync(sourcePackageJsonPath) || !fs.existsSync(targetPackageJsonPath)) {
    return;
  }

  const sourcePackageJson = readJson(sourcePackageJsonPath);
  for (const dependencyName of dependencyNames(sourcePackageJson)) {
    let sourceDependencyDir;
    try {
      sourceDependencyDir = resolvePackageDir(dependencyName, sourcePackageDir);
    } catch (error) {
      if (sourcePackageJson.optionalDependencies?.[dependencyName]) {
        continue;
      }
      throw error;
    }

    const targetDependencyDir = path.join(
      targetPackageDir,
      "node_modules",
      packageFolderName(dependencyName),
    );
    if (
      !fs.existsSync(targetDependencyDir) ||
      !targetPackageMatchesSource(sourceDependencyDir, targetDependencyDir)
    ) {
      copyDir(sourceDependencyDir, targetDependencyDir, allowedRoots);
    }

    const visitKey = `${sourceDependencyDir}->${targetDependencyDir}`;
    if (visited.has(visitKey)) {
      continue;
    }
    visited.add(visitKey);
    materializeDependencyTree(
      sourceDependencyDir,
      targetDependencyDir,
      allowedRoots,
      visited,
    );
  }
};

const materializePackagedNodeModules = (appDir, projectDir, allowedRoots) => {
  const targetNodeModulesDir = path.join(appDir, "node_modules");
  const sourceNodeModulesDir = path.join(projectDir, "node_modules");
  if (!fs.existsSync(targetNodeModulesDir) || !fs.existsSync(sourceNodeModulesDir)) {
    return;
  }

  const entries = fs.readdirSync(targetNodeModulesDir);
  for (const entry of entries) {
    if (entry.startsWith(".")) {
      continue;
    }

    if (entry.startsWith("@")) {
      const scopeDir = path.join(targetNodeModulesDir, entry);
      if (!fs.statSync(scopeDir).isDirectory()) {
        continue;
      }
      for (const scopedEntry of fs.readdirSync(scopeDir)) {
        const packageName = `${entry}/${scopedEntry}`;
        const sourcePackageDir = resolvePackageDir(packageName, projectDir);
        const targetPackageDir = path.join(scopeDir, scopedEntry);
        materializeDependencyTree(sourcePackageDir, targetPackageDir, allowedRoots);
      }
      continue;
    }

    const targetPackageDir = path.join(targetNodeModulesDir, entry);
    if (!fs.statSync(targetPackageDir).isDirectory()) {
      continue;
    }
    const sourcePackageDir = resolvePackageDir(entry, projectDir);
    materializeDependencyTree(sourcePackageDir, targetPackageDir, allowedRoots);
  }
};

const assertElectronUpdaterRuntime = (appDir) => {
  const electronUpdaterDir = path.join(appDir, "node_modules", "electron-updater");
  const electronUpdaterPackageJsonPath = path.join(
    electronUpdaterDir,
    "package.json",
  );
  if (!fs.existsSync(electronUpdaterPackageJsonPath)) {
    return;
  }

  const electronUpdaterPackageJson = readJson(electronUpdaterPackageJsonPath);
  const expectedVersion =
    electronUpdaterPackageJson.dependencies?.["builder-util-runtime"];
  if (!expectedVersion) {
    return;
  }

  const resolvedRuntimeDir = resolvePackageDir(
    "builder-util-runtime",
    electronUpdaterDir,
  );
  const actualVersion = packageVersion(resolvedRuntimeDir);
  if (actualVersion !== expectedVersion) {
    throw new Error(
      `[afterPack] electron-updater requires builder-util-runtime@${expectedVersion}, ` +
        `but packaged app resolves ${actualVersion ?? "unknown"} from ${resolvedRuntimeDir}`,
    );
  }
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

const copyIntoAsar = async (asarPath, copyEntries, allowedRoots, projectDir) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "6529-afterpack-"));
  try {
    asar.extractAll(asarPath, tempDir);
    for (const { sourceDir, relativePath } of copyEntries) {
      const targetDir = path.join(tempDir, relativePath);
      copyDir(sourceDir, targetDir, allowedRoots);
    }
    materializePackagedNodeModules(tempDir, projectDir, allowedRoots);
    assertElectronUpdaterRuntime(tempDir);
    await asar.createPackage(tempDir, asarPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

module.exports = async function afterPack(context) {
  const allowedSourceRoots = [context.packager.projectDir];
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
    await copyIntoAsar(
      asarPath,
      copyEntries,
      allowedSourceRoots,
      context.packager.projectDir,
    );
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
    copyDir(sourceDir, targetDir, allowedSourceRoots);
    console.log(`[afterPack] Copied ${relativePath} into ${targetDir}`);
  }
  materializePackagedNodeModules(
    appDir,
    context.packager.projectDir,
    allowedSourceRoots,
  );
  assertElectronUpdaterRuntime(appDir);
};
