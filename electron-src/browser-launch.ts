import type { ChildProcess } from "node:child_process";

export interface BrowserLaunchDeps {
  /** The `open` package's launcher, given the browser's app name(s). */
  openWithApp: (url: string, app: string | readonly string[]) => Promise<ChildProcess>;
  /** The system's default browser (Electron's shell.openExternal). */
  openDefault: (url: string) => Promise<void>;
  log: (message: string, detail?: unknown) => void;
  platform: NodeJS.Platform;
}

/**
 * Opens a URL in a named browser, and in the default browser when that one
 * cannot be started. `open` resolves as soon as it has started its launcher,
 * so a missing browser has to be read from the launcher itself: on Windows
 * (PowerShell's Start-Process) and macOS (`open -a`) it exits at once, with a
 * non-zero code when the browser is not installed. On Linux the launched
 * process is the browser, which may run for hours, so only a failure to start
 * it counts.
 */
export function openInBrowser(
  url: string,
  app: string | readonly string[],
  label: string,
  deps: BrowserLaunchDeps,
): void {
  let fellBack = false;
  const fallback = (reason: unknown) => {
    if (fellBack) return;
    fellBack = true;
    deps.log(`Could not open ${label}; opening the default browser instead:`, reason);
    deps.openDefault(url).catch((error: unknown) => {
      deps.log("Could not open the default browser either:", error);
    });
  };
  deps
    .openWithApp(url, app)
    .then((child) => {
      child.once("error", fallback);
      if (deps.platform === "win32" || deps.platform === "darwin") {
        child.once("exit", (code) => {
          if (code) fallback(new Error(`the ${label} launcher exited with code ${code}`));
        });
      }
    })
    .catch(fallback);
}
