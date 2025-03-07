import { useState } from "react";
import { Loader2, Settings } from "lucide-react";
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
  hasEnoughTokenBalance?: boolean;
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
  hasEnoughTokenBalance = true,
}: SwapButtonProps) {
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);

  const hasEnoughEth = parseFloat(ethBalance) >= parseFloat(minRequiredBalance);

  const getButtonText = () => {
    if (!inputAmount || !outputAmount) return "Enter an amount";

    if (!hasEnoughTokenBalance) {
      return `Insufficient ${selectedPair.inputToken.symbol} balance`;
    }

    if (!hasEnoughEth) {
      return "Insufficient ETH for gas";
    }

    if (status.error) return "Try Again";

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
    !hasEnoughTokenBalance ||
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

  // Determine button class based on status
  const getButtonClass = () => {
    if (!hasEnoughTokenBalance && inputAmount && outputAmount) {
      return "tw-bg-gradient-to-r tw-from-[#e53935] tw-to-[#f44336] tw-opacity-60";
    }

    if (status.stage === "success") {
      return "tw-bg-gradient-to-r tw-from-[#43a047] tw-to-[#66bb6a] hover:tw-from-[#388e3c] hover:tw-to-[#43a047]";
    }

    if (status.error) {
      return "tw-bg-gradient-to-r tw-from-[#e53935] tw-to-[#f44336] hover:tw-from-[#d32f2f] hover:tw-to-[#e53935]";
    }

    if (status.loading) {
      return "tw-bg-gradient-to-r tw-from-[#546e7a] tw-to-[#78909c] tw-cursor-wait";
    }

    return "tw-bg-gradient-to-r tw-from-[#2ecc71] tw-to-[#27ae60] hover:tw-from-[#27ae60] hover:tw-to-[#219653]";
  };

  return (
    <div className="tw-relative tw-w-full">
      <button
        className={`tw-w-full tw-py-4 tw-px-6 tw-text-lg tw-font-semibold tw-rounded-xl tw-mb-4 tw-border-none tw-transition-all tw-duration-300 tw-text-white tw-relative tw-shadow-md ${getButtonClass()} ${
          isDisabled
            ? "tw-opacity-60 tw-cursor-not-allowed"
            : "hover:tw-transform hover:tw--translate-y-0.5 hover:tw-shadow-xl active:tw-transform active:tw-translate-y-0 active:tw-shadow-md"
        }`}
        disabled={isDisabled}
        onClick={handleClick}
        style={{
          boxShadow: "0 4px 14px 0 rgba(0, 0, 0, 0.2)",
        }}
      >
        <div className="tw-flex tw-items-center tw-justify-center tw-gap-2">
          {status.loading ? (
            <div className="tw-flex tw-items-center tw-gap-2">
              <div className="tw-w-5 tw-h-5 tw-border-2 tw-border-white/30 tw-border-t-white tw-rounded-full tw-animate-spin"></div>
              <span>{getButtonText()}</span>
            </div>
          ) : (
            <span>{getButtonText()}</span>
          )}
        </div>
      </button>

      {status.error && (
        <div className="tw-bg-red-500/10 tw-border tw-border-red-500/20 tw-rounded-xl tw-p-3 tw-mb-3 tw-text-red-400 tw-flex tw-flex-col tw-items-start tw-gap-1 tw-w-full">
          <div className="tw-flex tw-items-center tw-gap-2">
            <span className="tw-text-lg">❌</span>
            <span>{status.error}</span>
          </div>
          <Button
            variant="link"
            onClick={onClear}
            className="tw-self-end tw-py-1 tw-px-2 tw-text-sm tw-text-red-400 hover:tw-text-red-300"
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
