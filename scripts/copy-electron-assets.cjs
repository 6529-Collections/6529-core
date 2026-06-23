#!/usr/bin/env node

const path = require("node:path");
const { copyResolvedTree } = require("./helpers/copy-resolved-tree.cjs");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "assets");
const DESTINATION = path.join(ROOT, "main", "electron-src", "assets");

copyResolvedTree(SOURCE, DESTINATION, { allowedRoots: [ROOT] });

console.log(
  `[copy-electron-assets] Copied ${path.relative(ROOT, SOURCE)} to ${path.relative(
    ROOT,
    DESTINATION,
  )}`
);
