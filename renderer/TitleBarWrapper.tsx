"use client";

import SearchBar from "@/components/core/search-bar/SearchBar";
import TitleBar from "@/components/header/titlebar/TitleBar";
import { RefreshProvider } from "@/contexts/RefreshContext";
import { isElectron } from "@/helpers";

export default function TitleBarWrapper() {
  return isElectron() ? (
    <RefreshProvider>
      <TitleBar />
      <SearchBar />
    </RefreshProvider>
  ) : null;
}
