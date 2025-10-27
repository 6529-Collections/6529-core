"use client";

import SearchBar from "@/components/core/search-bar/SearchBar";
import TitleBar from "@/components/header/titlebar/TitleBar";
import { isElectron } from "@/helpers";

export default function TitleBarWrapper() {
  return isElectron() ? (
    <>
      <TitleBar />
      <SearchBar />
    </>
  ) : null;
}
