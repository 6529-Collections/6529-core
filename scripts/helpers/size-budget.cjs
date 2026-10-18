const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// The size budget for packaged desktop builds (desktop slimming plan S0.2).
// Every electron-builder run measures the packed app with
// scripts/desktop-footprint.py before any installer is made, writes the
// report next to the installers, and fails the build when a budget in
// config/desktop-size-budget.json is exceeded. Tighten the budgets as the
// packaging shrinks; never raise them to make a build pass without review.
// Without Python 3 the check is skipped with a warning, so a tooling gap on a
// release machine cannot block a signed build; CI sets
// DESKTOP_SIZE_BUDGET_REQUIRED=1 so it can never be skipped there.

const ROOT = path.resolve(__dirname, "..", "..");
const FOOTPRINT_SCRIPT = path.join(ROOT, "scripts", "desktop-footprint.py");
const BUDGET_FILE = path.join(ROOT, "config", "desktop-size-budget.json");

const BUDGET_FLAGS = {
  maxToolingMb: "--max-tooling-mb",
  maxSourceMapsMb: "--max-maps-mb",
  maxDuplicatesMb: "--max-duplicates-mb",
  maxArchiveFiles: "--max-files",
  maxTotalMb: "--max-total-mb",
};

const PLATFORM_NAMES = { darwin: "mac", win32: "win", linux: "linux" };
// electron-builder's Arch enum (builder-util), which afterPack passes as a number.
const ARCH_NAMES = ["ia32", "x64", "armv7l", "arm64", "universal"];

function findPython() {
  const candidates =
    process.platform === "win32"
      ? [["python"], ["py", "-3"], ["python3"]]
      : [["python3"], ["python"]];
  for (const [command, ...prefix] of candidates) {
    const probe = spawnSync(command, [...prefix, "--version"], {
      encoding: "utf8",
      windowsHide: true,
    });
    // The Windows Store alias for python3 exists but only prints a hint.
    const major = Number(`${probe.stdout}${probe.stderr}`.trim().match(/^Python (\d+)\./)?.[1]);
    if (probe.status === 0 && major >= 3) {
      return { command, prefix };
    }
  }
  return null;
}

function readBudget(platformKey, budgetFile = BUDGET_FILE) {
  const config = JSON.parse(fs.readFileSync(budgetFile, "utf8"));
  const budget = { ...config.default, ...(config.platforms?.[platformKey] ?? {}) };
  for (const key of Object.keys(budget)) {
    if (!(key in BUDGET_FLAGS)) {
      throw new Error(`[size-budget] Unknown budget "${key}" in ${budgetFile}`);
    }
    if (typeof budget[key] !== "number" || !(budget[key] >= 0)) {
      throw new Error(`[size-budget] Budget "${key}" must be a non-negative number`);
    }
  }
  return budget;
}

function budgetArgs(budget) {
  return Object.entries(budget).flatMap(([key, value]) => [
    BUDGET_FLAGS[key],
    String(value),
  ]);
}

function platformKeyFor(electronPlatformName, arch) {
  return `${PLATFORM_NAMES[electronPlatformName] ?? electronPlatformName}-${arch}`;
}

/**
 * Measures an unpacked app folder and enforces the budget. Writes
 * desktop-footprint-<platform>-<arch>.json and .md into outDir.
 */
function checkSizeBudget({ appOutDir, outDir, platformKey, budgetFile }) {
  const budget = readBudget(platformKey, budgetFile);
  const python = findPython();
  if (!python) {
    const message =
      "[size-budget] Python 3 is required to check the desktop size budget (scripts/desktop-footprint.py).";
    if (process.env.DESKTOP_SIZE_BUDGET_REQUIRED === "1") {
      throw new Error(message);
    }
    console.warn(`${message} Skipped for ${platformKey}.`);
    return null;
  }
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `desktop-footprint-${platformKey}.json`);
  const reportPath = path.join(outDir, `desktop-footprint-${platformKey}.md`);
  const result = spawnSync(
    python.command,
    [
      ...python.prefix,
      FOOTPRINT_SCRIPT,
      "check",
      appOutDir,
      "--label",
      platformKey,
      "--json",
      jsonPath,
      ...budgetArgs(budget),
    ],
    { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.error) {
    throw result.error;
  }
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  fs.writeFileSync(reportPath, output.replace(/\r\n/g, "\n"));
  const overBudget = output
    .split(/\r?\n/)
    .filter((line) => line.startsWith("over budget: "));
  const summary = output.split(/\r?\n/).find((line) => line.startsWith("Total "));
  console.log(`[size-budget] ${platformKey}: ${summary ?? "measured"}`);
  console.log(`[size-budget] report: ${reportPath}`);
  if (result.status !== 0) {
    throw new Error(
      `[size-budget] ${platformKey} is over the desktop size budget (config/desktop-size-budget.json):\n` +
        (overBudget.length > 0 ? overBudget.join("\n") : output.slice(-2000)),
    );
  }
  return { jsonPath, reportPath };
}

/** electron-builder afterPack entry point. */
function checkPackedAppSizeBudget(context) {
  const arch = ARCH_NAMES[context.arch] ?? String(context.arch);
  return checkSizeBudget({
    appOutDir: context.appOutDir,
    outDir: context.outDir,
    platformKey: platformKeyFor(context.electronPlatformName, arch),
  });
}

module.exports = {
  budgetArgs,
  checkPackedAppSizeBudget,
  checkSizeBudget,
  findPython,
  platformKeyFor,
  readBudget,
};
