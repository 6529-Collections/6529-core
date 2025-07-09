"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import HeaderUserConnectModal from "../components/header/user/HeaderUserConnectModal";

interface SeizeConnectModalContextType {
  showConnectModal: boolean;
  setShowConnectModal: (show: boolean) => void;
}

const SeizeConnectModalContext = createContext<SeizeConnectModalContextType>({
  showConnectModal: false,
  setShowConnectModal: () => {},
});

export const useSeizeConnectModal = () => useContext(SeizeConnectModalContext);

export const SeizeConnectModalProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [showConnectModal, setShowConnectModal] = useState(false);

  return (
    <SeizeConnectModalContext.Provider
      value={{
        showConnectModal,
        setShowConnectModal,
      }}>
      {children}
      <HeaderUserConnectModal
        show={showConnectModal}
        onHide={() => setShowConnectModal(false)}
      />
    </SeizeConnectModalContext.Provider>
  );
};
