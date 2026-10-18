const assert = require("node:assert/strict");
const { test } = require("node:test");
const { resolvePnpmCommand } = require("./pnpm-command.cjs");

test("pnpm runs through its JavaScript entry on Windows when one is known", () => {
  const entry = "C:\\pnpm\\bin\\pnpm.cjs";
  const resolved = resolvePnpmCommand("pnpm", ["run", "build"], {
    npm_execpath: entry,
  });
  if (process.platform === "win32") {
    assert.equal(resolved.executable, process.execPath);
    assert.deepEqual(resolved.args, [entry, "run", "build"]);
    assert.equal(resolved.shell, undefined);
  } else {
    assert.deepEqual(resolved, { executable: "pnpm", args: ["run", "build"] });
  }
});

test("pnpm.cmd is run through a shell when pnpm's entry is unknown", () => {
  const resolved = resolvePnpmCommand("pnpm", ["install"], {});
  if (process.platform === "win32") {
    assert.deepEqual(resolved, { executable: "pnpm.cmd", args: ["install"], shell: true });
  } else {
    assert.deepEqual(resolved, { executable: "pnpm", args: ["install"] });
  }
});

test("npm's or yarn's entry is not taken for pnpm's", () => {
  for (const entry of ["C:\\npm\\bin\\npm-cli.js", "C:\\yarn\\bin\\yarn.js"]) {
    const resolved = resolvePnpmCommand("pnpm", ["install"], { npm_execpath: entry });
    if (process.platform === "win32") {
      assert.deepEqual(resolved, { executable: "pnpm.cmd", args: ["install"], shell: true });
    } else {
      assert.deepEqual(resolved, { executable: "pnpm", args: ["install"] });
    }
  }
});

test("other commands are spawned unchanged", () => {
  assert.deepEqual(resolvePnpmCommand("git", ["status"], {}), {
    executable: "git",
    args: ["status"],
  });
});
