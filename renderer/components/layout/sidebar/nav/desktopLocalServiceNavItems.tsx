import type { ComponentProps } from "react";
import DesktopIpfsNavItem from "./DesktopIpfsNavItem";

/** Render native service rows, leaving ordinary links to the caller. */
export function renderDesktopLocalServiceNavItem(
  id: string | undefined,
  props: ComponentProps<typeof DesktopIpfsNavItem>
) {
  return id === "desktop-ipfs" ? (
    <DesktopIpfsNavItem key={id} {...props} />
  ) : null;
}
