import { BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import {
  getDesktopProfileMigrationState,
  type DesktopProfileState,
} from "../shared/desktop-profile-state";

// An intercepted blank document gives Chromium its old storage origin without
// contacting whatever application now owns 6529. It has no preload or scripts.
export async function readLegacyDesktopProfiles(
  origin = "http://localhost:6529",
): Promise<DesktopProfileState> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const url = `${origin}/__desktop_profile_migration_${randomUUID()}`;
  const debuggerApi = window.webContents.debugger;
  const timeout = setTimeout(() => {
    if (!window.isDestroyed()) window.destroy();
  }, 10_000);
  let interceptionFailed = false;
  try {
    await window.loadURL("about:blank");
    debuggerApi.attach("1.3");
    await debuggerApi.sendCommand("Network.setBypassServiceWorker", {
      bypass: true,
    });
    debuggerApi.on("message", (_event, method, params) => {
      if (method !== "Fetch.requestPaused") return;
      const command =
        params.request.url === url && params.resourceType === "Document"
          ? debuggerApi.sendCommand("Fetch.fulfillRequest", {
              requestId: params.requestId,
              responseCode: 200,
              responseHeaders: [
                { name: "Content-Type", value: "text/html" },
                { name: "Cache-Control", value: "no-store" },
                {
                  name: "Content-Security-Policy",
                  value: "default-src 'none'",
                },
              ],
              body: Buffer.from(
                "<!doctype html><title>Desktop profile migration</title>",
              ).toString("base64"),
            })
          : debuggerApi.sendCommand("Fetch.failRequest", {
              requestId: params.requestId,
              errorReason: "Aborted",
            });
      void command.catch(() => {
        interceptionFailed = true;
        if (!window.isDestroyed()) window.destroy();
      });
    });
    await debuggerApi.sendCommand("Fetch.enable", {
      patterns: [{ urlPattern: "*" }],
    });
    await window.loadURL(url);
    if (interceptionFailed)
      throw new Error("Desktop profile migration interception failed");
    const raw: unknown = await window.webContents
      .executeJavaScript(`JSON.stringify({
      accounts: localStorage.getItem("6529-wallet-accounts"),
      activeAddress: localStorage.getItem("6529-wallet-active-address")
    })`);
    if (typeof raw !== "string" || raw.length > 256_000)
      throw new Error("Invalid legacy Desktop profiles");
    const stored = JSON.parse(raw);
    const accounts =
      stored.accounts === null ? [] : JSON.parse(stored.accounts);
    return getDesktopProfileMigrationState({
      version: 1,
      accounts,
      activeAddress: stored.activeAddress,
    });
  } catch {
    throw new Error(
      "Could not read saved Desktop profiles from the previous origin",
    );
  } finally {
    clearTimeout(timeout);
    if (!window.isDestroyed()) window.destroy();
  }
}
