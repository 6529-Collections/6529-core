/** Retain an immutable mirror only for the exact same version, name and bytes. */
function findRetainedMirror(catalog, version, artifactName, sha512) {
  if (
    !catalog ||
    catalog.version !== version ||
    !Array.isArray(catalog.files) ||
    typeof sha512 !== "string" ||
    !/^[A-Za-z0-9+/]{86}==$/.test(sha512)
  )
    return undefined;
  return catalog.files.find(
    (file) =>
      file?.url === artifactName &&
      file.sha512 === sha512 &&
      typeof file.arweaveUrl === "string" &&
      /^https:\/\/arweave\.net\/[A-Za-z0-9_-]{43}$/.test(file.arweaveUrl),
  )?.arweaveUrl;
}

module.exports = { findRetainedMirror };
