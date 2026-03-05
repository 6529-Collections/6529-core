"use client";

import SearchBar from "@/components/core/search-bar/SearchBar";
import TitleBar from "@/components/header/titlebar/TitleBar";
import DesktopNotificationsBridge from "@/components/notifications/DesktopNotificationsBridge";
import { isElectron } from "@/helpers";

export default function TitleBarWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return isElectron() ? (
    <>
      <TitleBar />
      <DesktopNotificationsBridge />
      <SearchBar />
      {children}
    </>
  ) : null;
}
