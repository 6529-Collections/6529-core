"use client";

import React, { createContext, useCallback, useContext, useMemo } from "react";

type RefreshCtx = {
  globalRefresh: () => void;
};

const Ctx = createContext<RefreshCtx | null>(null);

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const globalRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  const value = useMemo(() => ({ globalRefresh }), [globalRefresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGlobalRefresh() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useGlobalRefresh must be used under <RefreshProvider>");
  }
  return ctx;
}
