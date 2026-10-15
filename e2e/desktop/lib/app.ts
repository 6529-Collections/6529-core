// Launches a packaged 6529 Desktop build with a scratch profile and a CDP
// port, and leaves the machine as it found it: the protocol handler that
// every launch rewrites is restored, processes are stopped, and the crashpad
// debug.log a forced stop leaves beside the executable is removed. Never
// launch without --user-data-dir: the default profile is a real user's.

import { ChildProcess, execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

export type AppEnvironment = "local" | "staging" | "production";

const SCHEMES: Record<AppEnvironment, string> = {
  local: "localcore6529",
  staging: "stagingcore6529",
  production: "core6529",
};

export function detectEnvironment(exe: string): AppEnvironment {
  const name = path.basename(exe).toLowerCase();
  if (name.includes("staging")) return "staging";
  if (name.includes("local")) return "local";
  return "production";
}

export function schemeFor(environment: AppEnvironment): string {
  return SCHEMES[environment];
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitFor<T>(
  what: string,
  probe: () => Promise<T | undefined | null | false> | T | undefined | null | false,
  timeoutMs: number,
  intervalMs = 250,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value as T;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `Timed out after ${timeoutMs} ms waiting for ${what}${
      lastError ? ` (last error: ${String(lastError).slice(0, 200)})` : ""
    }`,
  );
}

/** Saves HKCU\Software\Classes\<scheme> and restores it exactly (Windows only). */
export class ProtocolHandlerGuard {
  private readonly key: string;
  private readonly backup: string;
  private existed = false;
  private saved = false;

  constructor(scheme: string, private readonly workDir: string) {
    this.key = `HKCU\\Software\\Classes\\${scheme}`;
    this.backup = path.join(workDir, `${scheme}.reg`);
  }

  save(): void {
    if (process.platform !== "win32" || this.saved) return;
    fs.mkdirSync(this.workDir, { recursive: true });
    const query = spawnSync("reg", ["query", this.key], { windowsHide: true });
    this.existed = query.status === 0;
    if (this.existed) {
      execFileSync("reg", ["export", this.key, this.backup, "/y"], { windowsHide: true });
    }
    this.saved = true;
  }

  restore(): void {
    if (process.platform !== "win32" || !this.saved) return;
    spawnSync("reg", ["delete", this.key, "/f"], { windowsHide: true });
    if (this.existed) {
      execFileSync("reg", ["import", this.backup], { windowsHide: true });
    }
  }
}

export interface LaunchOptions {
  exe: string;
  profileDir: string;
  cdpPort: number;
  extraArgs?: string[];
  env?: NodeJS.ProcessEnv;
}

export interface MainLogLine {
  time: number;
  level: string;
  text: string;
}

/** One running app instance with its scratch profile. */
export class AppSession {
  readonly startedAt: number;
  readonly child: ChildProcess;
  private browser: Browser | null = null;
  private exited = false;
  exitCode: number | null = null;

  private constructor(readonly options: LaunchOptions) {
    fs.mkdirSync(options.profileDir, { recursive: true });
    this.startedAt = Date.now();
    this.child = spawn(
      options.exe,
      [
        `--user-data-dir=${options.profileDir}`,
        `--remote-debugging-port=${options.cdpPort}`,
        ...(options.extraArgs ?? []),
      ],
      {
        stdio: "ignore",
        detached: process.platform !== "win32",
        env: options.env ?? process.env,
        windowsHide: false,
      },
    );
    this.child.once("exit", (code) => {
      this.exited = true;
      this.exitCode = code;
    });
  }

  static launch(options: LaunchOptions): AppSession {
    return new AppSession(options);
  }

  get pid(): number {
    return this.child.pid ?? -1;
  }

  get hasExited(): boolean {
    return this.exited;
  }

  get mainLogPath(): string {
    return path.join(this.options.profileDir, "logs", "main.log");
  }

  async connect(timeoutMs = 60_000): Promise<Browser> {
    if (this.browser) return this.browser;
    await waitFor(
      "the CDP endpoint",
      async () => {
        if (this.exited) throw new Error(`app exited with code ${this.exitCode}`);
        const response = await fetch(`http://127.0.0.1:${this.options.cdpPort}/json/version`, {
          signal: AbortSignal.timeout(1500),
        });
        return response.ok;
      },
      timeoutMs,
    );
    this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${this.options.cdpPort}`);
    return this.browser;
  }

  context(): BrowserContext {
    if (!this.browser) throw new Error("not connected");
    return this.browser.contexts()[0];
  }

  pages(): Page[] {
    return this.browser?.contexts().flatMap((context) => context.pages()) ?? [];
  }

  /** The main window: the page served by the local renderer server. */
  async mainPage(timeoutMs = 120_000): Promise<Page> {
    await this.connect();
    return waitFor(
      "the main window",
      () => {
        if (this.exited) throw new Error(`app exited with code ${this.exitCode}`);
        return this.pages().find((page) => /^http:\/\/(localhost|127\.0\.0\.1):\d+/.test(page.url()));
      },
      timeoutMs,
      200,
    );
  }

  /** CDP's own target list, which also shows windows Playwright has not attached yet. */
  async cdpTargets(): Promise<Array<{ id: string; type: string; url: string; title: string }>> {
    const response = await fetch(`http://127.0.0.1:${this.options.cdpPort}/json/list`, {
      signal: AbortSignal.timeout(5000),
    });
    return (await response.json()) as Array<{ id: string; type: string; url: string; title: string }>;
  }

  async closeTarget(id: string): Promise<void> {
    await fetch(`http://127.0.0.1:${this.options.cdpPort}/json/close/${id}`, { signal: AbortSignal.timeout(5000) });
  }

  async splashSeen(): Promise<boolean> {
    return this.pages().some((page) => page.url().includes("splash.html"));
  }

  readMainLog(): MainLogLine[] {
    if (!fs.existsSync(this.mainLogPath)) return [];
    const lines: MainLogLine[] = [];
    for (const raw of fs.readFileSync(this.mainLogPath, "utf8").split(/\r?\n/)) {
      const match = raw.match(/^\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3})\] \[(\w+)\]\s+(.*)$/);
      if (match) {
        lines.push({ time: new Date(`${match[1]}T${match[2]}`).getTime(), level: match[3], text: match[4] });
      } else if (lines.length > 0) {
        lines[lines.length - 1].text += `\n${raw}`;
      }
    }
    return lines;
  }

  /** Milliseconds from launch to the first log line matching the pattern, or null. */
  logMilestone(pattern: RegExp): number | null {
    const line = this.readMainLog().find((entry) => pattern.test(entry.text));
    return line ? line.time - this.startedAt : null;
  }

  async waitForLog(pattern: RegExp, timeoutMs: number): Promise<MainLogLine> {
    return waitFor(
      `main.log line ${pattern}`,
      () => this.readMainLog().find((entry) => pattern.test(entry.text)),
      timeoutMs,
      300,
    );
  }

  async disconnect(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    // connectOverCDP's close() only drops the connection; the app keeps running.
    await browser?.close().catch(() => undefined);
  }

  async waitForExit(timeoutMs: number): Promise<boolean> {
    try {
      await waitFor("the app to exit", () => this.exited, timeoutMs, 200);
      return true;
    } catch {
      return false;
    }
  }

  /** Stops the whole process tree and removes the crashpad log a forced stop leaves. */
  async kill(): Promise<void> {
    await this.disconnect();
    if (!this.exited && this.pid > 0) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(this.pid), "/T", "/F"], { windowsHide: true });
      } else {
        try {
          process.kill(-this.pid, "SIGKILL");
        } catch {
          // already gone
        }
      }
      await this.waitForExit(15_000);
    }
    killLeftoverIpfs(this.options.profileDir);
    removeCrashpadLog(this.options.exe);
  }
}

