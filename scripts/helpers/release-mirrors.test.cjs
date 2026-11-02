const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { test } = require("node:test");
const { findRetainedMirror } = require("./release-mirrors.cjs");

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
