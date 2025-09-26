"use client";

import { useRouter } from "next/navigation";
import React, {
  createContext,
  Fragment,
  startTransition,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type RefreshCtx = {
  rev: number;
  globalRefresh: () => void;
};

const Ctx = createContext<RefreshCtx | null>(null);

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [rev, setRev] = useState(0);

  const globalRefresh = useCallback(() => {
    // Remount client subtree:
    startTransition(() => setRev((v) => v + 1));
    // Revalidate server data:
    router.refresh();
  }, [router]);

  const value = useMemo(() => ({ rev, globalRefresh }), [rev, globalRefresh]);

  return (
    <Ctx.Provider value={value}>
      <Fragment key={rev}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export function useGlobalRefresh() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useGlobalRefresh must be used under <RefreshProvider>");
  return ctx;
}
