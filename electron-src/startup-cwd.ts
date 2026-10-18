import path from "node:path";

/**
 * The working folder a packaged Windows app should run in: its own folder.
 *
 * Next's server finds its build output by taking the path from the working
 * folder to the app and joining it back on. When the app was started from a
 * folder on another drive (a shortcut's "Start in", a protocol link, a
 * command prompt), that path is absolute, the join produced an invalid path
 * and every page answered HTTP 500. A relative path always exists on macOS
 * and Linux, so they and development runs keep their folder.
 */
export function appWorkingDirectory(isPackaged: boolean, platform: NodeJS.Platform, execPath: string): string | null {
  return isPackaged && platform === "win32" ? path.win32.dirname(execPath) : null;
}
