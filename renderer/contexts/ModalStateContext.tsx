"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

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

  const addModal = useCallback((modalName: string) => {
    setOpenModals((prev) => [...prev, modalName]);
  }, []);

  const removeModal = useCallback((modalName: string) => {
    setOpenModals((prev) => prev.filter((name) => name !== modalName));
  }, []);

  const isTopModal = useCallback(
    (modalName: string) => openModals[openModals.length - 1] === modalName,
    [openModals]
  );

  const value = useMemo(
    () => ({ isTopModal, addModal, removeModal }),
    [isTopModal, addModal, removeModal]
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
