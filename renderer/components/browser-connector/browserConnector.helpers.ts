import { publicEnv } from "@/config/env";

export const BROWSER_CONNECTOR_REQUEST_TIMEOUT_MS = 120_000;

const ALLOWED_CORE_SCHEMES = [
  "localcore6529",
  "stagingcore6529",
  "core6529",
] as const;

type CoreScheme = (typeof ALLOWED_CORE_SCHEMES)[number];

const HEX_ADDRESS_REGEX = /^0x[0-9a-f]{40}$/;

export function normalizeBrowserConnectorAddress(
  value: string | null | undefined
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.toLowerCase();
  return HEX_ADDRESS_REGEX.test(normalized) ? normalized : null;
}

export function normalizeCoreScheme(
  value: string | null | undefined
): CoreScheme | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase().replace(/:\/\/$/, "");
  return ALLOWED_CORE_SCHEMES.includes(normalized as CoreScheme)
    ? (normalized as CoreScheme)
    : null;
}

export function getExpectedCoreScheme(): CoreScheme {
  return normalizeCoreScheme(publicEnv.CORE_SCHEME) ?? "core6529";
}

export function getCoreSchemeValidationError(
  requestedScheme: string | null | undefined
): string | null {
  const expectedScheme = getExpectedCoreScheme();
  const normalizedRequestedScheme = normalizeCoreScheme(requestedScheme);
  if (!normalizedRequestedScheme) {
    return "This browser connector link has an invalid desktop return target.";
  }
  if (normalizedRequestedScheme !== expectedScheme) {
    return "This browser connector link is for a different 6529 Desktop build.";
  }
  return null;
}

export function formatBrowserConnectorTimeLeft(timeLeftMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(timeLeftMs / 1000));
  if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }
  return `${totalSeconds} ${totalSeconds === 1 ? "second" : "seconds"}`;
}
