const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const asar = require("@electron/asar");
const {
  budgetArgs,
  checkSizeBudget,
  platformKeyFor,
  readBudget,
} = require("./size-budget.cjs");

async function makeFakeBuild(root) {
  const source = path.join(root, "source");
  const put = (name, contents) => {
    const file = path.join(source, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };
  put("main/index.js", "main");
  put("node_modules/eslint-plugin-x/index.js", "x".repeat(2_000_000));
  put("node_modules/ethers/index.js", "ethers");
  put("node_modules/ethers/index.js.map", "m".repeat(10));
  const build = path.join(root, "win-unpacked");
  fs.mkdirSync(path.join(build, "resources"), { recursive: true });
  fs.writeFileSync(path.join(build, "app.exe"), "exe");
  await asar.createPackage(source, path.join(build, "resources", "app.asar"));
  return build;
}

function writeBudget(root, budget) {
  const file = path.join(root, "budget.json");
  fs.writeFileSync(file, JSON.stringify({ default: budget }));
  return file;
}

test("platform keys follow electron-builder's platform and arch", () => {
  assert.equal(platformKeyFor("win32", "x64"), "win-x64");
  assert.equal(platformKeyFor("darwin", "arm64"), "mac-arm64");
  assert.equal(platformKeyFor("linux", "x64"), "linux-x64");
});

test("platform budgets override the defaults and map to footprint flags", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "6529-budget-"));
  try {
    const file = path.join(root, "budget.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        default: { maxTotalMb: 10, maxArchiveFiles: 5 },
        platforms: { "win-x64": { maxTotalMb: 8 } },
      }),
    );
    assert.deepEqual(readBudget("win-x64", file), {
      maxTotalMb: 8,
      maxArchiveFiles: 5,
    });
    assert.deepEqual(budgetArgs(readBudget("linux-x64", file)), [
      "--max-total-mb",
      "10",
      "--max-files",
      "5",
    ]);
    fs.writeFileSync(file, JSON.stringify({ default: { maxSizeMb: 1 } }));
    assert.throws(() => readBudget("win-x64", file), /Unknown budget/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a build within budget passes and writes its footprint report", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "6529-budget-"));
  try {
    const build = await makeFakeBuild(root);
    const out = path.join(root, "dist");
    const { jsonPath, reportPath } = checkSizeBudget({
      appOutDir: build,
      outDir: out,
      platformKey: "win-x64",
      budgetFile: writeBudget(root, { maxToolingMb: 3, maxArchiveFiles: 10 }),
    });
    const result = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    assert.equal(result.asar_files, 4);
    assert.equal(result.categories.tooling, 2_000_000);
    assert.match(fs.readFileSync(reportPath, "utf8"), /# Desktop footprint: win-x64/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a build over budget fails with the exceeded budgets", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "6529-budget-"));
  try {
    const build = await makeFakeBuild(root);
    assert.throws(
      () =>
        checkSizeBudget({
          appOutDir: build,
          outDir: path.join(root, "dist"),
          platformKey: "win-x64",
          budgetFile: writeBudget(root, { maxToolingMb: 1, maxArchiveFiles: 3 }),
        }),
      (error) =>
        /over the desktop size budget/.test(error.message) &&
        /tooling: 2\.0 MB > 1(\.0)? MB/.test(error.message) &&
        /files: 4 > 3/.test(error.message),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
