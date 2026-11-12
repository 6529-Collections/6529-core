"use client";

import { useToast } from "@/contexts/ToastContext";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { t } from "@/i18n/messages";
import { useCallback } from "react";

export function useOfferWalletPasswordSave() {
  const { showToast } = useToast();
  const locale = useBrowserLocale();

  return useCallback(async (address: string, password: string) => {
    const bridge = window.walletPasswords;
    if (!bridge) return;
    try {
      const result = await bridge.offerSave(address, password);
      if (result.ok || result.code === "unavailable") return;
    } catch {
      // The wallet operation already succeeded. Report only the save failure.
    }
    showToast(t(locale, "desktop.walletPasswords.saveFailed"), "error", true);
  }, [locale, showToast]);
}
