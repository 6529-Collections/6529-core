"use client";

import {
  ReactElement,
  ReactNode,
  createContext,
  useContext,
  useMemo,
} from "react";
import { toast } from "react-toastify";
import { showAppToast } from "@/components/utils/toast/AppToast";

interface ToastContextType {
  showToast: (
    message: string,
    type?: "info" | "success" | "warning" | "error",
    singleton?: boolean
  ) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider = ({
  children,
}: ToastProviderProps): ReactElement => {
  const showToast = (
    message: string,
    type: "info" | "success" | "warning" | "error" = "info",
    singleton?: boolean
  ) => {
    if (!message) {
      return;
    }
    if (singleton) {
      toast.dismiss();
    }
    showAppToast({
      message,
      type,
      ...(singleton ? { toastId: `legacy-toast:${type}:${message}` } : {}),
    });
  };

  const contextValue = useMemo(() => ({ showToast }), []);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
    </ToastContext.Provider>
  );
};
