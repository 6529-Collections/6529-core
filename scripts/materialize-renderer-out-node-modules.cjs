#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { copyResolvedTree } = require("./helpers/copy-resolved-tree.cjs");

const ROOT = process.cwd();
const OUT_NODE_MODULES = path.join(ROOT, "renderer", "out", "node_modules");

const materializeSymlinksInTree = (rootPath) => {
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
        const relativeEntryPath = path.relative(OUT_NODE_MODULES, entryPath);
        console.log(
          `[materialize-renderer-out-node-modules] Materialized ${relativeEntryPath} -> ${resolvedPath}`
        );
        continue;
      }

      if (entryStats.isDirectory()) {
        directoriesToVisit.push(entryPath);
      }
    }
  }
};

const materializeOutNodeModules = () => {
  if (!fs.existsSync(OUT_NODE_MODULES)) {
    console.log(
      `[materialize-renderer-out-node-modules] Skipped: missing ${OUT_NODE_MODULES}`
    );
    return;
  }

  materializeSymlinksInTree(OUT_NODE_MODULES);
};

materializeOutNodeModules();
