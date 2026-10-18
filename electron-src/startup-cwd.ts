import path from "node:path";

/**
 * The working folder a packaged app should run in: its own folder.
 *
 * Next's server finds its build output by taking the path from the working
 * folder to the app and joining it back on. When the app was started from a
 * folder on another drive (a shortcut's "Start in", a protocol link, a
 * command prompt), that path is absolute, the join produced an invalid path
 * and every page answered HTTP 500. Development runs keep their folder.
 */
export function appWorkingDirectory(isPackaged: boolean, execPath: string): string | null {
  return isPackaged ? path.dirname(execPath) : null;
}
