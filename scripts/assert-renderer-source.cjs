#!/usr/bin/env node

const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  findLatestRendererSync,
  readRendererSourceManifest,
} = require("./renderer-source.cjs");

const repositoryRoot = path.resolve(__dirname, "..");

function readGitValue(args) {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

try {
  const manifest = readRendererSourceManifest(repositoryRoot);
  const isShallowRepository =
    readGitValue(["rev-parse", "--is-shallow-repository"]) === "true";
  const isPartialRepository = Boolean(
    readGitValue(["config", "--get", "extensions.partialclone"]) ||
    readGitValue(["config", "--get", "remote.origin.partialclonefilter"]) ||
    readGitValue(["config", "--get", "remote.origin.promisor"]) === "true",
  );
  if (isShallowRepository || isPartialRepository) {
    console.log(
      `Renderer source manifest is valid at ${manifest.sha}; history comparison is unavailable in this shallow or partial checkout.`,
    );
    process.exit(0);
  }
  const sync = findLatestRendererSync(repositoryRoot);
  if (manifest.sha !== sync.frontendCommit) {
    throw new Error(
      `renderer-source.json records ${manifest.sha}, but the latest reachable renderer sync ${sync.mergeCommit} imports ${sync.frontendCommit}.`,
    );
  }
  console.log(`Renderer source manifest matches ${manifest.sha}.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
