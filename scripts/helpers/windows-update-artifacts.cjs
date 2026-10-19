const crypto = require("node:crypto");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const zlib = require("node:zlib");

// Use the checksum implementation belonging to the pinned blockmap generator.
const builderRequire = createRequire(require.resolve("electron-builder"));
const blockmapRequire = createRequire(
  builderRequire.resolve("app-builder-lib/out/targets/blockmap/blockmap"),
);
const { blake2b } = blockmapRequire("@noble/hashes/blake2b.js");

/** Validate final signed bytes, not just a blockmap's existence or file size. */
function assertWindowsUpdateArtifacts(directory, manifest) {
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("Windows manifest has no installers");
  }
  const verified = new Map();
  for (const entry of manifest.files) {
    const name = entry.url;
    if (
      typeof name !== "string" ||
      !name.endsWith(".exe") ||
      /[\\/]/.test(name)
    ) {
      throw new Error("Windows manifest must list local installer filenames");
    }
    let actual = verified.get(name);
    if (!actual) {
      actual = verifyInstaller(path.join(directory, name));
      verified.set(name, actual);
    }
    if (entry.size !== actual.size || entry.sha512 !== actual.sha512) {
      throw new Error(
        `Windows manifest hash/size does not match final EXE: ${name}`,
      );
    }
  }
  const first = manifest.files.find((entry) => entry.url === manifest.path);
  if (!first || manifest.sha512 !== first.sha512) {
    throw new Error(
      "Windows manifest path/sha512 does not match its installer entry",
    );
  }
}

/** Check every differential chunk and hash the same final EXE in one pass. */
function verifyInstaller(file) {
  const name = path.basename(file);
  const fail = () => {
    throw new Error(
      `Windows blockmap does not match final EXE: ${name}; regenerate after signing`,
    );
  };
  const blockmap = JSON.parse(
    zlib.gunzipSync(fs.readFileSync(`${file}.blockmap`)).toString(),
  );
  if (blockmap.version !== "2" || blockmap.files?.length !== 1) fail();
  const map = blockmap.files[0];
  if (
    map.offset !== 0 ||
    !Array.isArray(map.sizes) ||
    !Array.isArray(map.checksums) ||
    map.sizes.length === 0 ||
    map.sizes.length !== map.checksums.length
  )
    fail();
  if (
    map.sizes.some(
      (size) => !Number.isSafeInteger(size) || size <= 0 || size > 1024 * 1024,
    )
  )
    fail();

  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    if (map.sizes.reduce((total, chunk) => total + chunk, 0) !== size) fail();
    const buffer = Buffer.alloc(
      map.sizes.reduce((max, size) => Math.max(max, size), 0),
    );
    const hash = crypto.createHash("sha512");
    let offset = 0;
    for (let i = 0; i < map.sizes.length; i++) {
      const length = map.sizes[i];
      let read = 0;
      while (read < length) {
        const count = fs.readSync(
          fd,
          buffer,
          read,
          length - read,
          offset + read,
        );
        if (count === 0) fail();
        read += count;
      }
      const chunk = buffer.subarray(0, length);
      if (
        Buffer.from(blake2b(chunk, { dkLen: 18 })).toString("base64") !==
        map.checksums[i]
      )
        fail();
      hash.update(chunk);
      offset += length;
    }
    return { size, sha512: hash.digest("base64") };
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { assertWindowsUpdateArtifacts };
