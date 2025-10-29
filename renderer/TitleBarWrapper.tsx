"use client";

import SearchBar from "@/components/core/search-bar/SearchBar";
import TitleBar from "@/components/header/titlebar/TitleBar";
import { isElectron } from "@/helpers";

export default function TitleBarWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return isElectron() ? (
    <>
      <TitleBar />
      <SearchBar />
      {children}
    </>
  ) : null;
}
