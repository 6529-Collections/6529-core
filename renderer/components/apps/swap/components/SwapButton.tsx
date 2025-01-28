import { useState, useEffect, useCallback, memo } from "react";
import { Loader2, Settings } from "lucide-react";
import styles from "../UniswapApp.module.scss";
import { RevokeModal } from "./RevokeModal";
import { TokenPair } from "../types";

interface SwapButtonProps {
  disabled: boolean;
  status: {
    status: "idle" | "confirming" | "success" | "error";
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
  onRevoke: () => Promise<void>;
  selectedPair: TokenPair;
}

export const SwapButton = memo(function SwapButton({
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
}: SwapButtonProps) {
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);

  // Add debug logs for status changes
  useEffect(() => {
    console.log("[SwapButton] Status update:", status);
  }, [status]);

  const hasEnoughEth = parseFloat(ethBalance) >= parseFloat(minRequiredBalance);

  // Update button text calculation
  const getButtonText = useCallback(() => {
    if (status.status === "success") return "Success!";
    if (status.status === "confirming") return "Confirming...";
    if (status.loading) return "Processing...";
    if (approvalStatus.loading) return "Approving...";
    if (status.status === "error") return "Try Again";
    if (!hasEnoughEth) return "Insufficient ETH for gas";
    if (!inputAmount || !outputAmount) return "Enter an amount";
    if (approvalStatus.required && !approvalStatus.approved) return "Approve";
    return "Swap";
  }, [status, approvalStatus, hasEnoughEth, inputAmount, outputAmount]);

  const isDisabled =
    disabled ||
    !hasEnoughEth ||
    status.loading ||
    approvalStatus.loading ||
    status.status === "confirming";

  // Add success state class
  const buttonClass = `${styles.actionButton} ${
    status.status === "success" ? styles.success : ""
  } ${status.loading || status.status === "confirming" ? styles.loading : ""}`;

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
        className={buttonClass}
        disabled={isDisabled}
        onClick={
          approvalStatus.required && !approvalStatus.approved
            ? onApprove
            : onSwap
        }
      >
        {getButtonText()}
      </button>
    </div>
  );
});
