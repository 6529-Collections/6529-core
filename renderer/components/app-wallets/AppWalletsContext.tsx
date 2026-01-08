"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";

export interface AppWallet {
  name: string;
  created_at: number;
  address: string;
  address_hashed: string;
  mnemonic: string;
  private_key: string;
  imported: boolean;
}

interface AppWalletsContextProps {
  fetchingAppWallets: boolean;
  appWallets: AppWallet[];
  appWalletsSupported: boolean;
  createAppWallet: (name: string, pass: string) => Promise<boolean>;
  importAppWallet: (
    walletName: string,
    walletPass: string,
    address: string,
    mnemonic: string,
    privateKey: string
  ) => Promise<boolean>;
  deleteAppWallet: (address: string) => Promise<boolean>;
}

const AppWalletsContext = createContext<AppWalletsContextProps | undefined>(
  undefined
);

export const AppWalletsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const fetchingAppWallets = false;
  const appWallets: AppWallet[] = [];
  const appWalletsSupported = false;

  useEffect(() => {
    const initialize = async () => {
      return false;
    };

    initialize();
  }, []);

  const createAppWallet = useCallback(
    async (_name: string, _pass: string): Promise<boolean> => {
      return false;
    },
    []
  );

  const importAppWallet = useCallback(
    async (
      _walletName: string,
      _walletPass: string,
      _address: string,
      _mnemonic: string,
      _privateKey: string
    ): Promise<boolean> => {
      return false;
    },
    []
  );

  const deleteAppWallet = useCallback(
    async (_address: string): Promise<boolean> => {
      return false;
    },
    []
  );

  const value = useMemo(
    () => ({
      fetchingAppWallets,
      appWallets,
      appWalletsSupported,
      createAppWallet,
      importAppWallet,
      deleteAppWallet,
    }),
    [
      fetchingAppWallets,
      appWallets,
      appWalletsSupported,
      createAppWallet,
      importAppWallet,
      deleteAppWallet,
    ]
  );

  return (
    <AppWalletsContext.Provider value={value}>
      {children}
    </AppWalletsContext.Provider>
  );
};

export const useAppWallets = () => {
  const context = useContext(AppWalletsContext);
  if (!context) {
    throw new Error("useAppWallets must be used within an AppWalletsProvider");
  }
  return context;
};
