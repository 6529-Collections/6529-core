"use client";

import { useEffect, useRef } from "react";

export function useEffectOnce<T extends readonly any[]>(
  effect: () => void | (() => void),
  deps: T
): void {
  const previousDeps = useRef<T | undefined>();

  useEffect(() => {
    if (!depsEqual(previousDeps.current, deps)) {
      effect();
      previousDeps.current = deps;
    }
  }, deps);
}

function depsEqual<T extends readonly any[]>(
  prevDeps: T | undefined,
  nextDeps: T
): boolean {
  if (prevDeps === undefined) return false;
  return (
    prevDeps.length === nextDeps.length &&
    prevDeps.every((dep, i) => Object.is(dep, nextDeps[i]))
  );
}
