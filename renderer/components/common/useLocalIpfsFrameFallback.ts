"use client";

import { canonicalizeLocalInteractiveMediaUrl } from "@/components/common/localInteractiveMediaUrl";
import { useLayoutEffect } from "react";

function navigationKey(value: string): string | null {
  try {
    const url = new URL(value);
    // Kubo may append a trailing slash when it serves a directory.
    return `${url.origin}${url.pathname.replace(/\/$/, "")}${url.search}`;
  } catch {
    return null;
  }
}

export function useLocalIpfsFrameFallback(
  url: string | undefined,
  onFailure: () => void,
  enabled = true
): boolean {
  const localUrl = url ? canonicalizeLocalInteractiveMediaUrl(url) : null;
  useLayoutEffect(() => {
    if (!localUrl || !enabled) return;
    const key = navigationKey(localUrl);
    if (!key) return;
    return globalThis.window?.api?.onLocalIpfsFrameFailed?.((failedUrl) => {
      if (key === navigationKey(failedUrl)) onFailure();
    });
  }, [localUrl, onFailure, enabled]);
  return localUrl !== null;
}
