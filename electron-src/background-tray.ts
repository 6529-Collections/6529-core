import { Menu, nativeImage, Tray } from "electron";

export interface BackgroundTrayActions {
  open: () => void;
  quit: () => void;
}

export const BACKGROUND_TRAY_TOOLTIP = "6529 Desktop is running in the background";

/** Labels and actions of the tray menu, kept apart from Electron for tests. */
export function backgroundTrayMenu(actions: BackgroundTrayActions) {
  return [
    { label: "Open 6529 Desktop", click: actions.open },
    { type: "separator" as const },
    { label: "Quit 6529 Desktop", click: actions.quit },
  ];
}

let tray: Tray | null = null;

/**
 * While the app runs in the background there is no window: a tray icon
 * (notification area on Windows, menu bar on macOS, status area on Linux)
 * reopens it or quits.
 */
export function showBackgroundTray(iconPath: string, actions: BackgroundTrayActions): void {
  if (tray && !tray.isDestroyed()) {
    return;
  }
  const image = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip(BACKGROUND_TRAY_TOOLTIP);
  tray.setContextMenu(Menu.buildFromTemplate(backgroundTrayMenu(actions)));
  // macOS opens the menu on click; Windows and Linux reopen the window.
  if (process.platform !== "darwin") {
    tray.on("click", actions.open);
  }
}

export function hideBackgroundTray(): void {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
  }
  tray = null;
}

export function isBackgroundTrayShown(): boolean {
  return tray !== null && !tray.isDestroyed();
}
