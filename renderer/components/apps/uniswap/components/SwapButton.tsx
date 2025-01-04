import { Loader2 } from "lucide-react";
import styles from "../UniswapApp.module.scss";

interface SwapButtonProps {
  disabled: boolean;
  status: {
    stage: "idle" | "approving" | "swapping" | "confirming" | "success";
    loading: boolean;
    error: string | null;
    hash?: `0x${string}`;
  };
  onClick: () => void;
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
    if (status.error) return "Try Again";
    if (!inputAmount || !outputAmount) return "Enter an amount";

    switch (status.stage) {
      case "approving":
        return "Approving...";
      case "swapping":
        return "Swapping...";
      case "confirming":
        return "Confirming...";
      case "success":
        return "Swap Complete";
      default:
        return "Swap";
    }
  };

  return (
    <button
      className={`btn btn-primary w-100 ${status.loading ? "loading" : ""}`}
      disabled={disabled || status.loading}
      onClick={onClick}
    >
      {getButtonText()}
    </button>
  );
}
