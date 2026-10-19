const fs = require("node:fs");
const path = require("node:path");

// The public review data (renderer/public/review-data) keeps every version
// of each review, 30-40 MB each. The app keeps only each review's active
// version; the frontend loads the others from the site, checking every file
// against the SHA-256 values in the review's index.

const REVIEW_DATA = path.join("renderer", "public", "review-data");

function folderSize(dir) {
  let bytes = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    bytes += entry.isDirectory() ? folderSize(full) : fs.statSync(full).size;
  }
  return bytes;
}

/**
 * Removes every review version but the active one from an unpacked app.
 * Returns what was removed. Leaves a review alone when its index cannot be
 * read or names no active version that exists, so nothing breaks silently.
 */
function pruneInactiveReviewVersions(appRoot) {
  const root = path.join(appRoot, REVIEW_DATA);
  const removed = [];
  if (!fs.existsSync(root)) return removed;
  for (const review of fs.readdirSync(root, { withFileTypes: true })) {
    if (!review.isDirectory()) continue;
    const reviewDir = path.join(root, review.name);
    const versionsDir = path.join(reviewDir, "versions");
    let activeVersion;
    try {
      activeVersion = JSON.parse(fs.readFileSync(path.join(reviewDir, "index.json"), "utf8")).activeVersion;
    } catch {
      continue;
    }
    if (!fs.existsSync(versionsDir)) continue;
    const versions = fs.readdirSync(versionsDir, { withFileTypes: true });
    // The active version must name one of the version folders exactly, so a
    // value such as "" or ".." cannot pass for a folder that exists.
    if (!versions.some((version) => version.isDirectory() && version.name === activeVersion)) continue;
    for (const version of versions) {
      if (!version.isDirectory() || version.name === activeVersion) continue;
      const dir = path.join(versionsDir, version.name);
      const bytes = folderSize(dir);
      fs.rmSync(dir, { recursive: true, force: true });
      removed.push({ review: review.name, version: version.name, bytes });
    }
  }
  return removed;
}

module.exports = { pruneInactiveReviewVersions };
