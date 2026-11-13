"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  getConnectedWalletAccounts,
  getWalletAddress,
  restoreDesktopProfileState,
} from "@/services/auth/auth.utils";
import {
  initializeDesktopProfiles,
  getDesktopProfileSaveStatus,
  getDesktopProfileServerSaveStatus,
  subscribeDesktopProfileSaveStatus,
  retryDesktopProfileSave,
  notifyDesktopProfilesReady,
  restartDesktopProfileRestore,
} from "@/services/auth/desktop-profile-storage";
import { getDesktopProfileMigrationState } from "@/shared/desktop-profile-state";
import { DesktopProfileRecoveryContext } from "@/contexts/DesktopProfileRecoveryContext";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { t } from "@/i18n/messages";

export default function DesktopProfileStorageGate({
  children,
}: {
  readonly children: ReactNode;
}) {
  const locale = useBrowserLocale();
  const [startup, setStartup] = useState<"loading" | "ready" | "signed-out">(
    "loading"
  );
  const [restartStatus, setRestartStatus] = useState<
    "idle" | "pending" | "failed"
  >("idle");
  const saveStatus = useSyncExternalStore(
    subscribeDesktopProfileSaveStatus,
    getDesktopProfileSaveStatus,
    getDesktopProfileServerSaveStatus
  );
  useEffect(() => {
    if (startup !== "loading") notifyDesktopProfilesReady();
  }, [startup]);
  useEffect(() => {
    let active = true;
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
        if (active) setStartup("ready");
      })
      .catch(() => {
        if (!active) return;
        restoreDesktopProfileState({
          version: 1,
          accounts: [],
          activeAddress: null,
        });
        setStartup("signed-out");
      });
    return () => {
      active = false;
    };
  }, []);
  if (startup === "loading") return null;
  return (
    <DesktopProfileRecoveryContext.Provider value={startup === "signed-out"}>
      {children}
      {startup === "signed-out" && (
        <div
          role="status"
          className="tw-fixed tw-bottom-6 tw-right-6 tw-z-[1000] tw-max-w-md tw-rounded-xl tw-border tw-border-solid tw-border-iron-600 tw-bg-iron-950 tw-p-4 tw-text-white tw-shadow-xl"
        >
          <p className="tw-mt-0">
            {t(locale, "desktop.profiles.restoreError")}
          </p>
          {restartStatus === "failed" && (
            <p role="alert">{t(locale, "desktop.profiles.restartError")}</p>
          )}
          <button
            type="button"
            disabled={restartStatus === "pending"}
            aria-busy={restartStatus === "pending"}
            className="tw-min-h-11 tw-rounded-lg tw-border-0 tw-bg-white tw-px-4 tw-py-2 tw-font-semibold tw-text-black focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-offset-2 focus-visible:tw-outline-primary-400 disabled:tw-opacity-50"
            onClick={() => {
              setRestartStatus("pending");
              void restartDesktopProfileRestore().catch(() =>
                setRestartStatus("failed")
              );
            }}
          >
            {t(locale, "desktop.profiles.restart")}
          </button>
        </div>
      )}
      {startup === "ready" && saveStatus !== "idle" && (
        <div
          role={saveStatus === "failed" ? "alert" : "status"}
          className="tw-fixed tw-bottom-6 tw-right-6 tw-z-[1000] tw-max-w-md tw-rounded-xl tw-border tw-border-solid tw-border-iron-600 tw-bg-iron-950 tw-p-4 tw-text-white tw-shadow-xl"
        >
          <p className="tw-mt-0">
            {t(
              locale,
              saveStatus === "retrying"
                ? "desktop.profiles.saveRetrying"
                : "desktop.profiles.saveError"
            )}
          </p>
          <button
            type="button"
            disabled={saveStatus === "retrying"}
            className="tw-min-h-11 tw-rounded-lg tw-border-0 tw-bg-white tw-px-4 tw-py-2 tw-font-semibold tw-text-black focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-offset-2 focus-visible:tw-outline-primary-400 disabled:tw-opacity-50"
            onClick={() => {
              void retryDesktopProfileSave().catch(() => undefined);
            }}
          >
            {t(locale, "desktop.profiles.retry")}
          </button>
        </div>
      )}
    </DesktopProfileRecoveryContext.Provider>
  );
}
