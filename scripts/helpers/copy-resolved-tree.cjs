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

const copyResolvedTree = (source, destination, options = {}) => {
  const { allowedRoots = [] } = options;
  const stats = fs.lstatSync(source);

  if (stats.isSymbolicLink()) {
    const resolved = fs.realpathSync(source);
    if (!isWithinAllowedRoots(resolved, allowedRoots)) {
      throw new Error(
        `Refusing to materialize symlink outside allowed roots: ${source} -> ${resolved}`
      );
    }
    copyResolvedTree(resolved, destination, options);
    return;
  }

  if (stats.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyResolvedTree(path.join(source, entry), path.join(destination, entry), {
        allowedRoots,
      });
    }
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
};

module.exports = {
  copyResolvedTree,
};
