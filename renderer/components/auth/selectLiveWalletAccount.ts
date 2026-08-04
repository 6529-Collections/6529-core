export interface LiveWalletAccountSnapshot {
  readonly address?: string | undefined;
  readonly isConnected?: boolean | undefined;
  readonly status?: string | undefined;
}

interface SelectLiveWalletAccountParams {
  readonly activeStoredAddress: string | null;
  readonly appKitAccount: LiveWalletAccountSnapshot;
  readonly browserConnectorConnectedAddress: string | null;
  readonly wagmiAccount: LiveWalletAccountSnapshot;
}

const normalizeAddress = (address: string): string =>
  address.trim().toLowerCase();

const hasLiveAccountSignal = (
  account: LiveWalletAccountSnapshot
): boolean =>
  typeof account.address === "string" ||
  account.isConnected === true ||
  account.status === "connecting" ||
  account.status === "reconnecting" ||
  account.status === "connected";

/**
 * Chooses the provider snapshot without letting a stale Core connector hide
 * the browser connector that storage already made active.
 */
export const selectLiveWalletAccount = ({
  activeStoredAddress,
  appKitAccount,
  browserConnectorConnectedAddress,
  wagmiAccount,
}: SelectLiveWalletAccountParams): LiveWalletAccountSnapshot => {
  const isBrowserConnectorActive = !!(
    activeStoredAddress &&
    browserConnectorConnectedAddress &&
    normalizeAddress(activeStoredAddress) ===
      normalizeAddress(browserConnectorConnectedAddress)
  );

  if (isBrowserConnectorActive) {
    return {
      address: browserConnectorConnectedAddress,
      isConnected: true,
      status: "connected",
    };
  }

  if (hasLiveAccountSignal(wagmiAccount)) {
    return wagmiAccount;
  }

  if (!activeStoredAddress && browserConnectorConnectedAddress) {
    return {
      address: browserConnectorConnectedAddress,
      isConnected: true,
      status: "connected",
    };
  }

  return appKitAccount;
};
