#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const OUT_NODE_MODULES = path.join(ROOT, "renderer", "out", "node_modules");

const copyResolvedTree = (source, destination) => {
  const stats = fs.lstatSync(source);

  if (stats.isSymbolicLink()) {
    const resolved = fs.realpathSync(source);
    copyResolvedTree(resolved, destination);
    return;
  }

  if (stats.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyResolvedTree(
        path.join(source, entry),
        path.join(destination, entry)
      );
    }
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
};

const materializeOutNodeModules = () => {
  if (!fs.existsSync(OUT_NODE_MODULES)) {
    console.log(
      `[materialize-renderer-out-node-modules] Skipped: missing ${OUT_NODE_MODULES}`
    );
    return;
  }

  const entries = fs.readdirSync(OUT_NODE_MODULES);
  for (const entry of entries) {
    const entryPath = path.join(OUT_NODE_MODULES, entry);
    const stats = fs.lstatSync(entryPath);
    if (!stats.isSymbolicLink()) {
      continue;
    }

    const resolvedPath = fs.realpathSync(entryPath);
    fs.rmSync(entryPath, { recursive: true, force: true });
    copyResolvedTree(resolvedPath, entryPath);
    console.log(
      `[materialize-renderer-out-node-modules] Materialized ${entry} -> ${resolvedPath}`
    );
  }
};

materializeOutNodeModules();
