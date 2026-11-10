"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const visibilityKey = ["desktop-validator-visible"] as const;

export function useDesktopValidatorVisibility() {
  const supported =
    typeof window !== "undefined" &&
    typeof window.api?.getDesktopValidatorVisible === "function";

  return useQuery({
    queryKey: visibilityKey,
    queryFn: () => window.api.getDesktopValidatorVisible(),
    enabled: supported,
    retry: false,
    staleTime: Infinity,
  });
}

export function useSetDesktopValidatorVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (visible: boolean) =>
      window.api.setDesktopValidatorVisible(visible),
    onSuccess: (visible) => queryClient.setQueryData(visibilityKey, visible),
  });
}

/** Share the installation and signing state across controls, with optional polling. */
export function useDesktopValidatorStatus(refresh = false) {
  const { data: visible } = useDesktopValidatorVisibility();

  const { data } = useQuery({
    queryKey: ["desktop-validator-status"],
    queryFn: () =>
      window.api
        .getDesktopValidatorStatus()
        .catch(() => ({ service: "unavailable" as const })),
    enabled: visible === true,
    retry: false,
    staleTime: 15_000,
    refetchInterval: visible && refresh ? 30_000 : false,
  });

  return visible ? data : undefined;
}

export function useOpenDesktopValidator() {
  return useMutation({
    mutationFn: async () => {
      if (typeof window.api?.openDesktopValidator !== "function") {
        throw new Error("Desktop Validator launch is unavailable");
      }
      await window.api.openDesktopValidator();
    },
  });
}
