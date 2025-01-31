import { useState } from "react";
import { Loader2, Settings } from "lucide-react";
import styles from "../UniswapApp.module.scss";
import { RevokeModal } from "./RevokeModal";
import { TokenPair, SwapStatus } from "../types";
import { Button } from "react-bootstrap";

interface SwapButtonProps {
  disabled: boolean;
  status: SwapStatus;
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
  onRevoke: () => Promise<void>;
  selectedPair: TokenPair;
  onClear: () => void;
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
  onRevoke,
  selectedPair,
  onClear,
}: SwapButtonProps) {
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);

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

  const handleRevoke = async () => {
    setRevokeLoading(true);
    try {
      await onRevoke();
      setShowRevokeModal(false);
    } finally {
      setRevokeLoading(false);
    }
  };

  return (
    <div className={styles.buttonContainer}>
      <button
        className={`btn btn-primary w-100 
          ${status.loading ? "loading" : ""}`}
        disabled={isDisabled}
        onClick={handleClick}
      >
        {getButtonText()}
      </button>
      {status.error && (
        <div className={styles.errorMessage}>
          ❌ {status.error}
          <Button
            variant="link"
            onClick={onClear}
            className={styles.clearError}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
