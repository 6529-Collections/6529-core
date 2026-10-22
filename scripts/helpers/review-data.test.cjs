const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { pruneInactiveReviewVersions } = require("./review-data.cjs");

function makeReview(appRoot, review, activeVersion, versions) {
  const dir = path.join(appRoot, "renderer", "public", "review-data", review);
  for (const version of versions) {
    fs.mkdirSync(path.join(dir, "versions", version), { recursive: true });
    fs.writeFileSync(path.join(dir, "versions", version, "reference-manifest.json"), "x".repeat(10));
  }
  if (activeVersion !== undefined) {
    fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({ activeVersion }));
  }
  return dir;
}

test("only each review's active version stays in the app", () => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "6529-review-"));
  try {
    const stream = makeReview(appRoot, "6529-stream", "2026-09-09.1", ["2026-07-26.1", "2026-08-01.1", "2026-09-09.1"]);

    const removed = pruneInactiveReviewVersions(appRoot);

    assert.deepEqual(
      removed.map(({ version }) => version).sort(),
      ["2026-07-26.1", "2026-08-01.1"],
    );
    assert.equal(removed[0].bytes, 10);
    assert.deepEqual(fs.readdirSync(path.join(stream, "versions")), ["2026-09-09.1"]);
    assert.ok(fs.existsSync(path.join(stream, "index.json")));
  } finally {
    fs.rmSync(appRoot, { recursive: true, force: true });
  }
});

test("a review whose index is missing or names no present version is left alone", () => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "6529-review-"));
  try {
    const noIndex = makeReview(appRoot, "no-index", undefined, ["a", "b"]);
    const wrongActive = makeReview(appRoot, "wrong-active", "missing", ["a", "b"]);
    const emptyActive = makeReview(appRoot, "empty-active", "", ["a", "b"]);
    const parentActive = makeReview(appRoot, "parent-active", "..", ["a", "b"]);

    assert.deepEqual(pruneInactiveReviewVersions(appRoot), []);
    for (const review of [noIndex, wrongActive, emptyActive, parentActive]) {
      assert.equal(fs.readdirSync(path.join(review, "versions")).length, 2);
    }
  } finally {
    fs.rmSync(appRoot, { recursive: true, force: true });
  }
});

test("an app without review data is fine", () => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "6529-review-"));
  try {
    assert.deepEqual(pruneInactiveReviewVersions(appRoot), []);
  } finally {
    fs.rmSync(appRoot, { recursive: true, force: true });
  }
});
