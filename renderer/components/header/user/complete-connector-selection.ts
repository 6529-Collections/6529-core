interface CompleteConnectorSelectionParams {
  readonly acceptConnection: (address: string) => void;
  readonly connect: () => Promise<void>;
  readonly seedWalletAddress: string | null;
  readonly select: () => void;
}

interface StartFreshBrowserConnectorSelectionParams {
  readonly connect: () => Promise<void>;
  readonly reset: () => Promise<void>;
  readonly select: () => void;
}

/** Serializes connector choices shared by every row in one chooser. */
export class ConnectorSelectionGuard {
  private active = false;

  tryAcquire(): boolean {
    if (this.active) {
      return false;
    }
    this.active = true;
    return true;
  }

  release(): void {
    this.active = false;
  }
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

/**
 * Browser handoff must close the chooser before waiting for the external
 * browser, and it must reset any previous connector session before reconnecting.
 */
export async function startFreshBrowserConnectorSelection({
  connect,
  reset,
  select,
}: StartFreshBrowserConnectorSelectionParams): Promise<void> {
  select();
  await reset();
  await connect();
}
