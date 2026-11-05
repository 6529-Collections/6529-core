"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  getConnectedWalletAccounts,
  getWalletAddress,
  restoreDesktopProfileState,
} from "@/services/auth/auth.utils";
import { initializeDesktopProfiles } from "@/services/auth/desktop-profile-storage";
import { getDesktopProfileMigrationState } from "@/shared/desktop-profile-state";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { t } from "@/i18n/messages";

export default function DesktopProfileStorageGate({
  children,
}: {
  readonly children: ReactNode;
}) {
  const locale = useBrowserLocale();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setFailed(false);
    const accounts = getConnectedWalletAccounts().map((account) => ({
      ...account,
      authSessionVersion: account.authSessionVersion ?? null,
      refreshToken: null,
    }));
    const address = getWalletAddress();
    void initializeDesktopProfiles(
      getDesktopProfileMigrationState({
        accounts,
        activeAddress: accounts.some(
          (account) => account.address.toLowerCase() === address?.toLowerCase()
        )
          ? address
          : null,
      }),
      restoreDesktopProfileState
    )
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (ready) return children;
  if (!failed)
    return (
      <p role="status" className="tw-p-6 tw-text-white">
        {t(locale, "desktop.profiles.loading")}
      </p>
    );
  return (
    <div role="alert" className="tw-p-6 tw-text-white">
      <p>{t(locale, "desktop.profiles.restoreError")}</p>
      <button
        type="button"
        className="tw-min-h-11 tw-rounded-lg tw-border-0 tw-bg-white tw-px-4 tw-py-2 tw-font-semibold tw-text-black focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-offset-2 focus-visible:tw-outline-primary-400"
        onClick={() => setAttempt((value) => value + 1)}
      >
        {t(locale, "desktop.profiles.retry")}
      </button>
    </div>
  );
}
