import fs from "node:fs";
import path from "node:path";

export type CheckStatus = "pass" | "fail" | "skip";

export interface CheckResult {
  /** Function from the plan's "every function kept" list, e.g. "F5". */
  fn: string;
  id: string;
  name: string;
  status: CheckStatus;
  ms: number;
  details?: string;
}

export interface SuiteReport {
  label: string;
  exe: string;
  appVersion?: string;
  environment: string;
  backend: string;
  platform: string;
  startedAt: string;
  durationMs: number;
  results: CheckResult[];
  routes?: RouteResult[];
}

export interface RouteResult {
  route: string;
  url: string | null;
  status: CheckStatus;
  httpStatus?: number;
  ms?: number;
  details?: string;
}

export const FUNCTIONS: Record<string, string> = {
  F1: "The whole 6529.io app (every route)",
  F2: "Desktop-only pages (core info, wallets, transactions, TDH)",
  F3: "Local seed wallets: create, import, encrypt, sign",
  F4: "Wallet connections, including the external-browser connector",
  F5: "Local IPFS node: gateway, API and WebUI window",
  F6: "Background jobs, RPC provider management and worker controls",
  F7: "Server functions: link previews, Alchemy reads, meme calendar, image proxy",
  F8: "Notifications, badge, deep links, single instance, shortcuts, title bar, close confirmation",
  F9: "Run in background; splash",
  F10: "Auto-update and the version check",
  F11: "Log viewers and local crash dumps",
  F12: "Sessions with refresh tokens in main; connection sharing to the phone",
  F13: "Rust core node (not in the app yet)",
};

export class Recorder {
  readonly results: CheckResult[] = [];

  async check(
    fn: string,
    id: string,
    name: string,
    body: () => Promise<string | void>,
  ): Promise<CheckResult> {
    const started = Date.now();
    let result: CheckResult;
    try {
      const details = await body();
      result = { fn, id, name, status: "pass", ms: Date.now() - started, details: details || undefined };
    } catch (error) {
      if (error instanceof SkipCheck) {
        result = { fn, id, name, status: "skip", ms: Date.now() - started, details: error.message };
      } else {
        const message = error instanceof Error ? error.message : String(error);
        result = { fn, id, name, status: "fail", ms: Date.now() - started, details: message.slice(0, 2000) };
      }
    }
    this.results.push(result);
    const mark = result.status === "pass" ? "PASS" : result.status === "skip" ? "SKIP" : "FAIL";
    console.log(`[${mark}] ${fn} ${id}: ${name}${result.details ? ` — ${result.details.split("\n")[0].slice(0, 200)}` : ""}`);
    return result;
  }
}

export class SkipCheck extends Error {}

export function skip(reason: string): never {
  throw new SkipCheck(reason);
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function writeReport(outDir: string, report: SuiteReport, baseline?: SuiteReport): void {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "function-suite.json"), JSON.stringify(report, null, 1) + "\n");
  fs.writeFileSync(path.join(outDir, "function-suite.md"), renderMarkdown(report, baseline));
}

function count(results: { status: CheckStatus }[], status: CheckStatus): number {
  return results.filter((result) => result.status === status).length;
}

export function compareWithBaseline(report: SuiteReport, baseline: SuiteReport) {
  const before = new Map(baseline.results.map((result) => [result.id, result.status]));
  const regressions = report.results.filter(
    (result) => result.status === "fail" && before.get(result.id) !== "fail",
  );
  const beforeRoutes = new Map((baseline.routes ?? []).map((route) => [route.route, route.status]));
  const routeRegressions = (report.routes ?? []).filter(
    (route) => route.status === "fail" && beforeRoutes.get(route.route) !== "fail",
  );
  return { regressions, routeRegressions };
}

export function renderMarkdown(report: SuiteReport, baseline?: SuiteReport): string {
  const lines: string[] = [];
  lines.push(`# Desktop function suite: ${report.label}`);
  lines.push("");
  lines.push(
    `${report.exe} (${report.appVersion ?? "unknown version"}), ${report.environment} app, ${report.backend} backend, ${report.platform}; ` +
      `${report.startedAt}, ${(report.durationMs / 1000).toFixed(0)} s.`,
  );
  lines.push("");
  lines.push(
    `Checks: ${count(report.results, "pass")} passed, ${count(report.results, "fail")} failed, ${count(report.results, "skip")} skipped.`,
  );
  if (report.routes) {
    lines.push(
      `Routes: ${count(report.routes, "pass")} passed, ${count(report.routes, "fail")} failed, ${count(report.routes, "skip")} skipped of ${report.routes.length}.`,
    );
  }
  if (baseline) {
    const { regressions, routeRegressions } = compareWithBaseline(report, baseline);
    lines.push("");
    lines.push(
      `Against ${baseline.label}: ${regressions.length} check regressions, ${routeRegressions.length} route regressions.`,
    );
    for (const result of regressions) lines.push(`- regression: ${result.fn} ${result.id}: ${result.details ?? ""}`);
    for (const route of routeRegressions) lines.push(`- route regression: ${route.route}: ${route.details ?? ""}`);
  }
  lines.push("");
  lines.push("| Function | Check | Result | Details |");
  lines.push("| --- | --- | --- | --- |");
  for (const result of report.results) {
    const details = (result.details ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 240);
    lines.push(`| ${result.fn} | ${result.name} | ${result.status} | ${details} |`);
  }
  const failedRoutes = (report.routes ?? []).filter((route) => route.status === "fail");
  if (failedRoutes.length > 0) {
    lines.push("");
    lines.push("| Failed route | HTTP | Details |");
    lines.push("| --- | ---: | --- |");
    for (const route of failedRoutes) {
      lines.push(`| ${route.route} | ${route.httpStatus ?? ""} | ${(route.details ?? "").replace(/\|/g, "\\|").slice(0, 200)} |`);
    }
  }
  return lines.join("\n") + "\n";
}
