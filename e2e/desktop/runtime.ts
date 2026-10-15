// The desktop runtime budget (desktop slimming plan S0.3). Launches a
// packaged build several times with fresh and warm profiles and records, per
// launch: time to the splash and to the main window, whether it hung on the
// splash, private memory per process on the home screen after a minute, idle
// CPU over the next minute, and renderer requests during that minute.
//
//   pnpm exec tsx e2e/desktop/runtime.ts --exe "dist/win-unpacked/6529 Desktop Staging.exe" \
//     [--fresh 3] [--warm 5] [--settle 60] [--idle 60] [--hang 120] \
//     [--budget config/desktop-runtime-budget.json] [--out <dir>] [--label <name>]
//
// Timings depend on the machine; compare runs from the same machine only.

import fs from "node:fs";
import path from "node:path";
import { AppSession, detectEnvironment, freePort, ProtocolHandlerGuard, scratchDir, sleep, waitFor } from "./lib/app";
import { sampleTree, totals } from "./lib/process-tree";
import { readPackagedFile } from "./checks/pages";

const MIB = 1024 * 1024;

interface RunResult {
  run: string;
  profile: "fresh" | "warm";
  splashMs: number | null;
  mainWindowShownMs: number | null;
  ipfsReadyMs: number | null;
  hung: boolean;
  failure?: string;
  processes?: number;
  privateMiB?: number;
  privateBytesMiB?: number;
  byTypeMiB?: Record<string, number>;
  idleCpuSeconds?: number;
  idleRequests?: number;
  idleRequestHosts?: Record<string, number>;
}

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[argv[i].slice(2)] = next;
      i++;
    } else {
      args[argv[i].slice(2)] = true;
    }
  }
  return args;
}

