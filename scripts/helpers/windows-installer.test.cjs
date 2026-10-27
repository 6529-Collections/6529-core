// Compiles the real include on macOS/Linux when MAKENSIS is supplied. On the
// Windows signing runner, also executes isolated fixtures before publishing.
// These fixtures use temporary files and their own HKCU registry keys only.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const INCLUDE = path.join(ROOT, "scripts/windows-installer.nsh");
const TOOL = "resources/app.asar.unpacked/node_modules/better-sqlite3/node_modules/prebuild-install";
const nsisString = (value) => value.replaceAll("$", "$$").replaceAll('"', '$\\"');

test("both release installers use the legacy compatibility include", () => {
  for (const environment of ["production", "staging"]) {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, `electron-builder.${environment}.json`), "utf8"));
    assert.equal(path.resolve(ROOT, config.nsis.include), INCLUDE);
    assert.equal(config.nsis.perMachine, true);
  }
});

test("compiled installer compatibility preserves runtime/data and quarantines only legacy tools", {
  skip: process.platform !== "win32" && !process.env.MAKENSIS,
}, async (t) => {
  let compiler = { path: process.env.MAKENSIS, env: {} };
  if (!compiler.path) {
    const builderRequire = createRequire(require.resolve("electron-builder"));
    compiler = await builderRequire("app-builder-lib/out/toolsets/windows").getMakeNsisPath();
  }
  for (const scenario of ["legacy", "repair", "fresh", "0.3.14", "0.3.16", "failure"]) {
    await t.test(scenario, () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "core-nsis-"));
      const key = `Software\\6529-Core-Installer-Test-${crypto.randomUUID()}`;
      try {
        const old = path.join(root, "old");
        const version = scenario.startsWith("0.") ? scenario : "0.3.15";
        const tooling = path.join(old, TOOL);
        const deepFile = path.join(tooling, "node_modules/tar-fs/node_modules/tar-stream/node_modules/bl/node_modules/readable-stream/node_modules/string_decoder/node_modules/safe-buffer/package.json");
        const runtime = path.join(old, "resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node");
        const backup = `${old}.0.3.15-build-tools-backup`;
        if (scenario !== "fresh") {
          fs.mkdirSync(path.dirname(deepFile), { recursive: true });
          fs.writeFileSync(deepFile, "legacy-tool-sentinel");
          fs.writeFileSync(path.join(tooling, "package.json"), '{"name":"prebuild-install"}');
          fs.mkdirSync(path.dirname(runtime), { recursive: true });
          fs.writeFileSync(runtime, "native-runtime-sentinel");
          fs.writeFileSync(path.join(old, "6529 Desktop.exe"), "old-app-sentinel");
        }
        fs.writeFileSync(path.join(root, "database.sqlite"), "user-data-sentinel");
        if (scenario === "failure") fs.writeFileSync(backup, "blocked-backup-directory");
        if (scenario === "repair") {
          fs.mkdirSync(path.join(backup, "previous"), { recursive: true });
          fs.writeFileSync(path.join(backup, "previous", "keep"), "previous-backup");
        }
        const script = path.join(root, "fixture.nsi");
        const exe = path.join(root, "fixture.exe");
        fs.writeFileSync(script, `Unicode true
Name "Core compatibility fixture"
OutFile "${nsisString(exe)}"
RequestExecutionLevel user
SilentInstall silent
!define UNINSTALL_REGISTRY_KEY "${key}\\Uninstall"
!define INSTALL_REGISTRY_KEY "${key}\\Install"
!define APP_EXECUTABLE_FILENAME "6529 Desktop.exe"
!include "${nsisString(INCLUDE)}"
!insertmacro customHeader
Function .onInit
  SetRegView 64
  WriteRegStr HKCU "\${UNINSTALL_REGISTRY_KEY}" DisplayVersion "${version}"
  WriteRegStr HKCU "\${INSTALL_REGISTRY_KEY}" InstallLocation "$EXEDIR\\old"
FunctionEnd
Section "install"
  FileOpen $0 "$EXEDIR\\install-reached" w
  FileClose $0
SectionEnd
`);
        const compiled = spawnSync(compiler.path, ["-V2", script], { encoding: "utf8", env: { ...process.env, ...compiler.env } });
        assert.equal(compiled.status, 0, `${compiled.error ?? ""}\n${compiled.stdout}\n${compiled.stderr}`);
        if (process.platform !== "win32") return; // Never execute Windows binaries on other hosts.
        const result = spawnSync(exe, ["/S"], { encoding: "utf8", timeout: 30000 });
        assert.equal(result.status, scenario === "failure" ? 2 : 0, `${result.error ?? ""}`);
        assert.equal(fs.existsSync(path.join(root, "install-reached")), scenario !== "failure");
        assert.equal(fs.readFileSync(path.join(root, "database.sqlite"), "utf8"), "user-data-sentinel");
        if (scenario !== "fresh") {
          assert.equal(fs.readFileSync(runtime, "utf8"), "native-runtime-sentinel");
          assert.equal(fs.readFileSync(path.join(old, "6529 Desktop.exe"), "utf8"), "old-app-sentinel");
        }
        if (["legacy", "repair"].includes(scenario)) {
          assert.equal(fs.existsSync(tooling), false);
          const entries = fs.readdirSync(backup).filter((name) => name !== "previous");
          assert.equal(entries.length, 1);
          assert.equal(fs.readFileSync(path.join(backup, entries[0], path.relative(tooling, deepFile)), "utf8"), "legacy-tool-sentinel");
          if (scenario === "repair") assert.equal(fs.readFileSync(path.join(backup, "previous", "keep"), "utf8"), "previous-backup");
          // Retry after cancellation: no source remains, and the backup is kept.
          assert.equal(spawnSync(exe, ["/S"], { timeout: 30000 }).status, 0);
          assert.deepEqual(fs.readdirSync(backup).filter((name) => name !== "previous"), entries);
        } else if (scenario !== "fresh") {
          assert.equal(fs.readFileSync(deepFile, "utf8"), "legacy-tool-sentinel");
        }
      } finally {
        if (process.platform === "win32") {
          spawnSync("reg.exe", ["delete", `HKCU\\${key}`, "/f", "/reg:64"], { windowsHide: true });
        }
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
