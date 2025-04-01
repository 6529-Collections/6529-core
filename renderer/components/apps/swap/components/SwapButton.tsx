import { useState, useEffect } from "react";
import { TokenPair, SwapStatus } from "../types";

// Add error formatting utility
function formatErrorMessage(error: string): string {
  // Check if it's a user rejection error with long technical details
  if (error.includes("User rejected") && error.includes("Request Arguments:")) {
    return "Transaction was cancelled by user.";
  }

  // Check if it's a user rejection error (simpler case)
  if (
    error.includes("User rejected") ||
    error.includes("user rejected") ||
    error.includes("Request rejected")
  ) {
    return "Transaction was cancelled by user.";
  }

  // Check if it's a contract call error with a long hex string
  if (error.includes("0x") && error.length > 100) {
    // For contract errors with long hex data
    if (error.includes("Contract Call:")) {
      return "Transaction failed due to contract error. Please try again or adjust your swap settings.";
    }

    // For other technical errors with hex data
    return "Transaction failed. Please try again or adjust your swap amount.";
  }

  // For slippage errors
  if (error.toLowerCase().includes("slippage")) {
    return "Price moved too much. Try increasing slippage tolerance in settings.";
  }

  // For gas errors
  if (
    error.toLowerCase().includes("gas") ||
    error.toLowerCase().includes("fee")
  ) {
    return "Insufficient ETH for gas fees. Add more ETH to your wallet.";
  }

  // For insufficient balance errors
  if (
    error.toLowerCase().includes("balance") ||
    error.toLowerCase().includes("insufficient")
  ) {
    return "Insufficient token balance for this swap.";
  }

  // For timeout errors
  if (
    error.toLowerCase().includes("timeout") ||
    error.toLowerCase().includes("timed out")
  ) {
    return "Transaction timed out. Please try again.";
  }

  // If the error is already short enough, return it as is
  if (error.length < 100) {
    return error;
  }

  // Default fallback for any other errors
  return "Swap failed. Please try again with different parameters.";
}

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
  onClear: (fromCloseButton?: boolean) => void;
  hasEnoughTokenBalance?: boolean;
  onClose?: () => void;
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
  onClose,
}: SwapButtonProps) {
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [wasApproving, setWasApproving] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [revocationSuccessful, setRevocationSuccessful] = useState(false);

  // Create a wrapper for onClear to handle the fromCloseButton parameter
  const handleClear = (fromCloseButton = false) => {
    // If this is from the close button, don't show success message
    if (fromCloseButton) {
      setShowSuccessMessage(false);
      setRevocationSuccessful(false); // Ensure we don't show revocation success for cancellations
    } else {
      setShowSuccessMessage(true);
    }

    // Call the original onClear function
    if (typeof onClear === "function") {
      try {
        // Try with the parameter first
        onClear(fromCloseButton);
      } catch (e) {
        // If that fails, call without the parameter
        onClear();
      }
    }
  };

  // Track when approval process starts and ends
  useEffect(() => {
    // If approval is loading, mark that we were in the approval process
    if (approvalStatus.loading) {
      setWasApproving(true);
      // Reset revocation successful state when starting a new approval
      setRevocationSuccessful(false);
    }
    // If we were approving and now we're not loading anymore, but still not approved
    // This indicates the approval was interrupted/cancelled
    else if (
      wasApproving &&
      !approvalStatus.loading &&
      !approvalStatus.approved
    ) {
      // Reset the wasApproving state
      setWasApproving(false);

      // Clear the state without showing success message
      handleClear(true); // From close button
    }
    // If approval succeeded, reset the wasApproving state
    else if (wasApproving && approvalStatus.approved) {
      setWasApproving(false);
    }
  }, [approvalStatus.loading, approvalStatus.approved, wasApproving]);

  // Reset revocation successful state when input or output amount changes
  useEffect(() => {
    setRevocationSuccessful(false);
  }, [inputAmount, outputAmount]);

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
    if (status.error) {
      handleClear(false); // Clear error state first, not from close button
      return;
    }

    if (approvalStatus.required && !approvalStatus.approved) {
      onApprove();
    } else {
      onSwap();
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

    if (status.loading || approvalStatus.loading) {
      return "tw-bg-gradient-to-r tw-from-[#546e7a] tw-to-[#78909c] tw-cursor-wait";
    }

    // For approval button
    if (approvalStatus.required && !approvalStatus.approved) {
      return "tw-bg-gradient-to-r tw-from-[#3498db] tw-to-[#2980b9] hover:tw-from-[#2980b9] hover:tw-to-[#2573a7]";
    }

    return "tw-bg-gradient-to-r tw-from-[#2ecc71] tw-to-[#27ae60] hover:tw-from-[#27ae60] hover:tw-to-[#219653]";
  };

  return (
    <div className="tw-relative tw-w-full">
      {/* Add a conditional to show the revocation success message only when revocation was successful */}
      {revocationSuccessful && (
        <div className="tw-bg-[#1e1e1e] tw-border tw-border-[#333] tw-rounded-xl tw-p-6 tw-mb-4 tw-flex tw-flex-col tw-gap-4 tw-items-center tw-relative tw-z-1 tw-overflow-hidden">
          <h3 className="tw-text-white tw-font-bold tw-text-xl tw-mb-2">
            Approval Revoked
          </h3>
          <div className="tw-bg-green-600/20 tw-rounded-full tw-p-4 tw-mb-2">
            <div className="tw-text-2xl tw-text-green-500">✓</div>
          </div>
          <div className="tw-text-center tw-mb-2">
            <div className="tw-text-white tw-mb-1">
              Successfully revoked approval for {selectedPair.inputToken.symbol}
            </div>
            <div className="tw-text-white/70 tw-text-sm">
              You'll need to approve again for future swaps.
            </div>
          </div>
          <button
            onClick={() => setRevocationSuccessful(false)}
            className="tw-bg-green-500 tw-text-white tw-px-6 tw-py-2 tw-rounded-lg hover:tw-bg-green-600 tw-transition-colors tw-font-medium"
          >
            Close
          </button>
        </div>
      )}

      {!revocationSuccessful && (
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
            <div className="tw-flex tw-items-center tw-justify-center tw-gap-2 tw-w-full">
              {status.loading || approvalStatus.loading ? (
                <div className="tw-flex tw-items-center tw-justify-center tw-gap-2 tw-w-full">
                  <div className="tw-w-5 tw-h-5 tw-border-2 tw-border-white/30 tw-border-t-white tw-rounded-full tw-animate-spin"></div>
                  <span>{getButtonText()}</span>
                </div>
              ) : (
                <span className="tw-text-center tw-w-full">
                  {getButtonText()}
                </span>
              )}
            </div>
          </button>

          {status.error && (
            <div className="tw-bg-red-500/10 tw-border tw-border-red-500/20 tw-rounded-xl tw-p-4 tw-mb-4 tw-flex tw-gap-4 tw-items-start tw-relative tw-z-1 tw-overflow-hidden">
              <div className="tw-text-xl tw-leading-none tw-text-red-400">
                ❌
              </div>
              <div className="tw-flex-1">
                <div className="tw-text-red-400 tw-font-semibold tw-mb-1">
                  {status.error.includes("rejected") ||
                  status.error.includes("Rejected")
                    ? "Transaction Cancelled"
                    : "Transaction Failed"}
                </div>
                <div className="tw-text-white/70 tw-text-sm tw-leading-relaxed">
                  {formatErrorMessage(status.error)}
                </div>
                <div className="tw-flex tw-items-center tw-justify-end tw-mt-2">
                  <button
                    onClick={() => handleClear(false)}
                    className="tw-text-white/60 tw-text-sm tw-font-medium tw-bg-white/5 tw-px-3 tw-py-1 tw-rounded-lg hover:tw-bg-white/10 tw-transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