const median = (values: Array<number | null | undefined>): number | null => {
  const sorted = values.filter((value): value is number => typeof value === "number").sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

async function measureLaunch(
  exe: string,
  profileDir: string,
  profile: "fresh" | "warm",
  run: string,
  settings: { settleMs: number; idleMs: number; hangMs: number },
): Promise<RunResult> {
  const app = AppSession.launch({ exe, profileDir, cdpPort: await freePort() });
  const result: RunResult = { run, profile, splashMs: null, mainWindowShownMs: null, ipfsReadyMs: null, hung: false };
  try {
    await app.connect(60_000);
    const shown = await app.waitForLog(/Main window ready to show/, settings.hangMs).catch(() => null);
    result.splashMs = app.logMilestone(/Creating splash/);
    if (!shown) {
      result.hung = true;
      result.failure = app.hasExited ? `exited with code ${app.exitCode}` : "main window not shown";
      const ipfsFailure = app.readMainLog().find((line) => /\[IPFS\].*(fail|error)/i.test(line.text) && line.level === "error");
      if (ipfsFailure) result.failure += `; ${ipfsFailure.text.split("\n")[0].slice(0, 160)}`;
      return result;
    }
    result.mainWindowShownMs = shown.time - app.startedAt;
    const page = await app.mainPage(30_000);
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);

    await sleep(settings.settleMs);
    // IPFS starts after the main window, so read its milestone afterwards.
    result.ipfsReadyMs = app.logMilestone(/\[IPFS\] Daemon fully initialized/);
    const before = sampleTree(app.pid);
    const requests: string[] = [];
    const onRequest = (request: { url(): string }) => requests.push(request.url());
    page.on("request", onRequest);
    await sleep(settings.idleMs);
    page.off("request", onRequest);
    const after = sampleTree(app.pid);
    const memory = totals(before);
    result.processes = memory.processes;
    result.privateMiB = Math.round(memory.privateWorkingSet / MIB);
    result.privateBytesMiB = Math.round(memory.privateBytes / MIB);
    result.byTypeMiB = Object.fromEntries(Object.entries(memory.byType).map(([type, bytes]) => [type, Math.round(bytes / MIB)]));
    result.idleCpuSeconds = Number((totals(after).cpuSeconds - memory.cpuSeconds).toFixed(2));
    result.idleRequests = requests.length;
    const hosts: Record<string, number> = {};
    for (const url of requests) {
      try {
        const host = new URL(url).host;
        hosts[host] = (hosts[host] ?? 0) + 1;
      } catch {
        // data: and blob: URLs
      }
    }
    result.idleRequestHosts = hosts;
    return result;
  } catch (error) {
    result.failure = String(error instanceof Error ? error.message : error).slice(0, 300);
    return result;
  } finally {
    await app.kill();
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const exe = typeof args.exe === "string" ? path.resolve(args.exe) : "";
  if (!exe || !fs.existsSync(exe)) {
    console.error("--exe <packaged app executable> is required");
    return 2;
  }
  const fresh = Number(args.fresh ?? 3);
  const warm = Number(args.warm ?? 5);
  const settings = {
    settleMs: Number(args.settle ?? 60) * 1000,
    idleMs: Number(args.idle ?? 60) * 1000,
    hangMs: Number(args.hang ?? 120) * 1000,
  };
  const outDir = path.resolve(typeof args.out === "string" ? args.out : scratchDir("6529-runtime-out-"));
  fs.mkdirSync(outDir, { recursive: true });
  const work = scratchDir("6529-runtime-");
  const publicRuntime = JSON.parse((await readPackagedFile(exe, "main/config/__PUBLIC_RUNTIME.json")) ?? "{}");
  const packageJson = JSON.parse((await readPackagedFile(exe, "package.json")) ?? "{}");
  const label = typeof args.label === "string" ? args.label : `${packageJson.version ?? "unknown"}-${detectEnvironment(exe)}`;
  const guard = new ProtocolHandlerGuard(publicRuntime.CORE_SCHEME ?? "stagingcore6529", work);
  guard.save();
  const runs: RunResult[] = [];
  try {
    for (let i = 0; i < fresh; i++) {
      const result = await measureLaunch(exe, path.join(work, `fresh-${i}`), "fresh", `fresh-${i + 1}`, settings);
      runs.push(result);
      console.log(`[runtime] ${JSON.stringify(result)}`);
    }
    const warmProfile = path.join(work, "warm");
    if (warm > 0) {
      // First launch only warms the profile.
      const warmup = await measureLaunch(exe, warmProfile, "fresh", "warmup", { ...settings, settleMs: 5_000, idleMs: 1_000 });
      console.log(`[runtime] warmup ${warmup.hung ? "hung" : "ok"}`);
      runs.push({ ...warmup, run: "warmup" });
    }
    for (let i = 0; i < warm; i++) {
      const result = await measureLaunch(exe, warmProfile, "warm", `warm-${i + 1}`, settings);
      runs.push(result);
      console.log(`[runtime] ${JSON.stringify(result)}`);
    }
  } finally {
    guard.restore();
    fs.rmSync(work, { recursive: true, force: true });
  }

  const measured = runs.filter((run) => run.run !== "warmup");
  const launches = runs;
  const summary = {
    label,
    exe: path.basename(exe),
    platform: `${process.platform}-${process.arch}`,
    date: new Date().toISOString(),
    settings,
    launches: launches.length,
    hangs: launches.filter((run) => run.hung).length,
    medianMainWindowShownWarmS: median(measured.filter((run) => run.profile === "warm").map((run) => run.mainWindowShownMs))! / 1000 || null,
    medianMainWindowShownFreshS: median(measured.filter((run) => run.profile === "fresh").map((run) => run.mainWindowShownMs))! / 1000 || null,
    medianSplashS: median(measured.map((run) => run.splashMs))! / 1000 || null,
    medianPrivateMiB: median(measured.map((run) => run.privateMiB)),
    medianProcesses: median(measured.map((run) => run.processes)),
    medianIdleCpuSeconds: median(measured.map((run) => run.idleCpuSeconds)),
    medianIdleRequestsPerMinute: median(measured.map((run) => (run.idleRequests === undefined ? undefined : (run.idleRequests * 60_000) / settings.idleMs))),
  };
  const report = { summary, runs };
  fs.writeFileSync(path.join(outDir, "runtime.json"), JSON.stringify(report, null, 1) + "\n");

  const lines = [
    `# Desktop runtime: ${label}`,
    "",
    `${summary.exe} on ${summary.platform}, ${summary.date}; settle ${settings.settleMs / 1000} s, idle window ${settings.idleMs / 1000} s.`,
    "",
    "| Measure | Median |",
    "| --- | ---: |",
    `| Launches stuck on the splash | ${summary.hangs} of ${summary.launches} |`,
    `| Main window shown, warm (s) | ${summary.medianMainWindowShownWarmS?.toFixed(1) ?? "-"} |`,
    `| Main window shown, fresh profile (s) | ${summary.medianMainWindowShownFreshS?.toFixed(1) ?? "-"} |`,
    `| Splash created (s) | ${summary.medianSplashS?.toFixed(1) ?? "-"} |`,
    `| Private memory, home after settle (MiB) | ${summary.medianPrivateMiB ?? "-"} |`,
    `| Processes | ${summary.medianProcesses ?? "-"} |`,
    `| Idle CPU over the idle window (CPU-s) | ${summary.medianIdleCpuSeconds ?? "-"} |`,
    `| Requests per idle minute | ${summary.medianIdleRequestsPerMinute ?? "-"} |`,
    "",
    "| Run | Profile | Main window (s) | IPFS ready (s) | Private MiB | Processes | Idle CPU-s | Idle requests | Notes |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...runs.map(
      (run) =>
        `| ${run.run} | ${run.profile} | ${run.mainWindowShownMs === null ? "-" : (run.mainWindowShownMs / 1000).toFixed(1)} | ${
          run.ipfsReadyMs === null ? "-" : (run.ipfsReadyMs / 1000).toFixed(1)
        } | ${run.privateMiB ?? "-"} | ${run.processes ?? "-"} | ${run.idleCpuSeconds ?? "-"} | ${run.idleRequests ?? "-"} | ${
          run.hung ? `hung: ${run.failure}` : run.failure ?? (run.byTypeMiB ? Object.entries(run.byTypeMiB).map(([t, m]) => `${t} ${m}`).join(", ") : "")
        } |`,
    ),
  ];
  fs.writeFileSync(path.join(outDir, "runtime.md"), lines.join("\n") + "\n");
  console.log(lines.slice(0, 15).join("\n"));
  console.log(`[runtime] report: ${path.join(outDir, "runtime.md")}`);

  if (typeof args.budget === "string") {
    const budget = JSON.parse(fs.readFileSync(args.budget, "utf8"));
    const limits = { ...budget.default, ...(budget.platforms?.[`${process.platform}-${process.arch}`] ?? {}) };
    const over: string[] = [];
    if (limits.maxHangs !== undefined && summary.hangs > limits.maxHangs) over.push(`hangs ${summary.hangs} > ${limits.maxHangs}`);
    const check = (name: string, value: number | null, limit: number | undefined) => {
      if (limit !== undefined && value !== null && value > limit) over.push(`${name} ${value} > ${limit}`);
    };
    check("main window warm s", summary.medianMainWindowShownWarmS, limits.maxMainWindowShownWarmS);
    check("private MiB", summary.medianPrivateMiB, limits.maxPrivateMiB);
    check("idle CPU-s", summary.medianIdleCpuSeconds, limits.maxIdleCpuSeconds);
    check("idle requests/min", summary.medianIdleRequestsPerMinute, limits.maxIdleRequestsPerMinute);
    for (const line of over) console.log(`over budget: ${line}`);
    return over.length > 0 ? 1 : 0;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
