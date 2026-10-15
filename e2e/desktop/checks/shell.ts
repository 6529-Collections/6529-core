// Shell functions: connectors, server routes, notifications, deep links,
// single instance, shortcuts, the version check, and (last) the close
// dialog, background mode and quit.

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { chromium, firefox } from "@playwright/test";
import { sleep, waitFor } from "../lib/app";
import { assert, skip } from "../lib/report";
import { bridge, type SuiteContext } from "./context";
import { expectRendered } from "./pages";

const MEMES_CONTRACT = "0x33FD426905F149f8376e227d0C9D3340AaD17aF1";

async function getJson(url: string): Promise<{ status: number; body: any }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  const text = await response.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: response.status, body };
}

export async function runShellChecks(ctx: SuiteContext): Promise<void> {
  const { recorder: r, page, baseUrl } = ctx;

  // F4 wallet connections
  const connectorUrl = `${baseUrl}/browser-connector`;
  for (const [name, browserType] of [
    ["Chromium", chromium],
    ["Firefox", firefox],
  ] as const) {
    await r.check("F4", `connector-${name.toLowerCase()}`, `The external-browser connector page loads in ${name}`, async () => {
      let browser;
      try {
        // Prefer the installed Chrome, the browser people actually connect from.
        browser =
          name === "Chromium"
            ? await browserType.launch({ headless: true, channel: "chrome" }).catch(() => browserType.launch({ headless: true }))
            : await browserType.launch({ headless: true });
      } catch (error) {
        skip(`${name} for Playwright is not installed: ${String(error).slice(0, 120)}`);
      }
      try {
        const connectorPage = await browser.newPage();
        const response = await connectorPage.goto(connectorUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
        assert(response && response.status() < 500, `HTTP ${response?.status()}`);
        await connectorPage
          .waitForFunction(() => (document.body?.innerText ?? "").trim().length > 10, undefined, { timeout: 30_000 })
          .catch(() => undefined);
        const title = await connectorPage.title();
        assert(title !== "6529 Error", "connector page shows the error page");
        return title;
      } finally {
        await browser.close();
      }
    });
  }
  for (const [name, method] of [
    ["Chrome", "openExternalChrome"],
    ["Brave", "openExternalBrave"],
    ["Firefox", "openExternalFirefox"],
  ] as const) {
    await r.check("F4", `connector-open-${name.toLowerCase()}`, `"Open in ${name}" launches ${name} with the connector`, async () => {
      if (!ctx.options.externalBrowsers) skip("needs --external-browsers (opens real browser windows)");
      if (process.platform !== "win32") skip("process lookup implemented for Windows");
      const marker = `suite${Date.now()}`;
      const logStart = ctx.app.readMainLog().length;
      await bridge(page, "api", method, `${connectorUrl}?${marker}=1`);
      // A browser that is already running takes the URL from a short-lived
      // launcher process, so a missed process is not a failure; a logged
      // launch error (the app then falls back to the default browser) is.
      const seen = new Set<number>();
      const deadline = Date.now() + 8_000;
      while (Date.now() < deadline) {
        for (const pid of findProcessesByCommandLine(marker)) seen.add(pid);
        await sleep(400);
      }
      // Only processes started with this run's marker are stopped.
      for (const pid of seen) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
      const failure = ctx.app
        .readMainLog()
        .slice(logStart)
        .find((line) => new RegExp(`Failed to open in ${name}`).test(line.text));
      if (failure) throw new Error(`${name} launch failed, fell back to the default browser: ${failure.text.split("\n")[0].slice(0, 200)}`);
      return seen.size > 0 ? `${name} started with the connector URL` : `${name} launch reported no error (handed to a running ${name})`;
    });
  }

  // F7 server functions of the renderer
  let previewImage: string | undefined;
  await r.check("F7", "link-preview", "Link preview (Open Graph) for a public page", async () => {
    const { status, body } = await getJson(`${baseUrl}/api/open-graph?url=${encodeURIComponent("https://6529.io/")}`);
    assert(status === 200, `HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`);
    const image = body?.image?.secureUrl ?? body?.image?.url ?? body?.image;
    if (typeof image === "string" && image.startsWith("https://")) previewImage = image;
    return typeof body === "object" ? Object.keys(body).slice(0, 8).join(", ") : String(body).slice(0, 80);
  });
  await r.check("F7", "image-proxy", "Drop image proxy answers and keeps to its host allowlist", async () => {
    // The proxy only serves image hosts that refuse hotlinking (an allowlist
    // in the route), so any other host must be refused.
    const target = previewImage ?? "https://6529.io/museum.png";
    const response = await fetch(`${baseUrl}/api/open-graph/proxy-image?url=${encodeURIComponent(target)}`, {
      signal: AbortSignal.timeout(45_000),
    });
    const body = await response.text();
    assert(response.status === 400 && /Unsupported image host/.test(body), `HTTP ${response.status}: ${body.slice(0, 160)}`);
    return "refused a host outside the allowlist";
  });
  await r.check("F7", "meme-calendar", "Meme calendar", async () => {
    const { status, body } = await getJson(`${baseUrl}/api/meme-calendar/current`);
    assert(status === 200, `HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`);
  });
  await r.check("F7", "alchemy-contract", "Alchemy contract read with the key kept off the page", async () => {
    const { status, body } = await getJson(`${baseUrl}/api/alchemy/contract?address=${MEMES_CONTRACT}`);
    // Desktop builds bake no Alchemy key (0.3.14 included); the route's
    // environment check then answers 400 "Required".
    if (status === 400 && body?.error === "Required") {
      skip("no Alchemy key in this build (pre-existing: desktop builds bake none)");
    }
    assert(status === 200, `HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`);
  });
  await r.check("F7", "version-route", "Version route", async () => {
    const { status, body } = await getJson(`${baseUrl}/api/version`);
    assert(status === 200, `HTTP ${status}`);
    return JSON.stringify(body).slice(0, 120);
  });

  // F8 notifications, badge, title bar, shortcuts, deep links, single instance
  await r.check("F8", "notification", "A desktop notification reaches the main process", async () => {
    const before = ctx.app.readMainLog().length;
    await bridge(page, "notifications", "showNotification", 987654321, "", "Function suite", "Notification body", "/notifications");
    await waitFor(
      "the notification log line",
      () => ctx.app.readMainLog().slice(before).find((line) => /Showing notification/.test(line.text)),
      10_000,
    );
  });
  await r.check("F8", "badge", "The badge count is set and cleared", async () => {
    const before = ctx.app.readMainLog().length;
    await bridge(page, "notifications", "setBadge", 3);
    const line = await waitFor(
      "the badge log line",
      () => ctx.app.readMainLog().slice(before).find((entry) => /badge count set/i.test(entry.text)),
      10_000,
    );
    await bridge(page, "notifications", "setBadge", 0);
    // Windows has no app badge API; Electron reports false there.
    return line.text;
  });
  await r.check("F8", "title-bar", "The custom title bar shows the environment label", async () => {
    await expectRendered(ctx, "/");
    const label = await page.evaluate(() => {
      const element = document.querySelector('[class*="environmentLabel"]');
      return element ? (element.textContent ?? "").trim() : null;
    });
    assert(label !== null, "no title bar environment label");
    return label || "(production: no suffix)";
  });
  await r.check("F8", "shortcut-search", "Ctrl/Cmd+F opens search", async () => {
    await page.evaluate(() => {
      (window as any).__suiteOpenSearch = false;
      (window as any).api.onOpenSearch(() => {
        (window as any).__suiteOpenSearch = true;
      });
    });
    // The shortcut is registered on native input (electron-localshortcut), which
    // CDP key events do not reach; send real keystrokes where we can.
    if (process.platform !== "win32") skip("native key input implemented for Windows");
    const sent = spawnSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(ctx.repoRoot, "e2e", "desktop", "lib", "keys.ps1"), "-ProcessId", String(ctx.app.pid), "-Keys", "^f"],
      { encoding: "utf8", windowsHide: true },
    );
    if (sent.status === 2) skip(`could not focus the app window: ${sent.stdout.trim()}`);
    assert(sent.status === 0, `keys: ${(sent.stdout + sent.stderr).trim()}`);
    await waitFor("the open-search event", () => page.evaluate(() => (window as any).__suiteOpenSearch === true), 5_000);
    await page.keyboard.press("Escape");
  });
  await r.check("F8", "deep-link-single-instance", "A deep link from a second launch navigates the running app, which stays single", async () => {
    const exitCode = await launchSecondInstance(ctx, `${ctx.scheme}://navigate/network`);
    await waitFor("navigation to /network", () => new URL(page.url()).pathname.startsWith("/network"), 20_000);
    const mainWindows = ctx.app.pages().filter((candidate) => candidate.url().startsWith(baseUrl));
    assert(mainWindows.length === 1, `${mainWindows.length} main windows`);
    return `second instance exit code ${exitCode}`;
  });
  await r.check("F8", "deep-link-share-connection", "A connection-sharing deep link opens the accept page", async () => {
    await launchSecondInstance(ctx, `${ctx.scheme}://share-connection?code=suite-test`);
    await waitFor(
      "navigation to /accept-connection-sharing",
      () => new URL(page.url()).pathname.startsWith("/accept-connection-sharing"),
      20_000,
    );
  });

  // F10 version check against the build's own feed
  await r.check("F10", "update-check", "The update check reaches the feed and answers", async () => {
    // On Linux electron-updater only updates an AppImage; an unpacked
    // folder never answers.
    if (process.platform === "linux" && !process.env.APPIMAGE && !ctx.app.options.exe.endsWith(".AppImage")) {
      skip("Linux updates run only from the AppImage, not an unpacked folder");
    }
    await page.evaluate(() => {
      const state = ((window as any).__suiteUpdate = { event: null as string | null, detail: null as any });
      const updater = (window as any).updater;
      updater.onUpdateAvailable((_e: unknown, info: any) => Object.assign(state, { event: "available", detail: info?.version }));
      updater.onUpdateNotAvailable((_e: unknown, info: any) => Object.assign(state, { event: "not-available", detail: info?.version }));
      updater.onUpdateError((_e: unknown, error: any) => Object.assign(state, { event: "error", detail: String(error?.message ?? error) }));
      updater.checkUpdates();
    });
    const state = await waitFor(
      "an updater answer",
      () => page.evaluate(() => ((window as any).__suiteUpdate.event ? (window as any).__suiteUpdate : null)),
      60_000,
      500,
    );
    assert(state.event !== "error", `update error: ${state.detail}`);
    return `${state.event} (${state.detail})`;
  });
}

