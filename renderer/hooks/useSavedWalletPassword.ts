"use client";

import { useEffect, useState } from "react";

export function useSavedWalletPassword(address: string | undefined) {
  const [status, setStatus] = useState({ address, saved: false });

  // Each dialog opening starts with a fresh Keychain lookup, even for the same wallet.
  if (status.address !== address) setStatus({ address, saved: false });

  useEffect(() => {
    const bridge = window.walletPasswords;
    if (!address || !bridge) return;
    let active = true;
    void bridge.hasSavedPassword(address).then(
      (saved) => {
        if (active) setStatus({ address, saved });
      },
      () => {
        if (active) setStatus({ address, saved: false });
      }
    );
    return () => {
      active = false;
    };
  }, [address]);

  return {
    hasSavedPassword: address !== undefined && status.address === address && status.saved,
    clearSavedPassword: () => setStatus({ address, saved: false }),
  };
}
