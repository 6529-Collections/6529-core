"use client";

import { useSeizeConnectContext } from "@/components/auth/SeizeConnectContext";
import { getSeedWallet, getSeedWallets } from "@/electron";
import { areEqualAddresses } from "@/helpers/Helpers";
import { decryptData } from "@/shared/encrypt";
import { ISeedWallet, SeedWalletRequest } from "@/shared/types";
import { SEED_WALLET_CONNECTOR_TYPE } from "@/wagmiConfig/seedWalletConnector";
import { ethers } from "ethers";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAccount, useChainId, useConnect, useConnectors } from "wagmi";
import ConfirmSeedWalletLock from "../components/confirm/ConfirmSeedWalletLock";
import ConfirmSeedWalletRequest from "../components/confirm/ConfirmSeedWalletRequest";

// Earlier versions saved the unlock password in session storage, encrypted
// under the wallet's public address, so anything able to read session storage
// could recover it. It is no longer written; leftover values are removed.
const LEGACY_SEED_WALLET_PASSWORD_KEY = "seed-wallet-pass";

const hasSeedWalletBridge = (): boolean =>
  typeof window !== "undefined" && typeof window.api?.sendSync === "function";

interface SeedWalletContextType {
  isSeedWallet: boolean;
  isFetched: boolean;
  isUnlocked: boolean;
  handleRequest: (
    callback: (wallet: ethers.Wallet, request: SeedWalletRequest) => void,
    request: SeedWalletRequest
  ) => void;
  setShowPasswordModal: (show: boolean) => void;
  lockWallet: () => void;
  isSeedWalletModalOpen: boolean;
}

const SeedWalletContext = createContext<SeedWalletContextType | undefined>(
  undefined
);