/** Kubo keeps running when the app is forced to stop; stop the one on this profile's repo. */
export function killLeftoverIpfs(profileDir: string): void {
  // IPFS_PATH is not visible from outside the process, so find the daemon by
  // the RPC port it recorded in the repository's api file.
  const apiFile = path.join(profileDir, "ipfs-repo", "api");
  if (!fs.existsSync(apiFile)) return;
  const port = fs.readFileSync(apiFile, "utf8").match(/tcp\/(\d+)/)?.[1];
  if (!port) return;
  const owner =
    process.platform === "win32"
      ? spawnSync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            `(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`,
          ],
          { encoding: "utf8", windowsHide: true },
        ).stdout.trim()
      : spawnSync("sh", ["-c", `lsof -t -iTCP:${port} -sTCP:LISTEN | head -1`], {
          encoding: "utf8",
        }).stdout.trim();
  if (!/^\d+$/.test(owner)) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", owner, "/T", "/F"], { windowsHide: true });
  } else {
    try {
      process.kill(Number(owner), "SIGKILL");
    } catch {
      // already gone
    }
  }
}

export function removeCrashpadLog(exe: string): void {
  const log = path.join(path.dirname(exe), "debug.log");
  if (fs.existsSync(log)) {
    fs.rmSync(log, { force: true });
  }
}

export function scratchDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export async function freePort(): Promise<number> {
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}
