#!/usr/bin/env node

// Windows release steps, split between the off-CI build and the CI
// "Sign Windows" workflow, which holds the signing key.
//
//   upload-unsigned <staging|production>   off-CI, after the build
//     Uploads the unsigned app folders (one zip per architecture, made by
//     electron-builder's zip target) to <feed>/win-unsigned/.
//
//   sign-publish <staging|production>      CI
//     Downloads those zips, signs the executables inside, builds each
//     architecture's NSIS installer from the signed folder with
//     electron-builder (which signs the installer and uninstaller through
//     scripts/windows-sign-hook.cjs and only then writes the block map and
//     latest.yml), merges the per-architecture latest.yml files, verifies
//     every signature, keeps the feed's previous latest.yml for rollback,
//     and uploads the installers to <feed>/win/.
//
// Each architecture gets its own installer and its own latest.yml entry;
// the two-architecture installer is no longer built. electron-updater 6.7
// and later pick the entry whose file name contains their architecture.

const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");
const { signFile } = require("./windows-sign-hook.cjs");
const { resolvePnpmCommand } = require("./helpers/pnpm-command.cjs");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const WORK = path.join(ROOT, "release-work");
const BUCKET = "6529bucket";

const RELEASES = {
  staging: {
    config: "electron-builder.staging.json",
    prefix: "6529-staging-core-app",
    artifact: "6529-DESKTOP-STAGING-win",
    archs: ["x64"],
  },
  production: {
    config: "electron-builder.production.json",
    prefix: "6529-core-app",
    artifact: "6529-DESKTOP-win",
    archs: ["x64", "arm64"],
  },
};

const PUBLISHER = "6529 Collection LLC";

function version() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
}

function run(command, args, options = {}) {
  const resolved = resolvePnpmCommand(command, args);
  const result = spawnSync(resolved.executable, resolved.args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: resolved.shell ?? false,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
}

function aws(args) {
  run("aws", args);
}

function zipName(release, arch) {
  return `${release.artifact}-${arch}-${version()}.zip`;
}

function installerName(release, arch) {
  return `${release.artifact}-${arch}-${version()}.exe`;
}

function uploadUnsigned(release) {
  const zips = release.archs.map((arch) => path.join(DIST, zipName(release, arch)));
  for (const zip of zips) {
    if (!fs.existsSync(zip)) throw new Error(`missing ${path.relative(ROOT, zip)}; build first`);
  }
  const target = `s3://${BUCKET}/${release.prefix}/win-unsigned/`;
  aws(["s3", "rm", target, "--recursive", ...dryRun()]);
  for (const zip of zips) {
    aws(["s3", "cp", zip, target, ...dryRun()]);
  }
}

function dryRun() {
  return process.env.WINDOWS_RELEASE_DRY_RUN === "1" ? ["--dryrun"] : [];
}

function extractZip(zip, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  // 7-Zip ships on the GitHub Windows images; tar (bsdtar) reads zips too.
  const sevenZip = spawnSync("7z", ["x", "-y", `-o${destination}`, zip], { stdio: "inherit" });
  if (sevenZip.error || sevenZip.status !== 0) {
    execFileSync("tar", ["-xf", zip, "-C", destination], { stdio: "inherit" });
  }
  // The app folder is the one holding the executable, at the root or in a
  // single top-level folder.
  const hasExe = (dir) => fs.readdirSync(dir).some((name) => name.toLowerCase().endsWith(".exe"));
  if (hasExe(destination)) return destination;
  const entries = fs.readdirSync(destination, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (entries.length === 1 && hasExe(path.join(destination, entries[0].name))) {
    return path.join(destination, entries[0].name);
  }
  throw new Error(`no app executable in ${path.basename(zip)}`);
}

function listFiles(dir, predicate) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, predicate));
    else if (predicate(full)) out.push(full);
  }
  return out;
}

/** Status and signer of an Authenticode signature (PowerShell). */
function signatureOf(file) {
  const script =
    "$s = Get-AuthenticodeSignature -LiteralPath $env:SIGNED_FILE; " +
    "'{0}|{1}' -f $s.Status, $s.SignerCertificate.Subject";
  const output = execFileSync("powershell", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    env: { ...process.env, SIGNED_FILE: file },
  }).trim();
  const [status, subject = ""] = output.split("|");
  return { status, subject };
}

function assertSigned(file) {
  const { status, subject } = signatureOf(file);
  if (status !== "Valid" || !subject.includes(PUBLISHER)) {
    throw new Error(`${path.basename(file)} is not validly signed by ${PUBLISHER}: ${status} ${subject}`);
  }
  console.log(`[windows-release] signature ok: ${path.basename(file)}`);
}

