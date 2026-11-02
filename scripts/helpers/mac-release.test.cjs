const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const yaml = require("js-yaml");
const {
  normalizeMacManifest,
  minimumDarwinVersion,
  hashFile,
  verifyMacArtifacts,
} = require("./mac-release.cjs");
const { prepare, publish } = require("../mac-release.cjs");
const config = { mac: { minimumSystemVersion: "13.0" } };
const hash = Buffer.alloc(64, 1).toString("base64");
const zip = {
  url: "6529-DESKTOP-mac-arm64-0.3.16.zip",
  sha512: hash,
  size: 123,
};
const dmg = { ...zip, url: zip.url.replace(".zip", ".dmg") };
const manifest = {
  version: "0.3.16",
  files: [zip, dmg, dmg],
  path: zip.url,
  sha512: hash,
};

test("normalizes duplicate entries and uses Darwin, not macOS, in update feeds", () => {
  const normalized = normalizeMacManifest(manifest, config);
  assert.equal(normalized.minimumSystemVersion, "22.0.0");
  assert.deepEqual(normalized.files, [zip, dmg]);
  assert.equal(manifest.files.length, 3);
  assert.equal(
    minimumDarwinVersion({ mac: { minimumSystemVersion: "14.0" } }),
    "23.0.0",
  );
});
test("rejects conflicting duplicates, invalid paths/hashes and incomplete architecture pairs", () => {
  for (const files of [
    [zip, { ...zip, size: 42 }, dmg],
    [zip],
    [zip, { ...dmg, url: "../bad.dmg" }],
    [zip, { ...dmg, sha512: "bad" }],
  ]) {
    assert.throws(() => normalizeMacManifest({ ...manifest, files }, config));
  }
  assert.throws(() =>
    normalizeMacManifest({ ...manifest, sha512: "wrong" }, config),
  );
  assert.throws(() =>
    minimumDarwinVersion({ mac: { minimumSystemVersion: "12.0" } }),
  );
});
test("both architectures are generated once and final on-disk artifacts are verified", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mac-release-"));
  try {
    const locations = ["arm64", "x64"].map((arch) => {
      const dir = path.join(directory, arch);
      fs.mkdirSync(dir);
      for (const ext of ["zip", "dmg"]) {
        const file = path.join(dir, `6529-DESKTOP-mac-${arch}-0.3.16.${ext}`);
        fs.writeFileSync(file, `${arch}-${ext}`);
        fs.writeFileSync(`${file}.blockmap`, "blockmap");
      }
      return dir;
    });
    const target = path.join(directory, "latest-mac.yml");
    const legacy = path.join(directory, "latest-macos-12.yml");
    fs.writeFileSync(legacy, "preserve legacy");
    const result = await prepare(config, "0.3.16", target, locations, true);
    assert.equal(result.manifest.files.length, 4);
    assert.equal(
      yaml.load(fs.readFileSync(target, "utf8")).minimumSystemVersion,
      "22.0.0",
    );
    assert.equal(fs.readFileSync(legacy, "utf8"), "preserve legacy");
    const first = result.artifacts.values().next().value;
    assert.equal(await hashFile(first), result.manifest.files[0].sha512);
    fs.appendFileSync(first, "corrupt");
    await assert.rejects(
      verifyMacArtifacts(result.manifest, locations),
      /size\/hash mismatch/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test("every Mac config advertises the same app and updater minimum", () => {
  for (const name of [
    "local",
    "production",
    "staging",
    "production-mac-arm64",
    "production-mac-x64",
  ]) {
    const c = require(`../../electron-builder.${name}.json`);
    assert.equal(minimumDarwinVersion(c), "22.0.0");
  }
  const source = fs.readFileSync(
    path.join(__dirname, "../desktop-build-target.cjs"),
    "utf8",
  );
  assert.match(source, /publishMacConfig: "electron-builder.staging.json"/);
  assert.match(source, /publishMacConfig: "electron-builder.production.json"/);
  const workflow = fs.readFileSync(
    path.join(__dirname, "../../.github/workflows/build-mac.yml"),
    "utf8",
  );
  assert.match(workflow, /node scripts\/mac-release.cjs generate/);
  assert.match(workflow, /node scripts\/mac-release.cjs publish/);
  assert.doesNotMatch(workflow, /aws s3 cp latest-mac.yml/);
});

test("publisher backs up the feed, uploads artifacts first, and conditionally writes only the current manifest", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mac-publish-"));
  try {
    const target = path.join(directory, "latest-mac.yml");
    fs.writeFileSync(target, "new manifest");
    const operations = [];
    const s3 = {
      send: async (command) => {
        operations.push({ kind: command.constructor.name, ...command.input });
        if (command.constructor.name === "GetObjectCommand")
          return {
            ETag: '"old-etag"',
            Body: {
              transformToByteArray: async () => Buffer.from("old manifest"),
            },
          };
        return {};
      },
    };
    await publish(
      {
        publish: [
          {
            provider: "s3",
            bucket: "6529bucket",
            region: "eu-west-1",
            path: "6529-core-app/${os}",
          },
        ],
      },
      target,
      new Map([[zip.url, "fixture.zip"]]),
      {
        s3,
        spawnSync: (_command, args) => {
          operations.push({ kind: "upload", args });
          return { status: 0 };
        },
      },
    );
    assert.equal(operations[1].Body.toString(), "old manifest");
    assert.match(operations[1].Key, /manifest-backups\//);
    assert.match(operations[1].Key, /\d+-[0-9a-f-]{36}-latest-mac\.yml$/);
    assert.equal(operations.at(-1).Key, "6529-core-app/mac/latest-mac.yml");
    assert.equal(operations.at(-1).IfMatch, '"old-etag"');
    assert.deepEqual(
      operations.slice(2, -1).map((op) => op.kind),
      ["upload", "upload"],
    );
    assert.ok(
      operations.every((op) => !op.Key?.includes("latest-macos-12.yml")),
    );
    await assert.rejects(
      publish(
        {
          publish: [
            { provider: "s3", bucket: "other", path: "6529-core-app/${os}" },
          ],
        },
        target,
        new Map(),
        { s3 },
      ),
      /Unrecognized/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("publisher accepts missing-key 404s, validates region and rejects other read failures", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "mac-first-publish-"),
  );
  const config = {
    publish: [
      {
        provider: "s3",
        bucket: "6529bucket",
        region: "eu-west-1",
        path: "6529-core-app/${os}",
      },
    ],
  };
  try {
    const target = path.join(directory, "latest-mac.yml");
    fs.writeFileSync(target, "manifest");
    const writes = [];
    const s3 = {
      send: async (command) => {
        if (command.constructor.name === "GetObjectCommand")
          throw Object.assign(new Error("missing"), {
            $metadata: { httpStatusCode: 404 },
          });
        writes.push(command.input);
        return {};
      },
    };
    await publish(config, target, new Map(), { s3 });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].IfNoneMatch, "*");
    assert.equal(writes[0].Key, "6529-core-app/mac/latest-mac.yml");
    await assert.rejects(
      publish(
        { publish: [{ ...config.publish[0], region: undefined }] },
        target,
        new Map(),
        { s3 },
      ),
      /region eu-west-1/,
    );
    await assert.rejects(
      publish(config, target, new Map(), {
        s3: {
          send: async () => {
            throw Object.assign(new Error("denied"), {
              $metadata: { httpStatusCode: 403 },
            });
          },
        },
      }),
      /denied/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("failed artifact upload never advances the manifest", async () => {
  const writes = [];
  await assert.rejects(
    publish(
      {
        publish: [
          {
            provider: "s3",
            bucket: "6529bucket",
            region: "eu-west-1",
            path: "6529-core-app/${os}",
          },
        ],
      },
      "unused/latest-mac.yml",
      new Map([[zip.url, "fixture.zip"]]),
      {
        s3: {
          send: async (command) => {
            if (command.constructor.name === "GetObjectCommand")
              return {
                ETag: '"old"',
                Body: {
                  transformToByteArray: async () => Buffer.from("previous"),
                },
              };
            writes.push(command.input);
            return {};
          },
        },
        spawnSync: () => ({ status: 1 }),
      },
    ),
    /upload failed/,
  );
  assert.equal(writes.length, 1);
  assert.match(writes[0].Key, /manifest-backups/);
});
