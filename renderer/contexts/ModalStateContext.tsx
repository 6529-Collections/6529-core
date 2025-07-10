"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface ModalStateContextType {
  addModal: (modalName: string) => void;
  removeModal: (modalName: string) => void;
  isTopModal: (modalName: string) => boolean;
}

const ModalStateContext = createContext<ModalStateContextType>({
  addModal: () => {},
  removeModal: () => {},
  isTopModal: () => false,
});

export const useModalState = () => useContext(ModalStateContext);

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

  return (
    <ModalStateContext.Provider value={{ isTopModal, addModal, removeModal }}>
      {children}
    </ModalStateContext.Provider>
  );
};
