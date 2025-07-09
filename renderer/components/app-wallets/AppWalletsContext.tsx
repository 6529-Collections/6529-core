"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ethers } from "ethers";
import { encryptData } from "./app-wallet-helpers";
import { Time } from "../../helpers/time";
import useCapacitor from "../../hooks/useCapacitor";
import EventEmitter from "events";

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

export const appWalletsEventEmitter = new EventEmitter();

const WALLET_KEY_PREFIX = "app-wallet_";

export const AppWalletsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [fetchingAppWallets, setFetchingAppWallets] = useState(true);
  const [appWallets, setAppWallets] = useState<AppWallet[]>([]);
  const [appWalletsSupported, setAppWalletsSupported] = useState(false);

  const capacitor = useCapacitor();

  const checkUnsupported = async () => {
    setAppWalletsSupported(false);
  };

  const fetchAppWallets = async () => {
    setFetchingAppWallets(false);
    setAppWallets([]);
  };

  useEffect(() => {
    const initialize = async () => {
      await checkUnsupported();
      if (appWalletsSupported) {
        await fetchAppWallets();
      }
    };

    initialize();
  }, [appWalletsSupported]);

  const createAppWallet = async (
    name: string,
    pass: string
  ): Promise<boolean> => {
    return false;
  };

  const importAppWallet = async (
    walletName: string,
    walletPass: string,
    address: string,
    mnemonic: string,
    privateKey: string
  ): Promise<boolean> => {
    return false;
  };

  const deleteAppWallet = async (address: string): Promise<boolean> => {
    return false;
  };

  const value = useMemo(
    () => ({
      fetchingAppWallets,
      appWallets,
      appWalletsSupported,
      createAppWallet,
      importAppWallet,
      deleteAppWallet,
    }),
    [fetchingAppWallets, appWallets, appWalletsSupported]
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
