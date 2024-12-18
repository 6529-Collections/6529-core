import { Loader2 } from "lucide-react";
import styles from "../UniswapApp.module.scss";

interface SwapButtonProps {
  disabled: boolean;
  status: {
    stage: "idle" | "approving" | "swapping" | "confirming";
    loading: boolean;
    error: string | null;
  };
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  inputAmount: string;
  outputAmount: string;
}

export function SwapButton({
  disabled,
  status,
  onClick,
  inputAmount,
  outputAmount,
}: SwapButtonProps) {
  const getButtonText = () => {
    if (status.loading) {
      switch (status.stage) {
        case "approving":
          return "Approving...";
        case "swapping":
          return "Swapping...";
        case "confirming":
          return "Confirming...";
        default:
          return "Loading...";
      }
    }

    if (status.error) return "Try Again";
    if (!inputAmount || !outputAmount) return "Enter an amount";
    return "Swap";
  };

  return (
    <button
      type="button"
      className={`${styles.actionButton} ${
        status.loading ? styles.loading : ""
      } ${status.error ? styles.error : ""}`}
      disabled={disabled || status.loading}
      onClick={onClick}
    >
      <span className="d-flex align-items-center justify-content-center gap-2">
        {status.loading && <Loader2 className="animate-spin" size={20} />}
        {getButtonText()}
      </span>
    </button>
  );
}
