"use client";

import React, { createContext, ReactNode, useContext, useMemo } from "react";

type EULAConsentContextType = {
  consent: () => void;
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
  children: ReactNode;
};

export const EULAConsentProvider: React.FC<EULAConsentProviderProps> = ({
  children,
}) => {
  const consent = async () => {
    throw new Error("Not implemented");
  };

  const value = useMemo(() => ({ consent }), [consent]);

  return (
    <EULAConsentContext.Provider value={value}>
      {children}
    </EULAConsentContext.Provider>
  );
};
