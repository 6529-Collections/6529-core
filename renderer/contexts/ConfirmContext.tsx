import React, {
  createContext,
  useState,
  useContext,
  ReactNode,
  useMemo,
} from "react";
import Confirm from "../components/confirm/Confirm";

interface ConfirmContextProps {
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

const ConfirmContext = createContext<ConfirmContextProps | undefined>(
  undefined
);

export const ConfirmProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [onConfirmCallback, setOnConfirmCallback] = useState<() => void>(
    () => {}
  );

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void
  ) => {
    setTitle(title);
    setMessage(message);
    setOnConfirmCallback(() => onConfirm);
    setIsVisible(true);
  };

  const handleHide = () => {
    setIsVisible(false);
  };

  const handleConfirm = () => {
    if (onConfirmCallback) {
      onConfirmCallback();
    }
    setIsVisible(false);
  };

  const contextValue = useMemo(() => ({ showConfirm }), []);

  return (
    <ConfirmContext.Provider value={contextValue}>
      {children}
      <Confirm
        show={isVisible}
        onHide={handleHide}
        onConfirm={handleConfirm}
        title={title}
        message={message}
      />
    </ConfirmContext.Provider>
  );
};

export const useConfirm = (): ConfirmContextProps => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context;
};
