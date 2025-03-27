import { useState, useEffect } from "react";
import { TokenPair, SwapStatus } from "../types";
import { formatErrorMessage } from "../utils/errorFormatting";

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
  revocationSuccessful?: boolean;
  onRevocationClose?: () => void;
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
  selectedPair,
  onClear,
  hasEnoughTokenBalance = true,
}: SwapButtonProps) {
  const [wasApproving, setWasApproving] = useState(false);

  useEffect(() => {
    setWasApproving(false);
  }, [inputAmount, outputAmount]);

  useEffect(() => {
    if (approvalStatus.loading) {
      setWasApproving(true);
    } else if (wasApproving) {
      setWasApproving(false);
    }
  }, [approvalStatus.loading, wasApproving]);

  const hasEnoughEth = parseFloat(ethBalance) >= parseFloat(minRequiredBalance);

  const getButtonText = () => {
    if (!inputAmount || !outputAmount) return "Enter an amount";
    if (!hasEnoughTokenBalance)
      return `Insufficient ${selectedPair.inputToken.symbol} balance`;
    if (!hasEnoughEth) return "Insufficient ETH for gas";
    if (status.error || approvalStatus.error) return "Try Again";

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
    if (status.error || approvalStatus.error) {
      onClear();
      return;
    }

    if (approvalStatus.required && !approvalStatus.approved) {
      onApprove();
    } else {
      onSwap();
    }
  };

  const getButtonClass = () => {
    if (!hasEnoughTokenBalance && inputAmount && outputAmount) {
      return "tw-bg-gradient-to-r tw-from-[#e53935] tw-to-[#f44336] tw-opacity-60";
    }

    if (status.stage === "success") {
      return "tw-bg-gradient-to-r tw-from-[#43a047] tw-to-[#66bb6a] hover:tw-from-[#388e3c] hover:tw-to-[#43a047]";
    }

    if (status.error || approvalStatus.error) {
      return "tw-bg-gradient-to-r tw-from-[#e53935] tw-to-[#f44336] hover:tw-from-[#d32f2f] hover:tw-to-[#e53935]";
    }

    if (status.loading || approvalStatus.loading) {
      return "tw-bg-gradient-to-r tw-from-[#546e7a] tw-to-[#78909c] tw-cursor-wait";
    }

    if (approvalStatus.required && !approvalStatus.approved) {
      return "tw-bg-gradient-to-r tw-from-[#3498db] tw-to-[#2980b9] hover:tw-from-[#2980b9] hover:tw-to-[#2573a7]";
    }

    return "tw-bg-gradient-to-r tw-from-[#2ecc71] tw-to-[#27ae60] hover:tw-from-[#27ae60] hover:tw-to-[#219653]";
  };

  return (
    <div className="tw-relative tw-w-full">
      <>
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
          <div className="tw-relative tw-flex tw-items-center tw-justify-center tw-w-full">
            {status.loading || approvalStatus.loading ? (
              <div className="tw-flex tw-flex-col tw-items-center tw-w-full">
                <span className="tw-animate-pulse">{getButtonText()}</span>
              </div>
            ) : (
              <span>{getButtonText()}</span>
            )}
          </div>
        </button>

        {(status.error || approvalStatus.error) && (
          <div className="tw-bg-red-500/10 tw-border tw-border-red-500/20 tw-rounded-xl tw-p-3 tw-mb-3 tw-flex tw-gap-2 tw-items-center tw-relative tw-z-1">
            <div className="tw-text-lg tw-leading-none tw-text-red-400 tw-flex-shrink-0">
              ❌
            </div>
            <div className="tw-flex-1 tw-min-w-0">
              <div className="tw-text-red-400 tw-font-medium tw-text-sm">
                {(status.error &&
                  status.error.toLowerCase().includes("cancel")) ||
                (approvalStatus.error &&
                  approvalStatus.error.toLowerCase().includes("cancel"))
                  ? "Transaction Cancelled"
                  : "Transaction Failed"}
              </div>
              <div className="tw-text-white/70 tw-text-xs tw-truncate">
                {formatErrorMessage(status.error || approvalStatus.error || "")}
              </div>
            </div>
            <button
              onClick={onClear}
              className="tw-text-white/60 tw-text-xs tw-font-medium tw-bg-white/5 tw-px-2 tw-py-1 tw-rounded-md hover:tw-bg-white/10 tw-transition-colors tw-flex-shrink-0"
            >
              Clear
            </button>
          </div>
        )}
      </>
    </div>
  );
}
