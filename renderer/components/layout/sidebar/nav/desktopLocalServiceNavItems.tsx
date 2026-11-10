import type { ComponentProps } from "react";
import DesktopIpfsNavItem from "./DesktopIpfsNavItem";
import DesktopValidatorNavItem from "./DesktopValidatorNavItem";

/** Render native service rows, leaving ordinary links to the caller. */
export function renderDesktopLocalServiceNavItem(
  id: string | undefined,
  props: ComponentProps<typeof DesktopIpfsNavItem>
) {
  switch (id) {
    case "desktop-ipfs":
      return <DesktopIpfsNavItem key={id} {...props} />;
    case "desktop-validator":
      return <DesktopValidatorNavItem key={id} {...props} />;
    default:
      return null;
  }
}
