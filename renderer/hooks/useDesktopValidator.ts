"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

export function useDesktopValidatorStatus(refresh = false) {
  const enabled =
    typeof window !== "undefined" &&
    typeof window.api?.getDesktopValidatorStatus === "function";

  return useQuery({
    queryKey: ["desktop-validator-status"],
    queryFn: () =>
      window.api
        .getDesktopValidatorStatus()
        .catch(() => "unavailable" as const),
    enabled,
    retry: false,
    staleTime: 15_000,
    refetchInterval: refresh ? 30_000 : false,
  }).data;
}

export function useOpenDesktopValidator() {
  return useMutation({
    mutationFn: () => window.api.openDesktopValidator(),
  });
}
