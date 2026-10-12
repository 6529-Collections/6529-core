export interface ConsolidationSettingsRequest {
  readonly url: string;
  readonly headers: Record<string, string>;
}
export interface ConsolidationPolicy {
  readonly activationTimestamp: number;
  readonly key: string;
}

export function parseConsolidationPolicy(
  settings: unknown,
  settingsUrl: string,
): ConsolidationPolicy {
  const value =
    settings && typeof settings === "object"
      ? Reflect.get(settings, "consolidation")
      : null;
  const cutoff: unknown =
    value && typeof value === "object"
      ? Reflect.get(value, "four_wallet_activation_at")
      : null;
  if (
    typeof cutoff !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.000)?Z$/.test(cutoff)
  )
    throw new Error("Backend consolidation policy is unavailable or invalid");
  const activationMs = Date.parse(cutoff);
  const normalized = cutoff.endsWith(".000Z")
    ? cutoff
    : cutoff.replace(/Z$/, ".000Z");
  if (
    !Number.isFinite(activationMs) ||
    new Date(activationMs).toISOString() !== normalized
  )
    throw new Error("Backend consolidation policy is invalid");
  return {
    activationTimestamp: activationMs / 1000,
    key: `${settingsUrl}:${normalized}`,
  };
}

/** One fresh snapshot per calculation, with no production-date fallback. */
export async function loadConsolidationPolicy(
  request: ConsolidationSettingsRequest | undefined,
): Promise<ConsolidationPolicy> {
  if (!request)
    throw new Error("Selected backend settings request is not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(request.url, {
      headers: request.headers,
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Backend settings request failed (${response.status})`);
    return parseConsolidationPolicy(await response.json(), request.url);
  } finally {
    clearTimeout(timeout);
  }
}
