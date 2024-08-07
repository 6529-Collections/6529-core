import { createContext, useContext, ReactNode, useMemo } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

interface ToastContextType {
  showToast: (
    message: string,
    type?: "info" | "success" | "warning" | "error"
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
}: ToastProviderProps): JSX.Element => {
  const showToast = (
    message: string,
    type: "info" | "success" | "warning" | "error" = "info"
  ) => {
    toast(message, { type });
  };

  const contextValue = useMemo(() => ({ showToast }), []);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer theme="dark" />
    </ToastContext.Provider>
  );
};
