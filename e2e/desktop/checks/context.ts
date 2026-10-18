import type { Page } from "@playwright/test";
import type { AppEnvironment, AppSession } from "../lib/app";
import type { Recorder } from "../lib/report";
import type { DynamicSamples } from "../lib/routes";

export interface SuiteOptions {
  /** Launch the real Chrome and Brave with the connector URL (opens windows). */
  externalBrowsers: boolean;
  /** Route coverage: none, the smoke list, or every route. */
  routes: "none" | "smoke" | "all";
  /** Run the close dialog, background mode and quit at the end. */
  lifecycle: boolean;
}

export interface SuiteContext {
  app: AppSession;
  page: Page;
  baseUrl: string;
  recorder: Recorder;
  environment: AppEnvironment;
  backend: "live" | "test";
  scheme: string;
  apiEndpoint: string;
  apiHeaders: Record<string, string>;
  samples: DynamicSamples;
  repoRoot: string;
  outDir: string;
  options: SuiteOptions;
}

/** Calls a synchronous IPC channel through the app's preload bridge. */
export function sendSync<T = any>(page: Page, channel: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([name, values]) => (window as any).api.sendSync(name, ...(values as unknown[])),
    [channel, args] as const,
  );
}

/** Calls an invoke IPC channel through the app's preload bridge. */
export function invoke<T = any>(page: Page, channel: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([name, values]) => (window as any).api.invoke(name, ...(values as unknown[])),
    [channel, args] as const,
  );
}

/** Calls a named method on one of the objects the preload exposes. */
export function bridge<T = any>(page: Page, objectName: string, method: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([obj, fn, values]) => (window as any)[obj][fn](...(values as unknown[])),
    [objectName, method, args] as const,
  );
}

export async function apiGet(ctx: SuiteContext, endpoint: string): Promise<any> {
  const response = await fetch(`${ctx.apiEndpoint}/api/${endpoint}`, {
    headers: ctx.apiHeaders,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`GET ${endpoint}: HTTP ${response.status}`);
  return response.json();
}
