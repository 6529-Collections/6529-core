"use client";

import React, { type ReactNode, useMemo } from "react";
import { EULAConsentContext } from "./useEULAConsent";
export { useEULAConsent } from "./useEULAConsent";

type EULAConsentProviderProps = {
  readonly children: ReactNode;
  readonly initialIsIos?: boolean;
  readonly initialConsentVersion?: string | undefined;
};

export const EULAConsentProvider: React.FC<EULAConsentProviderProps> = ({
  children,
}) => {
  const consent = async (): Promise<void> => undefined;

  const value = useMemo(
    () => ({ consent, isSaving: false, saveError: null }),
    [consent]
  );

  return (
    <EULAConsentContext.Provider value={value}>
      {children}
    </EULAConsentContext.Provider>
  );
};
