export type TdhRestartAction = "none" | "rerun" | "defer";

export function getTdhRestartAction(
  incompleteRun: boolean,
  workerEnabled: boolean,
): TdhRestartAction {
  if (!incompleteRun) {
    return "none";
  }
  return workerEnabled ? "rerun" : "defer";
}
