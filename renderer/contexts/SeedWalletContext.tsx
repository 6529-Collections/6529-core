"use client";

import { useSeizeConnectContext } from "@/components/auth/SeizeConnectContext";
import { getSeedWallet, getSeedWallets } from "@/electron";
import { areEqualAddresses } from "@/helpers/Helpers";
import { ISeedWallet, SeedWalletRequest } from "@/shared/types";
import { SEED_WALLET_CONNECTOR_TYPE } from "@/wagmiConfig/seedWalletConnector";
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
    callback: (request: SeedWalletRequest) => void,
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
  const [lockedWallet, setLockedWallet] = useState<ISeedWallet>();
  const [unlockedAddress, setUnlockedAddress] = useState<string>();
  const isUnlocked = areEqualAddresses(unlockedAddress, activeAddress);
  const unlockRevisionRef = useRef(0);
  const lastConnectorSyncTargetRef = useRef<string | null>(null);
  const isDisconnectingRef = useRef(false);

  const [pendingCallback, setPendingCallback] = useState<{
    callback: (request: SeedWalletRequest) => void;
    request: SeedWalletRequest;
  }>();
  isDisconnectingRef.current = isDisconnecting;

  const handleRequest = (
    callback: (request: SeedWalletRequest) => void,
    request: SeedWalletRequest
  ) => {
    if (isDisconnectingRef.current) {
      window.seedConnector?.reject(request.requestId);
      return;
    }

    if (isFetched && areEqualAddresses(unlockedAddress, request.from)) {
      callback(request);
    } else {
      setPendingCallback(() => {
        return { callback, request };
      });
    }
  };

  const lockWallet = useCallback((clearCallback: boolean = true) => {
    unlockRevisionRef.current++;
    void window.walletPasswords?.lock().catch(() => {});
    setUnlockedAddress(undefined);
    if (clearCallback) setPendingCallback(undefined);
  }, []);

  useEffect(() => {
    connectedAddressRef.current = connectedAddress;
  }, [connectedAddress]);

  useEffect(() => {
    if (!isDisconnecting) {
      return;
    }

    lockWallet();
    setShowPasswordModal(false);
    setShowRequestModal(false);
    if (pendingCallback) {
      window.seedConnector?.reject(pendingCallback.request.requestId);
      setPendingCallback(undefined);
    }
  }, [isDisconnecting, lockWallet, pendingCallback]);

  useEffect(() => {
    return window.seedConnector?.onDisconnect(() => {
      unlockRevisionRef.current++;
      setUnlockedAddress(undefined);
      setPendingCallback(undefined);
    });
  }, []);

  useEffect(() => {
    return window.seedConnector?.onWalletInvalidated((address) => {
      if (areEqualAddresses(address, connectedAddressRef.current)) {
        unlockRevisionRef.current++;
        setUnlockedAddress(undefined);
      }
    });
  }, []);

  useEffect(() => {
    return window.seedConnector?.onSettled((requestId) => {
      setPendingCallback((pending) =>
        pending?.request.requestId === requestId ? undefined : pending
      );
    });
  }, []);

  useEffect(() => {
    if (isFetched && pendingCallback && areEqualAddresses(unlockedAddress, pendingCallback.request.from)) {
      pendingCallback.callback(pendingCallback.request);
      setPendingCallback(undefined);
    }
  }, [isFetched, unlockedAddress, pendingCallback]);

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
          if (connectedAddressRef.current) lockWallet(false);
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
  const pendingNeedsUnlock = !isUnlocked &&
    areEqualAddresses(connectedAddress, pendingCallback?.request.from);

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
          show={(showPasswordModal || pendingNeedsUnlock) && !isDisconnecting}
          isUnlocked={isUnlocked}
          pendingRequest={pendingCallback?.request}
          onHide={() => {
            setShowPasswordModal(false);
            if (pendingCallback) {
              window.seedConnector.reject(pendingCallback.request.requestId);
              setPendingCallback(undefined);
            }
          }}
          onUnlock={async (password) => {
            const revision = ++unlockRevisionRef.current;
            const address = lockedWallet.address;
            const result = await window.walletPasswords?.unlock(address, password);
            if (!result?.ok || revision !== unlockRevisionRef.current) return false;
            setUnlockedAddress(address);
            setShowPasswordModal(false);
            return true;
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