function mergeLatest(release, perArch) {
  const entries = release.archs.map((arch) => {
    const info = perArch[arch];
    const file = info.files.find((entry) => entry.url === installerName(release, arch));
    if (!file) throw new Error(`latest.yml for ${arch} does not list ${installerName(release, arch)}`);
    return file;
  });
  const first = entries[0];
  return {
    version: version(),
    files: entries,
    path: first.url,
    sha512: first.sha512,
    releaseDate: new Date().toISOString(),
  };
}

/**
 * Copies the feed's current latest.yml for rollback. A feed without one (a
 * first release) is fine; any other failure stops the release before it
 * replaces the only copy.
 */
function saveRollbackCopy(release, destination, spawn = spawnSync) {
  const key = `${release.prefix}/win/latest.yml`;
  const head = spawn("aws", ["s3api", "head-object", "--bucket", BUCKET, "--key", key], { encoding: "utf8" });
  if (head.error) throw head.error;
  if (head.status !== 0) {
    if (/\b404\b|Not Found|NoSuchKey/.test(String(head.stderr ?? ""))) {
      console.log("[windows-release] no previous latest.yml on the feed");
      return false;
    }
    throw new Error(`[windows-release] cannot check the feed's latest.yml: ${String(head.stderr ?? "").trim()}`);
  }
  const copy = spawn("aws", ["s3", "cp", `s3://${BUCKET}/${key}`, destination], { stdio: "inherit" });
  if (copy.error) throw copy.error;
  if (copy.status !== 0) {
    throw new Error("[windows-release] could not copy the feed's latest.yml for rollback");
  }
  return true;
}

function signPublish(release) {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(path.join(WORK, "rollback"), { recursive: true });
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const feed = `s3://${BUCKET}/${release.prefix}/win`;
  // Keep the feed's current latest.yml so the release can be rolled back.
  saveRollbackCopy(release, path.join(WORK, "rollback", "latest.yml"));

  aws(["s3", "sync", `s3://${BUCKET}/${release.prefix}/win-unsigned/`, WORK, "--exclude", "*", "--include", "*.zip"]);

  const perArch = {};
  for (const arch of release.archs) {
    const zip = path.join(WORK, zipName(release, arch));
    if (!fs.existsSync(zip)) throw new Error(`missing ${zipName(release, arch)} in win-unsigned`);
    const appDir = extractZip(zip, path.join(WORK, `unpacked-${arch}`));
    // Without it the installed app cannot find the update feed.
    if (!fs.existsSync(path.join(appDir, "resources", "app-update.yml"))) {
      throw new Error(`${zipName(release, arch)} has no resources/app-update.yml`);
    }
    for (const exe of listFiles(appDir, (file) => file.toLowerCase().endsWith(".exe"))) {
      signFile(exe, { ...process.env, WINDOWS_SIGNING_REQUIRED: "1" });
      assertSigned(exe);
    }
    run(
      "pnpm",
      ["exec", "electron-builder", "--config", release.config, "--win", "nsis", `--${arch}`, "--prepackaged", appDir, "--publish", "never"],
      { env: { WINDOWS_SIGNING_REQUIRED: "1" } },
    );
    const latest = path.join(DIST, "latest.yml");
    perArch[arch] = yaml.load(fs.readFileSync(latest, "utf8"));
    fs.renameSync(latest, path.join(WORK, `latest-${arch}.yml`));
  }

  const merged = mergeLatest(release, perArch);
  fs.writeFileSync(path.join(DIST, "latest.yml"), yaml.dump(merged, { lineWidth: -1 }));

  const artifacts = release.archs.flatMap((arch) => [installerName(release, arch), `${installerName(release, arch)}.blockmap`]);
  for (const arch of release.archs) assertSigned(path.join(DIST, installerName(release, arch)));
  for (const name of [...artifacts, "latest.yml"]) {
    if (!fs.existsSync(path.join(DIST, name))) throw new Error(`missing ${name}`);
  }
  console.log(fs.readFileSync(path.join(DIST, "latest.yml"), "utf8"));

  for (const name of artifacts) aws(["s3", "cp", path.join(DIST, name), `${feed}/`, ...dryRun()]);
  // latest.yml last, once the files it points at are in place.
  aws(["s3", "cp", path.join(DIST, "latest.yml"), `${feed}/`, ...dryRun()]);
}

function main() {
  const [command, environment] = process.argv.slice(2);
  const release = RELEASES[environment];
  if (!release || !["upload-unsigned", "sign-publish"].includes(command)) {
    console.error("Usage: node scripts/windows-release.cjs <upload-unsigned|sign-publish> <staging|production>");
    process.exit(2);
  }
  if (command === "upload-unsigned") uploadUnsigned(release);
  else signPublish(release);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[windows-release] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

module.exports = { mergeLatest, RELEASES, installerName, saveRollbackCopy, zipName };
