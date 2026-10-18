const fs = require("node:fs");
const path = require("node:path");

const isWithinAllowedRoots = (targetPath, allowedRoots) => {
  if (!Array.isArray(allowedRoots) || allowedRoots.length === 0) {
    return true;
  }

  const resolvedTargetPath = path.resolve(targetPath);
  return allowedRoots.some((rootPath) => {
    const resolvedRootPath = path.resolve(rootPath);
    const relativePath = path.relative(resolvedRootPath, resolvedTargetPath);
    return (
      relativePath === "" ||
      (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
    );
  });
};

const LICENSE_FILE = /^(licen[cs]e|copying|notice)/i;

/**
 * Files a packaged app never reads: source maps, type declarations and
 * Markdown documentation (license texts are kept). electron-builder leaves
 * these out of the dependencies it collects; trees copied by the packaging
 * scripts use the same rule.
 */
const isUnneededRuntimeFile = (fileName) => {
  if (/\.(map|d\.ts|d\.mts|d\.cts)$/i.test(fileName)) {
    return true;
  }
  return /\.(md|markdown)$/i.test(fileName) && !LICENSE_FILE.test(fileName);
};

const copyResolvedTree = (source, destination, options = {}) => {
  const { allowedRoots = [], skipFile = null } = options;
  const stats = fs.lstatSync(source);

  if (stats.isSymbolicLink()) {
    const resolved = fs.realpathSync(source);
    if (!isWithinAllowedRoots(resolved, allowedRoots)) {
      throw new Error(
        `Refusing to materialize symlink outside allowed roots: ${source} -> ${resolved}`
      );
    }
    if (!fs.statSync(resolved).isDirectory() && skipFile?.(path.basename(source))) {
      return;
    }
    copyResolvedTree(resolved, destination, options);
    return;
  }

  if (stats.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyResolvedTree(path.join(source, entry), path.join(destination, entry), {
        allowedRoots,
        skipFile,
      });
    }
    return;
  }

  if (skipFile?.(path.basename(source))) {
    return;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
};

module.exports = {
  copyResolvedTree,
  isUnneededRuntimeFile,
};
