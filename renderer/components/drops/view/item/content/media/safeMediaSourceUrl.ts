const SAFE_MEDIA_SOURCE_PROTOCOLS = new Set(["blob:", "http:", "https:"]);
const FALLBACK_MEDIA_SOURCE_BASE_URL = "https://6529.io";

function getMediaSourceBaseUrl(): string {
  if (typeof globalThis.window === "undefined") {
    return FALLBACK_MEDIA_SOURCE_BASE_URL;
  }

  return globalThis.window.location?.origin || FALLBACK_MEDIA_SOURCE_BASE_URL;
}

export function getSafeMediaSourceUrl(src: string): string | null {
  try {
    const parsed = new URL(src, getMediaSourceBaseUrl());
    if (!SAFE_MEDIA_SOURCE_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
}