export const SeedWalletProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const {
    address: activeAddress,
    connectionState,
    isAddingConnectedAccount,
    isDisconnecting,
    seizeConnectOpen,
  } = useSeizeConnectContext();
  const { connector: activeConnector } = useAccount();
  const chainId = useChainId();
  const connectors = useConnectors();
  const { connect } = useConnect();

  const [isFetched, setIsFetched] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);

  const [isSeedWallet, setIsSeedWallet] = useState<boolean>(false);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const connectedAddressRef = useRef<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);

  const [lockedWallet, setLockedWallet] = useState<ISeedWallet>();
  const [unlockedWallet, setUnlockedWallet] = useState<ethers.Wallet>();
  const lastConnectorSyncTargetRef = useRef<string | null>(null);
  const isDisconnectingRef = useRef(false);

  const [pendingCallback, setPendingCallback] = useState<{
    callback: (wallet: ethers.Wallet, request: SeedWalletRequest) => void;
    request: SeedWalletRequest;
  }>();
  isDisconnectingRef.current = isDisconnecting;

  const handleRequest = (
    callback: (wallet: ethers.Wallet, request: SeedWalletRequest) => void,
    request: SeedWalletRequest
  ) => {
    if (isDisconnectingRef.current) {
      window.seedConnector?.reject(request);
      return;
    }

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
      const handleSuccess = (decryptedPrivateKey: string) => {
        setUnlockedWallet(new ethers.Wallet(decryptedPrivateKey));
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
  }, []);

  useEffect(() => {
    connectedAddressRef.current = connectedAddress;
  }, [connectedAddress]);

  useEffect(() => {
    if (!isDisconnecting) {
      return;
    }

    setShowPasswordModal(false);
    setShowRequestModal(false);
    if (pendingCallback) {
      window.seedConnector?.reject(pendingCallback.request);
      setPendingCallback(undefined);
    }
  }, [isDisconnecting, pendingCallback]);

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
    try {
      sessionStorage.removeItem(LEGACY_SEED_WALLET_PASSWORD_KEY);
    } catch (e) {
      console.error("Error removing a saved wallet password", e);
    }
  }, []);

  useEffect(() => {
    if (lockedWallet) {
      setIsFetched(true);
    }
  }, [lockedWallet]);

  useEffect(() => {
    let cancelled = false;

    const reset = () => {
      lockWallet();
      setConnectedAddress(null);
      setLockedWallet(undefined);
      setIsSeedWallet(false);
      setIsFetched(true);
    };

    if (!activeAddress) {
      if (connectionState !== "initializing") {
        reset();
      }
      return;
    }

    if (!hasSeedWalletBridge()) {
      reset();
      return;
    }

    getSeedWallet(activeAddress)
      .then(async (response) => {
        if (cancelled) {
          return;
        }

        let seedWallet =
          response && !response.error && response.data ? response.data : null;

        if (!seedWallet) {
          const allSeedWalletsResponse = await getSeedWallets();
          if (cancelled) {
            return;
          }
          seedWallet =
            allSeedWalletsResponse &&
            !allSeedWalletsResponse.error &&
            Array.isArray(allSeedWalletsResponse.data)
              ? (allSeedWalletsResponse.data.find((wallet) =>
                  areEqualAddresses(wallet.address, activeAddress)
                ) ?? null)
              : null;
        }

        if (!seedWallet) {
          reset();
          return;
        }

        if (
          !areEqualAddresses(connectedAddressRef.current, seedWallet.address)
        ) {
          lockWallet(false);
          setIsFetched(false);
          setConnectedAddress(seedWallet.address);
        }

        setIsSeedWallet(true);
        setLockedWallet((previousWallet) => {
          if (
            previousWallet &&
            areEqualAddresses(previousWallet.address, seedWallet.address)
          ) {
            return previousWallet;
          }
          return seedWallet;
        });
      })
      .catch((e) => {
        if (cancelled) {
          return;
        }
        console.error("Error fetching seed wallet", e);
        reset();
      });

    return () => {
      cancelled = true;
    };
  }, [activeAddress, connectionState, lockWallet]);

  useEffect(() => {
    if (
      !isSeedWallet ||
      !activeAddress ||
      seizeConnectOpen ||
      isAddingConnectedAccount ||
      isDisconnecting
    ) {
      lastConnectorSyncTargetRef.current = null;
      return;
    }

    const seedWalletConnector = connectors.find(
      (connector) =>
        connector.type === SEED_WALLET_CONNECTOR_TYPE &&
        areEqualAddresses(connector.id, activeAddress)
    );

    if (!seedWalletConnector) {
      lastConnectorSyncTargetRef.current = null;
      return;
    }

    if (activeConnector?.uid === seedWalletConnector.uid) {
      lastConnectorSyncTargetRef.current = null;
      return;
    }

    const syncTarget = `${seedWalletConnector.uid}:${chainId}`;
    if (lastConnectorSyncTargetRef.current === syncTarget) {
      return;
    }
    lastConnectorSyncTargetRef.current = syncTarget;

    connect({
      connector: seedWalletConnector,
      chainId,
    });
  }, [
    activeAddress,
    activeConnector?.uid,
    chainId,
    connect,
    connectors,
    isAddingConnectedAccount,
    isDisconnecting,
    isSeedWallet,
    seizeConnectOpen,
  ]);

  const isSeedWalletModalOpen =
    showPasswordModal || showRequestModal || !!pendingCallback;

  const value = {
    isSeedWallet,
    isFetched,
    isUnlocked,
    handleRequest,
    setShowPasswordModal,
    lockWallet,
    isSeedWalletModalOpen,
  };

  return (
    <SeedWalletContext.Provider value={value}>
      {lockedWallet && (
        <ConfirmSeedWalletLock
          name={lockedWallet.name}
          address={lockedWallet.address}
          show={showPasswordModal && !isDisconnecting}
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
      <ConfirmSeedWalletRequest
        onShowChange={setShowRequestModal}
        suppress={isDisconnecting}
      />
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
