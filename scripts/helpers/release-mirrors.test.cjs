const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { test } = require("node:test");
const {
  assertArtifactHash,
  findRetainedMirror,
} = require("./release-mirrors.cjs");

test("a mirror upload verifies downloaded bytes against the manifest", () => {
  const bytes = Buffer.from("original installer");
  const expected = createHash("sha512").update(bytes).digest("base64");
  assert.doesNotThrow(() => assertArtifactHash(bytes, expected));
  for (const altered of [
    Buffer.from("same-version rebuild"),
    bytes.subarray(0, 5),
    Buffer.alloc(0),
  ]) {
    assert.throws(
      () => assertArtifactHash(altered, expected),
      /SHA-512 does not match/,
    );
  }
  assert.throws(
    () => assertArtifactHash(bytes, undefined),
    /SHA-512 does not match/,
  );
});

test("retained mirrors require matching artifact bytes, not just a filename", () => {
  const sha512 = createHash("sha512")
    .update("original installer")
    .digest("base64");
  const rebuiltHash = createHash("sha512")
    .update("rebuilt installer")
    .digest("base64");
  const url = "installer.dmg";
  const arweaveUrl = `https://arweave.net/${"a".repeat(43)}`;
  const catalog = { version: "0.3.16", files: [{ url, sha512, arweaveUrl }] };
  assert.equal(findRetainedMirror(catalog, "0.3.16", url, sha512), arweaveUrl);
  assert.equal(
    findRetainedMirror(catalog, "0.3.16", url, rebuiltHash),
    undefined,
  );
  assert.equal(findRetainedMirror(catalog, "0.3.17", url, sha512), undefined);
  assert.equal(
    findRetainedMirror(catalog, "0.3.16", "other.dmg", sha512),
    undefined,
  );
  for (const prior of [
    undefined,
    {},
    { version: "0.3.16", files: [null, { url, arweaveUrl }] },
  ]) {
    assert.equal(findRetainedMirror(prior, "0.3.16", url, sha512), undefined);
  }
  assert.equal(
    findRetainedMirror(catalog, "0.3.16", url, undefined),
    undefined,
  );
  assert.equal(
    findRetainedMirror(
      {
        ...catalog,
        files: [{ url, sha512, arweaveUrl: "https://example.com/file" }],
      },
      "0.3.16",
      url,
      sha512,
    ),
    undefined,
  );
});
