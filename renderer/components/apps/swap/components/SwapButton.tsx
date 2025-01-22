import { Loader2 } from "lucide-react";
import styles from "../UniswapApp.module.scss";

interface SwapButtonProps {
  disabled: boolean;
  status: {
    stage:
      | "idle"
      | "approving"
      | "swapping"
      | "confirming"
      | "success"
      | "pending"
      | "complete";
    loading: boolean;
    error: string | null;
    hash?: `0x${string}`;
  };
  approvalStatus: {
    required: boolean;
    approved: boolean;
    loading: boolean;
    error: string | null;
  };
  onApprove: () => void;
  onSwap: () => void;
  inputAmount: string;
  outputAmount: string;
  ethBalance: string;
  minRequiredBalance?: string;
}

export function SwapButton({
  disabled,
  status,
  approvalStatus,
  onApprove,
  onSwap,
  inputAmount,
  outputAmount,
  ethBalance,
  minRequiredBalance = "0.001",
}: SwapButtonProps) {
  const hasEnoughEth = parseFloat(ethBalance) >= parseFloat(minRequiredBalance);

  const getButtonText = () => {
    if (!hasEnoughEth) {
      return "Insufficient ETH for gas";
    }
    if (status.error) return "Try Again";
    if (!inputAmount || !outputAmount) return "Enter an amount";
    if (approvalStatus.required && !approvalStatus.approved) {
      return approvalStatus.loading ? "Approving..." : "Approve";
    }

    switch (status.stage) {
      case "approving":
        return "Approving...";
      case "swapping":
        return "Swapping...";
      case "confirming":
        return "Confirming...";
      case "pending":
        return "Pending...";
      case "success":
        return "Success";
      case "complete":
        return "Swap Complete";
      default:
        return "Swap";
    }
  };

  const isDisabled =
    disabled ||
    !hasEnoughEth ||
    status.loading ||
    approvalStatus.loading ||
    status.stage === "complete" ||
    (!approvalStatus.approved && status.stage !== "idle");

  const handleClick = () => {
    if (approvalStatus.required && !approvalStatus.approved) {
      onApprove();
    } else {
      onSwap();
    }
  };

  return (
    <button
      className={`btn btn-primary w-100 ${
        status.loading || approvalStatus.loading ? "loading" : ""
      }`}
      disabled={isDisabled}
      onClick={handleClick}
    >
      {getButtonText()}
    </button>
  );
}
