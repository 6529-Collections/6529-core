"use client";

import { useVersionStatus } from "@/contexts/VersionStatusContext";

export function useWebVersionUpdate(): "sidebar" | "toast" | null {
  const isVersionStale = useVersionStatus();
  // Core always uses the sidebar, including touch-capable desktop hardware.
  return isVersionStale ? "sidebar" : null;
}
