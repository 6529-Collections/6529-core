import { Loader2 } from "lucide-react";
import styles from "../UniswapApp.module.scss";

interface SwapButtonProps {
  disabled: boolean;
  loading: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  error?: string | null;
  inputAmount: string;
  outputAmount: string;
}

export function SwapButton({
  disabled,
  loading,
  onClick,
  error,
  inputAmount,
  outputAmount,
}: SwapButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.actionButton} ${loading ? styles.loading : ""} ${
        error ? styles.error : ""
      }`}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? (
        <span className="d-flex align-items-center justify-content-center gap-2">
          <Loader2 className="animate-spin" size={20} />
          Swapping...
        </span>
      ) : error ? (
        "Try Again"
      ) : !inputAmount || !outputAmount ? (
        "Enter an amount"
      ) : (
        "Swap"
      )}
    </button>
  );
}