/** The close dialog, background mode, restoring and quitting. Ends the app. */
export async function runLifecycleChecks(ctx: SuiteContext): Promise<void> {
  const { recorder: r } = ctx;
  if (!ctx.options.lifecycle) {
    await r.check("F8", "close-dialog", "Close confirmation", async () => skip("lifecycle checks not requested"));
    return;
  }
  const script = (name: string) => path.join(ctx.repoRoot, "e2e", "desktop", "lib", name);
  const powershell = (name: string, ...args: string[]) =>
    spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script(name), ...args], {
      encoding: "utf8",
      windowsHide: true,
    });
  // Button ids of the close dialog (electron-src/app-close.ts lists Quit,
  // Run in Background, Cancel): Electron gives Cancel the common IDCANCEL
  // and numbers the others from 100 in order.
  const CLOSE_DIALOG_BUTTONS: Record<string, number> = { Quit: 100, "Run in Background": 101, Cancel: 2 };
  const clickDialog = (button: string) => {
    const result = powershell("dialog.ps1", "-ProcessId", String(ctx.app.pid), "-Title", "Close 6529 Desktop", "-ButtonId", String(CLOSE_DIALOG_BUTTONS[button]));
    if (result.status !== 0) throw new Error(`dialog button "${button}": ${(result.stdout + result.stderr).trim()}`);
  };
  // window.close() from the page does not reach the BrowserWindow; post the
  // native close message, as the title bar's close button does.
  const requestClose = async () => {
    await ctx.app.mainPage(30_000);
    const sent = powershell("close-window.ps1", "-ProcessId", String(ctx.app.pid));
    if (sent.status !== 0) throw new Error(`close: ${(sent.stdout + sent.stderr).trim()}`);
  };

  await r.check("F8", "close-dialog-cancel", "Closing asks for confirmation; Cancel keeps the app open", async () => {
    if (process.platform !== "win32") skip("dialog automation implemented for Windows");
    await requestClose();
    clickDialog("Cancel");
    await sleep(1500);
    assert(ctx.app.pages().some((page) => page.url().startsWith(ctx.baseUrl)), "main window closed after Cancel");
  });
  await r.check("F9", "run-in-background", "Run in Background closes the window and keeps the app and IPFS running", async () => {
    if (process.platform !== "win32") skip("dialog automation implemented for Windows");
    await requestClose();
    clickDialog("Run in Background");
    await waitFor("the main window to close", () => !ctx.app.pages().some((page) => page.url().startsWith(ctx.baseUrl)), 15_000);
    assert(!ctx.app.hasExited, "the app exited");
    const info = await fetch(`${ctx.baseUrl}/api/version`, { signal: AbortSignal.timeout(15_000) });
    assert(info.ok, "renderer server stopped in background mode");
    const windows = (await ctx.app.cdpTargets()).filter((target) => target.type === "page");
    return `${windows.length} window(s) left open${windows.length ? `: ${windows.map((target) => target.title || target.url).join(", ")}` : ""}`;
  });
  await r.check("F9", "restore-from-background", "Restoring from background mode reopens the main window", async () => {
    if (process.platform !== "win32") skip("window automation implemented for Windows");
    // Launching the app again is how people reopen it; builds that keep a
    // minimized splash instead reopen when it is restored from the taskbar.
    await launchSecondInstance(ctx);
    let how = "a second launch reopened it";
    const reopened = await ctx.app.mainPage(15_000).catch(() => null);
    if (!reopened) {
      const restore = powershell("restore-window.ps1", "-ProcessId", String(ctx.app.pid));
      assert(restore.status === 0, `neither a second launch nor restoring a window reopened the app: ${(restore.stdout + restore.stderr).trim()}`);
      how = "restoring the minimized splash reopened it (a second launch did not)";
    }
    ctx.page = await ctx.app.mainPage(60_000);
    await ctx.page.waitForLoadState("domcontentloaded");
    return how;
  });
  await r.check("F8", "close-dialog-quit", "Quit stops the app and its IPFS node", async () => {
    if (process.platform !== "win32") skip("dialog automation implemented for Windows");
    await requestClose();
    clickDialog("Quit");
    assert(await ctx.app.waitForExit(30_000), "the app did not exit");
    return `exit code ${ctx.app.exitCode}`;
  });
}

/**
 * Launches the app again on the same profile, as a deep link or a second
 * start does, and waits for that second process to hand over and exit. A
 * second process that stays up means the single-instance lock broke; it is
 * stopped and reported instead of hanging the suite.
 */
async function launchSecondInstance(ctx: SuiteContext, ...args: string[]): Promise<number | null> {
  const second = spawn(
    ctx.app.options.exe,
    [...(ctx.app.options.extraArgs ?? []), `--user-data-dir=${ctx.app.options.profileDir}`, ...args],
    { stdio: "ignore" },
  );
  const exitCode = await new Promise<number | null | "timeout">((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), 30_000);
    second.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  if (exitCode === "timeout") {
    if (process.platform === "win32" && second.pid) {
      spawnSync("taskkill", ["/PID", String(second.pid), "/T", "/F"], { windowsHide: true });
    } else {
      second.kill("SIGKILL");
    }
    throw new Error("the second launch did not exit within 30 s: the app is no longer single-instance");
  }
  return exitCode;
}

function findProcessesByCommandLine(marker: string): number[] {
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${marker}*' -and $_.Name -ne 'powershell.exe' } | ForEach-Object { $_.ProcessId }`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  return result.stdout
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}
