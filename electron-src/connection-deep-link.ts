/** Keep private setup fragments for the receiving renderer, never for logs. */
export function getConnectionDeepLinkNavigation(url: URL): string | null {
  const pathname =
    url.host === "share-connection"
      ? "/accept-connection-sharing"
      : url.host === "navigate"
        ? url.pathname
        : null;
  if (
    !pathname ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.includes("\\") ||
    Array.from(pathname).some((char) => char.charCodeAt(0) <= 32)
  )
    return null;
  return `${pathname}${url.search}${url.hash}`;
}

/** Omit URL credentials, query parameters and fragments from native logs. */
export function getNavigationLogUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "[invalid URL]";
  }
}
