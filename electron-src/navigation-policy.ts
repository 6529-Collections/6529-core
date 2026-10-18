const EXTERNAL_WEB_PROTOCOLS = new Set(["http:", "https:"]);

export function shouldOpenInExternalBrowser(
  currentUrl: string,
  targetUrl: string,
): boolean {
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return false;
  }

  if (!EXTERNAL_WEB_PROTOCOLS.has(target.protocol)) {
    return false;
  }

  try {
    const current = new URL(currentUrl);
    if (!EXTERNAL_WEB_PROTOCOLS.has(current.protocol)) {
      return true;
    }

    return target.origin !== current.origin;
  } catch {
    return true;
  }
}

/**
 * Where a navigation goes from a window kept to one origin (the IPFS WebUI
 * window): it stays when it keeps that origin, opens in the system browser
 * when it is another web address, and is dropped otherwise.
 */
export function pinnedWindowNavigation(
  windowOrigin: string,
  targetUrl: string,
): "stay" | "external" | "block" {
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return "block";
  }
  if (target.origin === windowOrigin) {
    return "stay";
  }
  return EXTERNAL_WEB_PROTOCOLS.has(target.protocol) ? "external" : "block";
}
