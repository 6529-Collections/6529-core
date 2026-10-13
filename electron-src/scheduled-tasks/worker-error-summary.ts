/** Keep worker cards readable; the logger retains the original error and stack. */
export function summarizeWorkerError(error: unknown): string {
  const detail =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const candidate = [detail.shortMessage, detail.message, error].find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
  const summary =
    candidate?.trim().split(/\r?\n/, 1)[0]?.trim() || "Worker failed";
  return summary.length > 240 ? `${summary.slice(0, 239).trimEnd()}…` : summary;
}
