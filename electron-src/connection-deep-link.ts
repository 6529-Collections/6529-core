/** Keep private setup fragments for the receiving renderer, never for logs. */
export function getConnectionDeepLinkNavigation(url: URL): string | null {
  const pathname =
    url.host === "share-connection"
      ? "/accept-connection-sharing"
      : url.host === "navigate"
        ? url.pathname
        : null;
  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(pathname ?? "");
  } catch {
    return null;
  }
  if (
    !pathname ||
    !decodedPathname.startsWith("/") ||
    decodedPathname.startsWith("//") ||
    decodedPathname.includes("\\") ||
    decodedPathname
      .split("/")
      .some((segment) => segment === "." || segment === "..") ||
    // Reject nested encoding rather than letting another decoder reveal a
    // separator, traversal segment or control character later in navigation.
    /%[0-9a-f]{2}/i.test(decodedPathname) ||
    Array.from(decodedPathname).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    return null;
  // Validate a decoded copy; preserve the original route encoding and the
  // private query/fragment exactly for the receiving page.
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
