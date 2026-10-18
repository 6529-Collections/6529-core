const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  materializePackagedNodeModules,
} = require("../after-pack-copy-next-node-modules.cjs");
const { isUnneededRuntimeFile } = require("./copy-resolved-tree.cjs");

function writePackage(dir, name, version, dependencies = {}, files = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version, dependencies }));
  fs.writeFileSync(path.join(dir, "index.js"), `module.exports = "${name}@${version}";`);
  for (const [file, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, file), contents);
  }
}

test("packaged dependencies are copied only where Node would not already find them", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "6529-materialize-"));
  try {
    const project = path.join(root, "project");
    const modules = path.join(project, "node_modules");
    writePackage(path.join(modules, "a"), "a", "1.0.0", { shared: "1.0.0" });
    writePackage(path.join(modules, "shared"), "shared", "1.0.0");
    writePackage(path.join(modules, "c"), "c", "1.0.0", { shared: "2.0.0" });
    writePackage(path.join(modules, "c", "node_modules", "shared"), "shared", "2.0.0", {}, {
      "index.js.map": "{}",
      "index.d.ts": "export {};",
      "README.md": "# shared",
      "LICENSE.md": "license",
    });
    writePackage(path.join(modules, "d"), "d", "1.0.0", { leaf: "1.0.0" });
    writePackage(path.join(modules, "leaf"), "leaf", "1.0.0");

    // What electron-builder put in the app: the top-level packages, without leaf.
    const app = path.join(root, "app");
    for (const name of ["a", "shared", "c", "d"]) {
      fs.cpSync(path.join(modules, name), path.join(app, "node_modules", name), {
        recursive: true,
        filter: (source) => !source.includes(`${name}${path.sep}node_modules`),
      });
    }

    materializePackagedNodeModules(app, project, [project]);

    const appModules = path.join(app, "node_modules");
    // a resolves shared@1 from the app's top level: no nested copy.
    assert.equal(fs.existsSync(path.join(appModules, "a", "node_modules")), false);
    // c needs shared@2, which clashes with the top level: nested copy.
    const nested = path.join(appModules, "c", "node_modules", "shared");
    assert.equal(JSON.parse(fs.readFileSync(path.join(nested, "package.json"), "utf8")).version, "2.0.0");
    // Nothing provided leaf: hoisted to the top level instead of nested under d.
    assert.equal(fs.existsSync(path.join(appModules, "leaf", "package.json")), true);
    assert.equal(fs.existsSync(path.join(appModules, "d", "node_modules")), false);
    // Copies leave out maps, type declarations and docs, but keep licenses.
    assert.deepEqual(fs.readdirSync(nested).sort(), ["LICENSE.md", "index.js", "package.json"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runtime copies skip maps, declarations and docs but keep licenses", () => {
  for (const name of ["a.js.map", "index.d.ts", "types.d.mts", "README.md", "CHANGELOG.markdown"]) {
    assert.equal(isUnneededRuntimeFile(name), true, name);
  }
  for (const name of ["index.js", "LICENSE.md", "licence.md", "NOTICE.md", "package.json", "sharp.node"]) {
    assert.equal(isUnneededRuntimeFile(name), false, name);
  }
});
