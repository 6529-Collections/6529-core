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
} from "@/services/auth/desktop-profile-storage";
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
  const [retryingRestore, setRetryingRestore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const saveStatus = useSyncExternalStore(
    subscribeDesktopProfileSaveStatus,
    getDesktopProfileSaveStatus,
    getDesktopProfileServerSaveStatus
  );
  useEffect(() => {
    if (ready || failed) notifyDesktopProfilesReady();
  }, [ready, failed]);
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
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          setRetryingRestore(false);
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (ready)
    return (
      <>
        {children}
        {saveStatus !== "idle" && (
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
      </>
    );
  if (!failed) return null;
  return (
    <div role="alert" className="tw-p-6 tw-text-white">
      <p>{t(locale, "desktop.profiles.restoreError")}</p>
      <button
        type="button"
        disabled={retryingRestore}
        aria-busy={retryingRestore}
        className="tw-min-h-11 tw-rounded-lg tw-border-0 tw-bg-white tw-px-4 tw-py-2 tw-font-semibold tw-text-black focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-offset-2 focus-visible:tw-outline-primary-400 disabled:tw-opacity-50"
        onClick={() => {
          setRetryingRestore(true);
          setAttempt((value) => value + 1);
        }}
      >
        {t(locale, "desktop.profiles.retry")}
      </button>
    </div>
  );
}
