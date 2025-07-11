"use client";

import { useEffect } from "react";
import { openInExternalBrowser } from "@/helpers";
import { SEIZE_URL } from "@/electron-constants";

export const handleAnchorClick = (event: any) => {
  const target = event.target.closest("a");

  if (target && target.tagName === "A") {
    const href = target.href;
    const isExternalLink = target.target === "_blank";
    if (isExternalLink) {
      event.preventDefault();
      if (
        href.startsWith(SEIZE_URL) ||
        href.startsWith("/") ||
        href.includes("localhost")
      ) {
        window.location.href = href.replace(SEIZE_URL, "");
      } else {
        openInExternalBrowser(href);
      }
    }
  }
};

export const useAnchorInterceptor = () => {
  useEffect(() => {
    document.addEventListener("click", handleAnchorClick);

    return () => {
      document.removeEventListener("click", handleAnchorClick);
    };
  }, []);
};
