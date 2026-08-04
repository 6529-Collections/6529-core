#!/usr/bin/env node

const { execFileSync } = require("node:child_process");

const branch = execFileSync("git", ["branch", "--show-current"], {
  encoding: "utf8",
}).trim();

if (branch !== "pull-web") {
  console.error(
    `Refusing to sync the renderer from branch "${branch || "(detached HEAD)"}".`,
  );
  console.error(
    "Run `6529 pull-web` only from the long-lived `pull-web` branch.",
  );
  process.exit(1);
}
