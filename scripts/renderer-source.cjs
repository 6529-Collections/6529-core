const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const FRONTEND_REPOSITORY = "6529-Collections/6529seize-frontend";
const FRONTEND_PACKAGE_NAME = "6529seize";
const MANIFEST_PATH = "renderer-source.json";
const SHA_PATTERN = /^[a-f0-9]{40}$/;

function runGit(args, repositoryRoot) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function getCommitParents(commit, repositoryRoot) {
  return runGit(["rev-list", "--parents", "-n", "1", commit], repositoryRoot)
    .split(/\s+/)
    .slice(1);
}

function changesOnlyRenderer(commit, firstParent, repositoryRoot) {
  const changedPaths = runGit(
    ["diff", "--name-only", firstParent, commit, "--"],
    repositoryRoot,
  )
    .split("\n")
    .filter(Boolean);
  return (
    changedPaths.length > 0 &&
    changedPaths.every(
      (changedPath) =>
        changedPath === "renderer" || changedPath.startsWith("renderer/"),
    )
  );
}

function isFrontendCommit(commit, repositoryRoot) {
  try {
    const packageJson = JSON.parse(
      runGit(["show", `${commit}:package.json`], repositoryRoot),
    );
    return packageJson.name === FRONTEND_PACKAGE_NAME;
  } catch {
    return false;
  }
}

function findLatestRendererSync(repositoryRoot) {
  const commits = runGit(
    ["rev-list", "--topo-order", "--merges", "HEAD", "--", "renderer"],
    repositoryRoot,
  )
    .split("\n")
    .filter(Boolean);

  for (const commit of commits) {
    const parents = getCommitParents(commit, repositoryRoot);
    if (parents.length !== 2) {
      continue;
    }
    const [firstParent, frontendCommit] = parents;
    if (
      changesOnlyRenderer(commit, firstParent, repositoryRoot) &&
      isFrontendCommit(frontendCommit, repositoryRoot)
    ) {
      return { mergeCommit: commit, frontendCommit };
    }
  }

  throw new Error(
    "No renderer subtree sync was found in the reachable history.",
  );
}

function readRendererSourceManifest(repositoryRoot) {
  const manifestFile = path.join(repositoryRoot, MANIFEST_PATH);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${MANIFEST_PATH}: ${error.message}`);
  }
  if (
    manifest.repository !== FRONTEND_REPOSITORY ||
    typeof manifest.sha !== "string" ||
    !SHA_PATTERN.test(manifest.sha)
  ) {
    throw new Error(
      `${MANIFEST_PATH} must identify ${FRONTEND_REPOSITORY} with a full lowercase Git SHA.`,
    );
  }
  return manifest;
}

function writeRendererSourceManifest(repositoryRoot, frontendCommit) {
  if (!SHA_PATTERN.test(frontendCommit)) {
    throw new Error("Renderer source commit must be a full lowercase Git SHA.");
  }
  const manifestFile = path.join(repositoryRoot, MANIFEST_PATH);
  fs.writeFileSync(
    manifestFile,
    `${JSON.stringify(
      { repository: FRONTEND_REPOSITORY, sha: frontendCommit },
      null,
      2,
    )}\n`,
  );
}

module.exports = {
  FRONTEND_REPOSITORY,
  MANIFEST_PATH,
  findLatestRendererSync,
  readRendererSourceManifest,
  writeRendererSourceManifest,
};
