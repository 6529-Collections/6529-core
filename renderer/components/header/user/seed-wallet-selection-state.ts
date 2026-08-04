export type SeedWalletSelectionState = "active" | "connected" | "available";

const normalizeAddress = (address: string): string => address.toLowerCase();

export function getSeedWalletSelectionState({
  connectorAddress,
  activeAddress,
  connectedAccountAddresses,
}: Readonly<{
  connectorAddress: string;
  activeAddress?: string | undefined;
  connectedAccountAddresses: readonly string[];
}>): SeedWalletSelectionState {
  const normalizedConnectorAddress = normalizeAddress(connectorAddress);

  if (
    activeAddress &&
    normalizeAddress(activeAddress) === normalizedConnectorAddress
  ) {
    return "active";
  }

  if (
    connectedAccountAddresses.some(
      (address) => normalizeAddress(address) === normalizedConnectorAddress
    )
  ) {
    return "connected";
  }

  return "available";
}
