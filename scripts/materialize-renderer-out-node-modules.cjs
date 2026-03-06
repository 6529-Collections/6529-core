#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { copyResolvedTree } = require("./helpers/copy-resolved-tree.cjs");

const ROOT = process.cwd();
const OUT_NODE_MODULES_PATHS = [
  path.join(ROOT, "renderer", "out", "node_modules"),
  path.join(ROOT, "renderer", "out", "dev", "node_modules"),
];
const SOURCE_NODE_MODULES_PATHS = [
  path.join(ROOT, "renderer", "node_modules"),
  path.join(ROOT, "node_modules"),
];

const materializeSymlinksInTree = (rootPath, basePath) => {
  const directoriesToVisit = [rootPath];

  while (directoriesToVisit.length > 0) {
    const currentPath = directoriesToVisit.pop();
    if (!currentPath) {
      continue;
    }

    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      const entryStats = fs.lstatSync(entryPath);

      if (entryStats.isSymbolicLink()) {
        const resolvedPath = fs.realpathSync(entryPath);
        fs.rmSync(entryPath, { recursive: true, force: true });
        copyResolvedTree(resolvedPath, entryPath);
        const relativeEntryPath = path.relative(basePath, entryPath);
        console.log(
          `[materialize-renderer-out-node-modules] Materialized ${path.relative(
            ROOT,
            basePath,
          )}/${relativeEntryPath} -> ${resolvedPath}`
        );
        continue;
      }

      if (entryStats.isDirectory()) {
        directoriesToVisit.push(entryPath);
      }
    }
  }
};

const packageNameToPath = (nodeModulesPath, packageName) =>
  path.join(nodeModulesPath, ...packageName.split("/"));

const readPackageManifest = (packageDirPath) => {
  const packageJsonPath = path.join(packageDirPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    console.warn(
      `[materialize-renderer-out-node-modules] Failed to parse ${packageJsonPath}:`,
      error,
    );
    return null;
  }
};

const listTopLevelPackageDirs = (nodeModulesPath) => {
  const packageDirs = [];
  const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = path.join(nodeModulesPath, entry.name);
    if (!entry.name.startsWith("@")) {
      packageDirs.push(entryPath);
      continue;
    }

    const scopedEntries = fs.readdirSync(entryPath, { withFileTypes: true });
    for (const scopedEntry of scopedEntries) {
      if (scopedEntry.isDirectory()) {
        packageDirs.push(path.join(entryPath, scopedEntry.name));
      }
    }
  }

  return packageDirs;
};

const enqueueDependencies = (queue, processed, manifest) => {
  const dependencyNames = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ];
  for (const dependencyName of dependencyNames) {
    if (!processed.has(dependencyName)) {
      queue.push(dependencyName);
    }
  }
};

const resolveSourcePackageDir = (dependencyName) => {
  for (const sourceNodeModulesPath of SOURCE_NODE_MODULES_PATHS) {
    const sourcePackagePath = packageNameToPath(
      sourceNodeModulesPath,
      dependencyName,
    );
    if (fs.existsSync(sourcePackagePath)) {
      return sourcePackagePath;
    }
  }
  return null;
};

const hydrateDependenciesInOutNodeModules = (outNodeModulesPath) => {
  const processed = new Set();
  const queue = [];

  const topLevelPackageDirs = listTopLevelPackageDirs(outNodeModulesPath);
  for (const topLevelPackageDir of topLevelPackageDirs) {
    const manifest = readPackageManifest(topLevelPackageDir);
    if (!manifest) {
      continue;
    }
    enqueueDependencies(queue, processed, manifest);
  }

  while (queue.length > 0) {
    const dependencyName = queue.shift();
    if (!dependencyName || processed.has(dependencyName)) {
      continue;
    }
    processed.add(dependencyName);

    const targetPackagePath = packageNameToPath(
      outNodeModulesPath,
      dependencyName,
    );
    if (!fs.existsSync(targetPackagePath)) {
      const sourcePackagePath = resolveSourcePackageDir(dependencyName);
      if (!sourcePackagePath) {
        console.warn(
          `[materialize-renderer-out-node-modules] Missing transitive dependency ${dependencyName} for ${path.relative(ROOT, outNodeModulesPath)}`,
        );
        continue;
      }

      copyResolvedTree(sourcePackagePath, targetPackagePath);
      console.log(
        `[materialize-renderer-out-node-modules] Hydrated ${dependencyName} in ${path.relative(ROOT, outNodeModulesPath)} from ${path.relative(ROOT, sourcePackagePath)}`,
      );
    }

    const manifest = readPackageManifest(targetPackagePath);
    if (!manifest) {
      continue;
    }
    enqueueDependencies(queue, processed, manifest);
  }
};

const materializeOutNodeModules = () => {
  let didMaterialize = false;
  for (const outNodeModulesPath of OUT_NODE_MODULES_PATHS) {
    if (!fs.existsSync(outNodeModulesPath)) {
      continue;
    }
    materializeSymlinksInTree(outNodeModulesPath, outNodeModulesPath);
    hydrateDependenciesInOutNodeModules(outNodeModulesPath);
    didMaterialize = true;
  }

  if (!didMaterialize) {
    console.log(
      `[materialize-renderer-out-node-modules] Skipped: missing all configured paths`
    );
  }
};

materializeOutNodeModules();
