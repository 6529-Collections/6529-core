const fs = require("node:fs");
const path = require("node:path");

const copyResolvedTree = (source, destination) => {
  const stats = fs.lstatSync(source);

  if (stats.isSymbolicLink()) {
    const resolved = fs.realpathSync(source);
    copyResolvedTree(resolved, destination);
    return;
  }

  if (stats.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyResolvedTree(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
};

module.exports = {
  copyResolvedTree,
};
