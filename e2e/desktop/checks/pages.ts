import type { Page } from "@playwright/test";
import type { RouteResult } from "../lib/report";
import {
  isDynamic,
  listRoutePatterns,
  sampleUrl,
  SMOKE_ROUTES,
  type RoutePattern,
} from "../lib/routes";
import type { SuiteContext } from "./context";
import path from "node:path";

export interface RenderOutcome {
  httpStatus: number | null;
  title: string;
  textLength: number;
  text: string;
  pageErrors: string[];
  finalPath: string;
}

/** Loads a path in the main window and waits for the client to render it. */
export async function renderPath(page: Page, baseUrl: string, routePath: string): Promise<RenderOutcome> {
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(error.message.slice(0, 200));
  page.on("pageerror", onError);
  try {
    const response = await page.goto(baseUrl + routePath, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    // The app shell renders on the client after hydration.
    await page
      .waitForFunction(() => (document.body?.innerText ?? "").trim().length > 40, undefined, { timeout: 20_000 })
      .catch(() => undefined);
    const { title, text, finalPath } = await page.evaluate(() => ({
      title: document.title,
      text: (document.body?.innerText ?? "").trim(),
      finalPath: location.pathname + location.search,
    }));
    return {
      httpStatus: response?.status() ?? null,
      title,
      textLength: text.length,
      text: text.slice(0, 20_000),
      pageErrors,
      finalPath,
    };
  } finally {
    page.off("pageerror", onError);
  }
}

export function renderFailure(outcome: RenderOutcome): string | null {
  if (outcome.httpStatus !== null && outcome.httpStatus >= 500) {
    return `HTTP ${outcome.httpStatus}`;
  }
  if (outcome.title === "6529 Error") {
    return `error page${outcome.pageErrors.length ? `: ${outcome.pageErrors[0]}` : ""}`;
  }
  if (outcome.textLength <= 40) {
    return `blank page${outcome.pageErrors.length ? `: ${outcome.pageErrors[0]}` : ""}`;
  }
  return null;
}

/** Renders a path and fails on a server error, the error page or a blank page. */
export async function expectRendered(ctx: SuiteContext, routePath: string): Promise<string> {
  const outcome = await renderPath(ctx.page, ctx.baseUrl, routePath);
  const failure = renderFailure(outcome);
  if (failure) throw new Error(`${routePath}: ${failure}`);
  return outcome.text;
}

export async function runRouteChecks(ctx: SuiteContext): Promise<RouteResult[]> {
  if (ctx.options.routes === "none") return [];
  const appDir = path.join(ctx.repoRoot, "renderer", "app");
  let patterns: RoutePattern[] = listRoutePatterns(appDir);
  if (ctx.options.routes === "smoke") {
    const wanted = new Set(SMOKE_ROUTES);
    patterns = patterns.filter((route) => wanted.has(route.pattern || "/"));
  }
  const prerendered = await loadPrerendered(ctx);
  const results: RouteResult[] = [];
  let index = 0;
  for (const route of patterns) {
    index += 1;
    const routeName = route.pattern || "/";
    const { url, reason } = sampleUrl(route, prerendered, ctx.samples);
    if (!url) {
      results.push({ route: routeName, url: null, status: "skip", details: reason });
      continue;
    }
    const started = Date.now();
    try {
      const outcome = await renderPath(ctx.page, ctx.baseUrl, url);
      const failure = renderFailure(outcome);
      // A 404 for a sample id is the page working, but say so.
      const notFound = outcome.httpStatus === 404 ? "HTTP 404 for the sample value" : undefined;
      results.push({
        route: routeName,
        url,
        status: failure ? "fail" : "pass",
        httpStatus: outcome.httpStatus ?? undefined,
        ms: Date.now() - started,
        details: failure ?? notFound ?? (outcome.pageErrors.length ? `page errors: ${outcome.pageErrors.slice(0, 2).join(" | ")}` : undefined),
      });
    } catch (error) {
      results.push({
        route: routeName,
        url,
        status: "fail",
        ms: Date.now() - started,
        details: String(error instanceof Error ? error.message : error).slice(0, 300),
      });
    }
    const last = results[results.length - 1];
    if (last.status === "fail" || index % 25 === 0) {
      console.log(`  route ${index}/${patterns.length} ${routeName} ${last.status}${last.details ? ` (${last.details})` : ""}`);
    }
  }
  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const result of results) counts[result.status] += 1;
  await ctx.recorder.check(
    "F1",
    "routes",
    `Route pass (${ctx.options.routes}): every route renders without a server error, the error page or a blank page`,
    async () => {
      const failed = results.filter((result) => result.status === "fail");
      const summary = `${counts.pass} passed, ${counts.fail} failed, ${counts.skip} skipped of ${results.length}; dynamic routes sampled: ${patterns.filter(isDynamic).length}`;
      if (failed.length > 0) {
        throw new Error(`${summary}. First failures: ${failed.slice(0, 5).map((f) => `${f.route} (${f.details})`).join("; ")}`);
      }
      return summary;
    },
  );
  return results;
}

async function loadPrerendered(ctx: SuiteContext): Promise<Map<string, string[]>> {
  const { prerenderedPaths } = await import("../lib/routes");
  const manifest = await readPackagedFile(ctx.app.options.exe, "renderer/out/prerender-manifest.json");
  return prerenderedPaths(manifest ? JSON.parse(manifest) : null);
}

/** Reads one file from the packaged app's archive. */
export async function readPackagedFile(exe: string, relativePath: string): Promise<string | null> {
  const fs = await import("node:fs");
  const asar = await import("@electron/asar");
  const dir = path.dirname(exe);
  // Windows and Linux keep resources/ beside the executable; macOS keeps
  // Contents/Resources beside Contents/MacOS.
  const candidates = [
    path.join(dir, "resources", "app.asar"),
    path.join(dir, "..", "Resources", "app.asar"),
  ].filter((candidate) => fs.existsSync(candidate));
  for (const archive of candidates) {
    try {
      return asar.extractFile(archive, relativePath.split("/").join(path.sep)).toString("utf8");
    } catch {
      // not in this archive
    }
  }
  return null;
}
