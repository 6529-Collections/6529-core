import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAccount, useConnections, useDisconnect } from "wagmi";
import {
  getWalletAddress,
  getWalletType,
  removeAuthJwt,
} from "../../services/auth/auth.utils";
import { useSeizeConnectModal } from "../../contexts/SeizeConnectModalContext";

interface SeizeConnectContextType {
  address: string | null;
  walletType: string | null;
  seizeConnect: () => void;
  seizeConnectAppWallet: () => void;
  seizeDisconnect: () => void;
  seizeDisconnectAndLogout: (reconnect?: boolean) => void;
  seizeAcceptConnection: (address: string) => void;
  seizeConnectOpen: boolean;
  isConnected: boolean;
  isAuthenticated: boolean;
}

const SeizeConnectContext = createContext<SeizeConnectContextType | undefined>(
  undefined
);

export const SeizeConnectProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const connections = useConnections().flat();
  const { disconnect } = useDisconnect();

  const { showConnectModal, setShowConnectModal } = useSeizeConnectModal();

  const [showAppWalletModal, setShowAppWalletModal] = useState(false);

  const walletType = "core";

  const account = useAccount();
  const [connectedAddress, setConnectedAddress] = useState<string | null>(
    account.address ?? getWalletAddress()
  );

  useEffect(() => {
    setConnectedAddress(account.address ?? getWalletAddress());
  }, [account.address]);

  const seizeDisconnect = useCallback(() => {
    for (const connection of connections) {
      disconnect({
        connector: connection.connector,
      });
    }
  }, [connections, disconnect]);

  const seizeDisconnectAndLogout = useCallback(
    async (reconnect?: boolean) => {
      for (const connection of connections) {
        disconnect({
          connector: connection.connector,
        });
      }
      removeAuthJwt();
      setConnectedAddress(null);

      if (reconnect) {
        setShowConnectModal(true);
      }
    },
    [connections, disconnect, setShowConnectModal]
  );

  const seizeAcceptConnection = (address: string) => {
    setConnectedAddress(address);
  };

  const contextValue = useMemo(() => {
    return {
      address: connectedAddress,
      walletType,
      seizeConnect: () => setShowConnectModal(true),
      seizeConnectAppWallet: () => setShowAppWalletModal(true),
      seizeDisconnect,
      seizeDisconnectAndLogout,
      seizeAcceptConnection,
      seizeConnectOpen: showConnectModal,
      isConnected: account.isConnected,
      isAuthenticated: !!connectedAddress,
    };
  }, [
    connectedAddress,
    setShowConnectModal,
    seizeDisconnect,
    seizeDisconnectAndLogout,
    seizeAcceptConnection,
    open,
    account.isConnected,
  ]);

  return (
    <SeizeConnectContext.Provider value={contextValue}>
      {children}
    </SeizeConnectContext.Provider>
  );
};

export const useSeizeConnectContext = (): SeizeConnectContextType => {
  const context = useContext(SeizeConnectContext);
  if (!context) {
    throw new Error(
      "useSeizeConnectContext must be used within a SeizeConnectProvider"
    );
  }
  return context;
};
