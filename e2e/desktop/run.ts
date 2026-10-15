// The desktop function suite (desktop slimming plan S0.1): runs the
// "every function kept" list F1-F12 against a packaged build over CDP.
//
//   pnpm exec tsx e2e/desktop/run.ts --exe "dist/win-unpacked/6529 Desktop Staging.exe" \
//     [--routes none|smoke|all] [--external-browsers] [--no-lifecycle] \
//     [--baseline <function-suite.json>] [--out <dir>] [--label <name>] [--cdp-port 9333]
//
// See e2e/desktop/README.md.

import fs from "node:fs";
import path from "node:path";
import {
  AppSession,
  detectEnvironment,
  freePort,
  ProtocolHandlerGuard,
  scratchDir,
  waitFor,
} from "./lib/app";
import { compareWithBaseline, FUNCTIONS, Recorder, skip, writeReport, type SuiteReport } from "./lib/report";
import type { SuiteContext, SuiteOptions } from "./checks/context";
import { apiGet } from "./checks/context";
import { readPackagedFile, runRouteChecks } from "./checks/pages";
import { runDesktopChecks, runDesktopCleanup } from "./checks/desktop";
import { runLifecycleChecks, runShellChecks } from "./checks/shell";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const extraArgs: string[] = [];

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (key === "extra-arg") {
      extraArgs.push(argv[++i]);
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const exe = typeof args.exe === "string" ? path.resolve(args.exe) : "";
  if (!exe || !fs.existsSync(exe)) {
    console.error("--exe <packaged app executable> is required");
    return 2;
  }
  const routes = (args.routes as SuiteOptions["routes"]) ?? "smoke";
  const options: SuiteOptions = {
    externalBrowsers: args["external-browsers"] === true,
    routes,
    lifecycle: args["no-lifecycle"] !== true,
  };
  const outDir = path.resolve(typeof args.out === "string" ? args.out : scratchDir("6529-suite-out-"));
  const work = scratchDir("6529-suite-");
  const profileDir = typeof args.profile === "string" ? path.resolve(args.profile) : path.join(work, "profile");
  const cdpPort = typeof args["cdp-port"] === "string" ? Number(args["cdp-port"]) : await freePort();

  const publicRuntime = JSON.parse((await readPackagedFile(exe, "main/config/__PUBLIC_RUNTIME.json")) ?? "{}");
  const privateRuntime = JSON.parse((await readPackagedFile(exe, "main/config/__PRIVATE_RUNTIME.json")) ?? "{}");
  const packageJson = JSON.parse((await readPackagedFile(exe, "package.json")) ?? "{}");
  const environment = detectEnvironment(exe);
  const scheme: string = publicRuntime.CORE_SCHEME ?? "";
  const backend: "live" | "test" = publicRuntime.BACKEND_TARGET === "test" ? "test" : "live";
  const apiEndpoint: string = publicRuntime.API_ENDPOINT ?? "https://api.6529.io";
  const apiHeaders: Record<string, string> =
    backend === "test" && privateRuntime.STAGING_API_KEY ? { "x-6529-auth": privateRuntime.STAGING_API_KEY } : {};
  const label = typeof args.label === "string" ? args.label : `${packageJson.version ?? "unknown"}-${environment}-${backend}`;

  console.log(`[suite] ${label}: ${exe}`);
  console.log(`[suite] profile ${profileDir}, CDP ${cdpPort}, routes ${routes}, out ${outDir}`);

  const guard = new ProtocolHandlerGuard(scheme || "stagingcore6529", work);
  guard.save();
  const recorder = new Recorder();
  const started = Date.now();
  let app: AppSession | null = null;
  let routeResults: SuiteReport["routes"] = [];
  try {
    app = AppSession.launch({ exe, profileDir, cdpPort, extraArgs });
    const session = app;
    let splashSeenAt: number | null = null;
    await session.connect();
    const page = await waitFor(
      "the main window",
      async () => {
        if (splashSeenAt === null && (await session.splashSeen())) splashSeenAt = Date.now() - session.startedAt;
        return session.pages().find((candidate) => /^http:\/\/localhost:\d+/.test(candidate.url()));
      },
      180_000,
      200,
    );
    const baseUrl = new URL(page.url()).origin;
    await page.waitForLoadState("domcontentloaded");
    const shownLog = await session.waitForLog(/Main window ready to show/, 120_000).catch(() => null);

    await recorder.check("F9", "splash", "The splash shows at launch and closes when the main window shows", async () => {
      const created = session.logMilestone(/Creating splash/);
      if (splashSeenAt === null && created === null) throw new Error("no splash window seen");
      await waitFor("the splash to close", () => !session.pages().some((p) => p.url().includes("splash.html")), 30_000);
      return `splash at ${((splashSeenAt ?? created ?? 0) / 1000).toFixed(1)} s, main window shown at ${
        shownLog ? ((shownLog.time - session.startedAt) / 1000).toFixed(1) : "?"
      } s`;
    });

    const ctx: SuiteContext = {
      app: session,
      page,
      baseUrl,
      recorder,
      environment,
      backend,
      scheme,
      apiEndpoint,
      apiHeaders,
      samples: {},
      repoRoot: REPO_ROOT,
      outDir,
      options,
    };

    await recorder.check("F1", "samples", "Look up public sample values for dynamic routes", async () => {
      const top = await apiGet(ctx, "community-members/top?page=1&page_size=1&sort=level&sort_direction=DESC");
      ctx.samples.user = top?.data?.[0]?.detail_view_key ?? undefined;
      const waves = await apiGet(ctx, "waves-overview?type=MOST_SUBSCRIBED&limit=1");
      ctx.samples.wave = waves?.[0]?.id ?? undefined;
      if (!ctx.samples.user || !ctx.samples.wave) throw new Error("public samples not found");
      return "found a public profile and wave";
    });

    await runDesktopChecks(ctx);
    await runShellChecks(ctx);
    routeResults = await runRouteChecks(ctx);
    await runDesktopCleanup(ctx);
    await recorder.check("F13", "rust-core", FUNCTIONS.F13, async () => skip("not in the app yet"));
    await runLifecycleChecks(ctx);
  } catch (error) {
    const tail = app
      ? app
          .readMainLog()
          .slice(-12)
          .map((line) => `${line.level}: ${line.text.split("\n")[0].slice(0, 200)}`)
          .join("\n")
      : "";
    await recorder.check("F0", "suite", "Suite ran to the end", async () => {
      throw new Error(`${error instanceof Error ? error.message : String(error)}${tail ? `\nmain.log tail:\n${tail}` : ""}`);
    });
  } finally {
    if (app) await app.kill();
    guard.restore();
  }

  const report: SuiteReport = {
    label,
    exe: path.basename(exe),
    appVersion: packageJson.version,
    environment,
    backend,
    platform: `${process.platform}-${process.arch}`,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    results: recorder.results,
    routes: routeResults,
  };
  const baseline =
    typeof args.baseline === "string" ? (JSON.parse(fs.readFileSync(args.baseline, "utf8")) as SuiteReport) : undefined;
  writeReport(outDir, report, baseline);
  console.log(`[suite] report: ${path.join(outDir, "function-suite.md")}`);
  const anyFailure = recorder.results.some((result) => result.status === "fail");
  if (typeof args.profile !== "string" && args["keep-profile"] !== true && !anyFailure) {
    fs.rmSync(work, { recursive: true, force: true });
  } else {
    console.log(`[suite] kept profile and work files: ${work}`);
  }

  if (baseline) {
    const { regressions, routeRegressions } = compareWithBaseline(report, baseline);
    console.log(`[suite] against ${baseline.label}: ${regressions.length} check and ${routeRegressions.length} route regressions`);
    return regressions.length + routeRegressions.length > 0 ? 1 : 0;
  }
  const failed = recorder.results.filter((result) => result.status === "fail").length;
  return failed > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
