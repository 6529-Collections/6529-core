import { MenuItem, MenuItemConstructorOptions } from "electron";
import { checkForUpdates } from "./update";

export const menuTemplate: Array<MenuItemConstructorOptions | MenuItem> = [
  {
    label: "File",
    submenu: [
      { role: "about" },
      { type: "separator" },
      {
        label: "Check for Updates",
        click: () => checkForUpdates(true),
      },
      { type: "separator" },
      { role: "quit" },
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
];
