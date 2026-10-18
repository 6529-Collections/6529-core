const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");

// With the EnableEmbeddedAsarIntegrityValidation fuse on, Electron refuses to
// load an app.asar whose header does not match the hash embedded in the
// executable. electron-builder embeds that hash before the afterPack hook,
// and afterPack then adds the renderer's node_modules to app.asar, so the
// hash has to be embedded again once app.asar is final. Windows keeps it in
// an INTEGRITY resource of the executable. macOS keeps it in Info.plist and
// is not handled here: the macOS builds do not turn the fuse on.

const RESOURCE_TYPE = "INTEGRITY";
const RESOURCE_ID = "ELECTRONASAR";

/** SHA-256 of an archive's header, the value Electron checks at startup. */
function asarHeaderHash(asarPath) {
  const { headerString } = asar.getRawHeader(asarPath);
  return crypto.createHash("sha256").update(headerString).digest("hex");
}

// resedit is electron-builder's own dependency, used for the same resource.
function loadResedit() {
  const builderDir = path.dirname(require.resolve("electron-builder/package.json"));
  const libDir = path.dirname(require.resolve("app-builder-lib/package.json", { paths: [builderDir] }));
  return require(require.resolve("resedit", { paths: [libDir] }));
}

function isIntegrityEntry(entry) {
  return entry.type === RESOURCE_TYPE && entry.id === RESOURCE_ID;
}

/** The integrity list embedded in a Windows executable, or null if none. */
function readWinAsarIntegrity(exePath) {
  const ResEdit = loadResedit();
  const executable = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
  const resource = ResEdit.NtExecutableResource.from(executable);
  const entry = resource.entries.find(isIntegrityEntry);
  return entry ? JSON.parse(Buffer.from(entry.bin).toString("utf8")) : null;
}

/**
 * Replaces the integrity list of a Windows executable with the current hash
 * of each archive, keyed by its path relative to the executable's folder
 * (for example resources\app.asar).
 */
function writeWinAsarIntegrity(exePath, archives) {
  const ResEdit = loadResedit();
  const executable = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
  const resource = ResEdit.NtExecutableResource.from(executable);
  const previous = resource.entries.find(isIntegrityEntry);
  let language = previous && { lang: previous.lang, codepage: previous.codepage };
  if (!language) {
    const versionInfo = ResEdit.Resource.VersionInfo.fromEntries(resource.entries);
    const languages = versionInfo[0]?.getAllLanguagesForStringValues() ?? [];
    if (languages.length !== 1) {
      throw new Error(`[asar-integrity] cannot find the resource language of ${exePath}`);
    }
    language = languages[0];
  }
  for (let i = resource.entries.length - 1; i >= 0; i--) {
    if (isIntegrityEntry(resource.entries[i])) resource.entries.splice(i, 1);
  }
  const list = Object.entries(archives).map(([file, asarPath]) => ({
    file: path.win32.normalize(file),
    alg: "SHA256",
    value: asarHeaderHash(asarPath),
  }));
  resource.entries.push({
    type: RESOURCE_TYPE,
    id: RESOURCE_ID,
    bin: Buffer.from(JSON.stringify(list)),
    lang: language.lang,
    codepage: language.codepage,
  });
  resource.outputResource(executable);
  fs.writeFileSync(exePath, Buffer.from(executable.generate()));
  return list;
}

/**
 * afterPack step for Windows: embeds the final app.asar hash. Does nothing on
 * other platforms or when electron-builder embedded no integrity list.
 */
function refreshPackedAsarIntegrity(context) {
  if (context.electronPlatformName !== "win32") return null;
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const current = readWinAsarIntegrity(exePath);
  if (!current) return null;
  // Re-hashes the archives electron-builder listed. afterPack changes only
  // app.asar, which is always listed; a step that added another archive
  // would have to add it here too.
  // The list names files Windows-style (resources\app.asar), which a macOS
  // or Linux build host would read as one file name.
  const archivePath = (file) => path.join(context.appOutDir, ...file.split(/[\\/]/));
  const archives = Object.fromEntries(current.map(({ file }) => [file, archivePath(file)]));
  const list = writeWinAsarIntegrity(exePath, archives);
  // Read the executable back, so a change in electron-builder's internals
  // (checked with 26.17.0) fails the build rather than the app at startup.
  const embedded = readWinAsarIntegrity(exePath) ?? [];
  for (const { file, value } of list) {
    const archive = archivePath(file);
    if (!embedded.some((entry) => entry.file === file && entry.value === asarHeaderHash(archive))) {
      throw new Error(`[asar-integrity] ${exePath} does not carry the hash of ${file}`);
    }
    console.log(`[asar-integrity] ${file} ${value}`);
  }
  return list;
}

module.exports = {
  asarHeaderHash,
  readWinAsarIntegrity,
  refreshPackedAsarIntegrity,
  writeWinAsarIntegrity,
};
