#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/run-renderer-pnpm.cjs <pnpm-args...>");
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, "..");
const rendererRoot = path.join(repoRoot, "renderer");

function findWindowsBash() {
  const candidates = [
    process.env["GIT_BASH"],
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

const env = {
  ...process.env,
  SEIZE_6529_COMMAND: "1",
};

if (process.platform === "win32" && !env.npm_config_script_shell) {
  const bash = findWindowsBash();
  if (!bash) {
    console.error(
      "Git Bash was not found. Set GIT_BASH to bash.exe before running renderer scripts on Windows.",
    );
    process.exit(1);
  }
  env.npm_config_script_shell = bash;
}

const result = spawnSync("pnpm", args, {
  cwd: rendererRoot,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
