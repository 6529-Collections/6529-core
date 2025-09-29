"use client";

import { publicEnv } from "@/config/env";
import { openInExternalBrowser } from "@/helpers";
import { useEffect } from "react";

export const handleAnchorClick = (event: any) => {
  const target = event.target.closest("a");

  if (target && target.tagName === "A") {
    const href = target.href;
    const isExternalLink = target.target === "_blank";
    if (isExternalLink) {
      event.preventDefault();
      if (
        href.startsWith(publicEnv.BASE_ENDPOINT) ||
        href.startsWith("/") ||
        href.includes("localhost")
      ) {
        window.location.href = href.replace(publicEnv.BASE_ENDPOINT, "");
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
