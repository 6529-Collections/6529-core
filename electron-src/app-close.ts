import type { MessageBoxOptions } from "electron";

export type AppCloseAction = "quit" | "run-background" | "cancel";

export const APP_CLOSE_DIALOG_OPTIONS = {
  type: "question",
  title: "Close 6529 Desktop",
  message: "Close 6529 Desktop?",
  detail: "Quit completely or keep desktop services running in the background.",
  buttons: ["Quit", "Run in Background", "Cancel"],
  defaultId: 2,
  cancelId: 2,
  noLink: true,
} satisfies MessageBoxOptions;

export function getAppCloseAction(response: number): AppCloseAction {
  if (response === 0) {
    return "quit";
  }
  if (response === 1) {
    return "run-background";
  }
  return "cancel";
}
