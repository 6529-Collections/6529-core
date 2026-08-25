"use client";

import React, { createContext, ReactNode, useContext, useMemo } from "react";

type EULAConsentContextType = {
  readonly consent: () => Promise<void>;
  readonly isSaving: boolean;
  readonly saveError: string | null;
};

const EULAConsentContext = createContext<EULAConsentContextType | undefined>(
  undefined
);

export const useEULAConsent = () => {
  const context = useContext(EULAConsentContext);
  if (!context)
    throw new Error("useEULAConsent must be used within a EULAConsentProvider");
  return context;
};

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
