"use client";

import { getSeedWallet } from "@/electron";
import { areEqualAddresses } from "@/helpers/Helpers";
import { decryptData, encryptData } from "@/shared/encrypt";
import { ISeedWallet, SeedWalletRequest } from "@/shared/types";
import { ethers } from "ethers";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useConnections } from "wagmi";
import ConfirmSeedWalletLock from "../components/confirm/ConfirmSeedWalletLock";
import ConfirmSeedWalletRequest from "../components/confirm/ConfirmSeedWalletRequest";

export const SEED_WALLET_KEY = "seed-wallet-pass";

interface SeedWalletContextType {
  isSeedWallet: boolean;
  isFetched: boolean;
  isUnlocked: boolean;
  handleRequest: (
    callback: (wallet: ethers.Wallet, request: SeedWalletRequest) => void,
    request: SeedWalletRequest
  ) => void;
  setShowPasswordModal: (show: boolean) => void;
}

const SeedWalletContext = createContext<SeedWalletContextType | undefined>(
  undefined
);

export const SeedWalletProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const connections = useConnections();

  const [isFetched, setIsFetched] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [isSeedWallet, setIsSeedWallet] = useState<boolean>(false);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);

  const [lockedWallet, setLockedWallet] = useState<ISeedWallet>();
  const [unlockedWallet, setUnlockedWallet] = useState<ethers.Wallet>();

  const [pendingCallback, setPendingCallback] = useState<{
    callback: (wallet: ethers.Wallet, request: SeedWalletRequest) => void;
    request: SeedWalletRequest;
  }>();

  const handleRequest = (
    callback: (wallet: ethers.Wallet, request: SeedWalletRequest) => void,
    request: SeedWalletRequest
  ) => {
    if (isFetched && unlockedWallet) {
      callback(unlockedWallet, request);
    } else {
      setPendingCallback(() => {
        return { callback, request };
      });
    }
  };

  const unlockWallet = useCallback(
    async (wallet: ISeedWallet, password: string): Promise<boolean> => {
      const handleSuccess = async (decryptedPrivateKey: string) => {
        const wallet = new ethers.Wallet(decryptedPrivateKey);
        const encryptedPass = await encryptData(
          wallet.address,
          password,
          wallet.address
        );
        sessionStorage.setItem(SEED_WALLET_KEY, encryptedPass);
        setUnlockedWallet(wallet);
        return true;
      };
      const handleError = (e: string) => {
        console.log("Failed to unlock wallet", e);
        lockWallet(false);
        setIsFetched(true);
        return false;
      };
      return decryptData(wallet.address, wallet.address_hashed, password)
        .then(async (decryptedAddress) => {
          if (areEqualAddresses(connectedAddress, decryptedAddress)) {
            return decryptData(wallet.address, wallet.private_key, password)
              .then(async (decryptedPrivateKey) => {
                return handleSuccess(decryptedPrivateKey);
              })
              .catch((e) => handleError(e.message));
          } else {
            return handleError("Address does not match");
          }
        })
        .catch((e) => handleError(e.message));
    },
    [connectedAddress]
  );

  const lockWallet = useCallback((clearCallback: boolean = true) => {
    setUnlockedWallet(undefined);
    setIsUnlocked(false);
    if (clearCallback) {
      setPendingCallback(undefined);
    }
    sessionStorage.removeItem(SEED_WALLET_KEY);
  }, []);

  useEffect(() => {
    const handleDisconnect = () => {
      lockWallet();
    };

    window.seedConnector?.onDisconnect(handleDisconnect);

    return () => {
      window.seedConnector?.offDisconnect(handleDisconnect);
    };
  }, []);

  useEffect(() => {
    if (unlockedWallet) {
      setIsUnlocked(true);
      setIsFetched(true);
    }
  }, [unlockedWallet]);

  useEffect(() => {
    if (isFetched && pendingCallback) {
      if (unlockedWallet) {
        pendingCallback.callback(unlockedWallet, pendingCallback.request);
        setPendingCallback(undefined);
      } else {
        setShowPasswordModal(true);
      }
    }
  }, [isFetched, unlockedWallet, pendingCallback]);

  useEffect(() => {
    if (lockedWallet) {
      const storedEncryptedPassword = sessionStorage.getItem(SEED_WALLET_KEY);
      if (storedEncryptedPassword) {
        decryptData(
          lockedWallet.address,
          storedEncryptedPassword,
          lockedWallet.address
        )
          .then((storedPassword) => {
            unlockWallet(lockedWallet, storedPassword);
          })
          .catch((e) => {
            console.error("Error decrypting stored password", e);
            setIsFetched(true);
          });
      } else {
        setIsFetched(true);
      }
    }
  }, [lockedWallet]);

  useEffect(() => {
    if (!connectedAddress) {
      return;
    }

    getSeedWallet(connectedAddress)
      .then((data) => {
        setLockedWallet(data.data);
      })
      .catch((e) => {
        console.error("Error fetching seed wallet", e);
        setIsFetched(true);
      });
  }, [connectedAddress]);

  useEffect(() => {
    const reset = () => {
      lockWallet();
      setConnectedAddress(null);
      setLockedWallet(undefined);
      setIsSeedWallet(false);
      setIsFetched(true);
    };

    if (!connections || connections.length === 0) {
      reset();
      return;
    }

    if (connections[0]?.connector.type === "seed-wallet") {
      setConnectedAddress(connections[0].accounts[0]);
      setIsSeedWallet(true);
    } else {
      reset();
    }
  }, [connections]);

  const value = {
    isSeedWallet,
    isFetched,
    isUnlocked,
    handleRequest,
    setShowPasswordModal,
  };

  return (
    <SeedWalletContext.Provider value={value}>
      {lockedWallet && (
        <ConfirmSeedWalletLock
          name={lockedWallet.name}
          address={lockedWallet.address}
          show={showPasswordModal}
          unlockedWallet={unlockedWallet}
          pendingRequest={pendingCallback?.request}
          onHide={() => {
            setShowPasswordModal(false);
            if (pendingCallback) {
              if (unlockedWallet) {
                pendingCallback.callback(
                  unlockedWallet,
                  pendingCallback.request
                );
              } else {
                window.seedConnector.reject(pendingCallback.request);
              }
              setPendingCallback(undefined);
            }
          }}
          onUnlock={async (password) => {
            const success = await unlockWallet(lockedWallet, password);
            if (success) {
              setShowPasswordModal(false);
            }
            return success;
          }}
          onLock={lockWallet}
        />
      )}
      <ConfirmSeedWalletRequest />
      {children}
    </SeedWalletContext.Provider>
  );
};

export const useSeedWallet = () => {
  const context = useContext(SeedWalletContext);
  if (!context) {
    throw new Error("useSeedWallet must be used within a SeedWalletProvider");
  }
  return context;
};
