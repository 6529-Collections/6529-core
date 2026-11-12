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

/** Check for the app without polling its service or reading the badge preference. */
export function useDesktopValidatorInstallation(active = true) {
  const supported =
    typeof window !== "undefined" &&
    typeof window.api?.isDesktopValidatorInstalled === "function";
  const enabled = supported && active;
  const { data: installed, isError } = useQuery({
    queryKey: ["desktop-validator-installed"],
    queryFn: () => window.api.isDesktopValidatorInstalled(),
    enabled,
    retry: false,
    staleTime: 5_000,
    refetchInterval: enabled ? 15_000 : false,
  });

  return { supported, installed, isError };
}

/** Share the installation and signing state across controls, with optional polling. */
export function useDesktopValidatorStatus(refresh = false) {
  const { data: visible } = useDesktopValidatorVisibility();
  const installation = useDesktopValidatorInstallation(visible === true);
  const canReadStatus =
    !installation.supported || (installation.installed ?? installation.isError);
  const enabled =
    visible === true &&
    canReadStatus &&
    typeof window !== "undefined" &&
    typeof window.api?.getDesktopValidatorStatus === "function";

  const { data } = useQuery({
    queryKey: ["desktop-validator-status"],
    queryFn: () =>
      window.api
        .getDesktopValidatorStatus()
        .catch(() => ({ service: "unavailable" as const })),
    enabled,
    retry: false,
    staleTime: 15_000,
    refetchInterval: enabled && refresh ? 30_000 : false,
  });

  return enabled ? data : undefined;
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
