/** Preserve incoming connection credentials even when their page is already open. */
export function getDesktopNavigationTarget(
  value: string,
  origin: string,
  currentPathname: string
): { url: string; replace: boolean } | null {
  try {
    if (
      !value.startsWith("/") ||
      value.startsWith("//") ||
      value.includes("\\")
    )
      return null;
    const target = new URL(value, origin);
    if (target.origin !== origin) return null;
    const replace = target.pathname === currentPathname;
    if (replace) target.searchParams.set("reload", "true");
    return { url: `${target.pathname}${target.search}${target.hash}`, replace };
  } catch {
    return null;
  }
}
