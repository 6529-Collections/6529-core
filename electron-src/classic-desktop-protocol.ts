import type { App } from "electron";
import classicDesktop from "../config/classic-desktop.json";

type ProtocolClient = Pick<
  App,
  | "isPackaged"
  | "isDefaultProtocolClient"
  | "setAsDefaultProtocolClient"
  | "removeAsDefaultProtocolClient"
>;

export function registerClassicDesktopProtocol(
  app: ProtocolClient,
  scheme: string,
  platform: NodeJS.Platform,
): boolean {
  const environment = (
    Object.keys(classicDesktop.schemes) as Array<
      keyof typeof classicDesktop.schemes
    >
  ).find((name) => classicDesktop.schemes[name] === scheme);
  if (!environment) return false;

  if (
    !app.isDefaultProtocolClient(scheme) &&
    !app.setAsDefaultProtocolClient(scheme)
  ) {
    return false;
  }

  // macOS compares the bundle ID and Windows compares the executable and
  // command before removing the association. Both upgrade identities stay stable.
  if (!app.isPackaged || (platform !== "darwin" && platform !== "win32")) {
    return true;
  }
  const legacyScheme = classicDesktop.legacySchemes[environment];
  return (
    !app.isDefaultProtocolClient(legacyScheme) ||
    app.removeAsDefaultProtocolClient(legacyScheme)
  );
}
