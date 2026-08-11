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
