#!/usr/bin/env node

const path = require("node:path");
const {
  findLatestRendererSync,
  writeRendererSourceManifest,
} = require("./renderer-source.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const { frontendCommit } = findLatestRendererSync(repositoryRoot);
writeRendererSourceManifest(repositoryRoot, frontendCommit);
console.log(`Recorded renderer source commit ${frontendCommit}.`);
