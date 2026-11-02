#!/usr/bin/env node
// Both local packaging and GitHub publish through this entrypoint. Artifacts
// go first; the normalized, verified updater manifest is the final write.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const yaml = require("js-yaml");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const {
  minimumDarwinVersion,
  normalizeMacManifest,
  hashFile,
  verifyMacArtifacts,
} = require("./helpers/mac-release.cjs");

async function prepare(config, version, manifestPath, directories, generate) {
  let manifest;
  if (generate) {
    const files = [];
    for (const directory of directories) {
      for (const name of fs.readdirSync(directory).sort()) {
        if (
          !name.endsWith(`-${version}.zip`) &&
          !name.endsWith(`-${version}.dmg`)
        )
          continue;
        const file = path.join(directory, name);
        files.push({
          url: name,
          sha512: await hashFile(file),
          size: fs.statSync(file).size,
        });
      }
    }
    const defaultFile =
      files.find(
        (file) => file.url.includes("-mac-arm64-") && file.url.endsWith(".zip"),
      ) ?? files.find((file) => file.url.endsWith(".zip"));
    manifest = {
      version,
      files,
      path: defaultFile?.url,
      sha512: defaultFile?.sha512,
      releaseDate: new Date().toISOString(),
    };
  } else {
    manifest = yaml.load(fs.readFileSync(manifestPath, "utf8"));
    if (manifest?.version !== version)
      throw new Error("Mac manifest does not match the requested version");
  }
  manifest = normalizeMacManifest(manifest, config);
  const artifacts = await verifyMacArtifacts(manifest, directories);
  fs.writeFileSync(manifestPath, yaml.dump(manifest, { lineWidth: -1 }));
  return { manifest, artifacts };
}

async function publish(config, manifestPath, artifacts, dependencies = {}) {
  const destination = config.publish?.[0];
  if (
    destination?.provider !== "s3" ||
    destination.bucket !== "6529bucket" ||
    !/^6529-(?:staging-)?core-app\/\$\{os\}$/.test(destination.path)
  ) {
    throw new Error("Unrecognized Mac release destination");
  }
  const prefix = destination.path.replace("${os}", "mac");
  const s3 = dependencies.s3 ?? new S3Client({ region: destination.region });
  const key = `${prefix}/latest-mac.yml`;
  let previous;
  try {
    previous = await s3.send(
      new GetObjectCommand({ Bucket: destination.bucket, Key: key }),
    );
  } catch (error) {
    if (error.name !== "NoSuchKey") throw error;
  }
  if (previous) {
    const body = await previous.Body.transformToByteArray();
    await s3.send(
      new PutObjectCommand({
        Bucket: destination.bucket,
        Key: `${prefix}/manifest-backups/${Date.now()}-latest-mac.yml`,
        Body: body,
        ContentType: "text/yaml",
        IfNoneMatch: "*",
      }),
    );
  }
  for (const [name, location] of artifacts) {
    for (const suffix of ["", ".blockmap"]) {
      const result = (dependencies.spawnSync ?? spawnSync)(
        "aws",
        [
          "s3",
          "cp",
          `${location}${suffix}`,
          `s3://${destination.bucket}/${prefix}/${name}${suffix}`,
          "--region",
          destination.region,
        ],
        { stdio: "inherit" },
      );
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(`Mac upload failed: ${name}${suffix}`);
    }
  }
  await s3.send(
    new PutObjectCommand({
      Bucket: destination.bucket,
      Key: key,
      Body: fs.readFileSync(manifestPath),
      ContentType: "text/yaml",
      CacheControl: "no-cache",
      ...(previous ? { IfMatch: previous.ETag } : { IfNoneMatch: "*" }),
    }),
  );
  // latest-macos-12.yml is intentionally never generated or overwritten here.
  console.log(`[mac-release] Published ${key}; legacy feed preserved`);
}

async function main() {
  const [command, configPath, version, manifestPath, ...directories] =
    process.argv.slice(2);
  if (
    !["prepare", "generate", "publish"].includes(command) ||
    !configPath ||
    !version ||
    path.basename(manifestPath ?? "") !== "latest-mac.yml" ||
    !directories.length
  ) {
    throw new Error(
      "Usage: mac-release.cjs <prepare|generate|publish> <config.json> <version> <latest-mac.yml> <artifact-directory> [...]",
    );
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const result = await prepare(
    config,
    version,
    manifestPath,
    directories,
    command === "generate",
  );
  console.log(
    `[mac-release] Verified ${result.manifest.files.length} unique files; minimum Darwin ${minimumDarwinVersion(config)}`,
  );
  if (command === "publish")
    await publish(config, manifestPath, result.artifacts);
}

if (require.main === module)
  main().catch((error) => {
    console.error(`[mac-release] ${error.message}`);
    process.exitCode = 1;
  });
module.exports = { prepare, publish };
