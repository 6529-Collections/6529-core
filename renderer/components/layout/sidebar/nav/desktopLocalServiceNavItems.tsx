import type { ComponentProps } from "react";
import DesktopIpfsNavItem from "./DesktopIpfsNavItem";
import DesktopValidatorNavItem from "./DesktopValidatorNavItem";

const LOCAL_SERVICE_ITEMS = {
  "desktop-ipfs": DesktopIpfsNavItem,
  "desktop-validator": DesktopValidatorNavItem,
};

/** Render native service rows, leaving ordinary links to the caller. */
export function renderDesktopLocalServiceNavItem(
  id: string | undefined,
  props: ComponentProps<typeof DesktopIpfsNavItem>
) {
  if (id !== "desktop-ipfs" && id !== "desktop-validator") return null;
  const LocalService = LOCAL_SERVICE_ITEMS[id];
  return <LocalService key={id} {...props} />;
}
