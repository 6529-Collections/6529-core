"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

interface ModalStateContextType {
  addModal: (modalName: string) => void;
  removeModal: (modalName: string) => void;
  isTopModal: (modalName: string) => boolean;
}

const ModalStateContext = createContext<ModalStateContextType | undefined>(
  undefined
);

export const ModalStateProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [openModals, setOpenModals] = useState<string[]>([]);

  const addModal = (modalName: string) => {
    setOpenModals((prev) => [...prev, modalName]);
  };

  const removeModal = (modalName: string) => {
    setOpenModals((prev) => prev.filter((name) => name !== modalName));
  };

  const isTopModal = (modalName: string) => {
    return openModals[openModals.length - 1] === modalName;
  };

  const value = useMemo(
    () => ({ isTopModal, addModal, removeModal }),
    [openModals]
  );

  return (
    <ModalStateContext.Provider value={value}>
      {children}
    </ModalStateContext.Provider>
  );
};

export const useModalState = (): ModalStateContextType => {
  const context = useContext(ModalStateContext);
  if (context === undefined) {
    throw new Error("useModalState must be used within a ModalStateProvider");
  }
  return context;
};
