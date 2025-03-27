export function formatErrorMessage(error: string): string {
  if (error.includes("User rejected") && error.includes("Request Arguments:")) {
    return "Transaction was cancelled by user.";
  }

  if (
    error.includes("User rejected") ||
    error.includes("user rejected") ||
    error.includes("Request rejected")
  ) {
    return "Transaction was cancelled by user.";
  }

  if (error.includes("0x") && error.length > 100) {
    if (error.includes("Contract Call:")) {
      return "Transaction failed due to contract error. Please try again or adjust your swap settings.";
    }

    return "Transaction failed. Please try again or adjust your swap amount.";
  }

  if (error.toLowerCase().includes("slippage")) {
    return "Price moved too much. Try increasing slippage tolerance in settings.";
  }

  if (
    error.toLowerCase().includes("gas") ||
    error.toLowerCase().includes("fee")
  ) {
    return "Insufficient ETH for gas fees. Add more ETH to your wallet.";
  }

  if (
    error.toLowerCase().includes("balance") ||
    error.toLowerCase().includes("insufficient")
  ) {
    return "Insufficient token balance for this swap.";
  }

  if (
    error.toLowerCase().includes("timeout") ||
    error.toLowerCase().includes("timed out")
  ) {
    return "Transaction timed out. Please try again.";
  }

  if (error.length < 100) {
    return error;
  }

  return "Swap failed. Please try again with different parameters.";
}
