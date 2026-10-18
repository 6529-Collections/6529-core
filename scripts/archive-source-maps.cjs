#!/usr/bin/env node

// Source maps are left out of the packaged app (electron-builder files
// "!**/*.map"). This keeps the renderer's maps from the same build as a
// separate artifact, dist/desktop-source-maps-<version>.tar.gz, for reading
// stack traces later. It is not uploaded to any update feed.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "renderer", "out");

function listMaps(dir, base = dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "cache") continue;
      listMaps(full, base, found);
    } else if (entry.name.endsWith(".map")) {
      found.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return found;
}

function main() {
  if (!fs.existsSync(OUT)) {
    console.log("[source-maps] no renderer build; nothing to archive");
    return;
  }
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  const maps = listMaps(OUT);
  if (maps.length === 0) {
    console.log("[source-maps] the renderer build has no source maps");
    return;
  }
  const dist = path.join(ROOT, "dist");
  fs.mkdirSync(dist, { recursive: true });
  const archive = path.join(dist, `desktop-source-maps-${version}.tar.gz`);
  const list = path.join(dist, ".source-maps.txt");
  fs.writeFileSync(list, maps.join("\n") + "\n");
  try {
    // Run from the build folder with relative paths only: GNU tar reads
    // "C:..." as a remote host.
    execFileSync("tar", ["-czf", path.relative(OUT, archive), "-T", path.relative(OUT, list)], {
      cwd: OUT,
      stdio: "inherit",
    });
  } finally {
    fs.rmSync(list, { force: true });
  }
  const mb = (fs.statSync(archive).size / 1e6).toFixed(1);
  console.log(`[source-maps] ${maps.length} maps archived in ${path.relative(ROOT, archive)} (${mb} MB)`);
}

main();
