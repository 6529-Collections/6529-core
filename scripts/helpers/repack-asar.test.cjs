const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const asar = require("@electron/asar");
const { getUnpackedPaths, repackAsar } = require("./repack-asar.cjs");

test("repacking preserves existing unpacking and unpacks new native libraries", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "6529-asar-test-"));
  try {
    const source = path.join(temporary, "source");
    const archive = path.join(temporary, "app.asar");
    const put = (name, contents = name) => {
      const file = path.join(source, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
    };
    put("existing/keep.txt");
    put("app/main.js");
    await repackAsar(source, archive, new Set(["existing"]));
    const unpacked = getUnpackedPaths(archive);
    const nativeFiles = [
      "renderer/out/node_modules/@img/sharp-darwin-arm64/lib/sharp.node",
      "renderer/out/node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips.dylib",
      "renderer/out/dev/node_modules/addon/addon.node",
      "node_modules/addon/lib.dll",
      "node_modules/addon/lib.so",
      "node_modules/addon/lib.so.42.1",
    ];
    for (const file of nativeFiles) put(file);
    put("existing/new.txt");
    // Archive paths containing glob syntax must be retained literally.
    put("app/[route]/keep.txt");
    unpacked.add(path.join("app", "[route]", "keep.txt"));
    if (process.platform !== "win32") {
      fs.symlinkSync("main.js", path.join(source, "app", "alias.js"));
    }
    await repackAsar(source, archive, unpacked);
    for (const file of [
      ...nativeFiles,
      "existing/keep.txt",
      "existing/new.txt",
      "app/[route]/keep.txt",
    ]) {
      assert.equal(asar.statFile(archive, file).unpacked, true, file);
      assert.equal(
        fs.readFileSync(path.join(`${archive}.unpacked`, file), "utf8"),
        file,
      );
    }
    assert.equal(asar.statFile(archive, "app/main.js").unpacked, undefined);
    assert.equal(
      asar.extractFile(archive, "app/main.js").toString(),
      "app/main.js",
    );
    if (process.platform !== "win32") {
      assert.equal(
        asar.extractFile(archive, "app/alias.js").toString(),
        "app/main.js",
      );
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
