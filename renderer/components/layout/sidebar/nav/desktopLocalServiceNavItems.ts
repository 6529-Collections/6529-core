import DesktopIpfsNavItem from "./DesktopIpfsNavItem";
import DesktopValidatorNavItem from "./DesktopValidatorNavItem";

export const desktopLocalServiceNavItems: ReadonlyMap<
  string,
  typeof DesktopIpfsNavItem
> = new Map([
  ["desktop-ipfs", DesktopIpfsNavItem],
  ["desktop-validator", DesktopValidatorNavItem],
]);
