"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  getConnectedWalletAccounts,
  getWalletAddress,
  restoreDesktopProfileState,
} from "@/services/auth/auth.utils";
import { initializeDesktopProfiles } from "@/services/auth/desktop-profile-storage";

export default function DesktopProfileStorageGate({
  children,
}: {
  readonly children: ReactNode;
}) {
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
      {
        version: 1,
        accounts,
        activeAddress: accounts.some(
          (account) => account.address.toLowerCase() === address?.toLowerCase()
        )
          ? address
          : null,
      },
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
  if (!failed) return null;
  return (
    <div role="alert" className="tw-p-6 tw-text-white">
      <p>Could not restore your saved profiles. Please retry.</p>
      <button type="button" onClick={() => setAttempt((value) => value + 1)}>
        Retry
      </button>
    </div>
  );
}
