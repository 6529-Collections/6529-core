interface CompleteConnectorSelectionParams {
  readonly acceptConnection: (address: string) => void;
  readonly connect: () => Promise<void>;
  readonly seedWalletAddress: string | null;
  readonly select: () => void;
}

/**
 * Makes a newly selected Core wallet authoritative before the chooser closes.
 * This prevents the previous active Core connector from being restored while
 * the provider's debounced account reconciliation is still pending.
 */
export async function completeConnectorSelection({
  acceptConnection,
  connect,
  seedWalletAddress,
  select,
}: CompleteConnectorSelectionParams): Promise<void> {
  await connect();

  if (seedWalletAddress) {
    acceptConnection(seedWalletAddress);
  }

  select();
}
