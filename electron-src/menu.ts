import { MenuItem, MenuItemConstructorOptions } from "electron";
import { platform } from "os";
import classicDesktop from "../config/classic-desktop.json";

export const menuTemplate: Array<MenuItemConstructorOptions | MenuItem> = [
  {
    label: "File",
    submenu: [
      { role: "about", label: `About ${classicDesktop.displayName}` },
      { type: "separator" },
      { role: "quit", label: `Quit ${classicDesktop.displayName}` },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
  {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  },
  {
    label: "Window",
    submenu: [
      { role: "close" },
      { role: "minimize" },
      { role: "zoom" },
      { type: "separator" },
      { role: "front" },
      ...(platform() === "darwin"
        ? [
            { type: "separator" as const },
            { role: "hide" as const },
            { role: "hideOthers" as const },
            { role: "unhide" as const },
          ]
        : []),
    ],
  },
];
