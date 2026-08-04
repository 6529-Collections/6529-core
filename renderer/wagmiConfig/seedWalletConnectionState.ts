export interface SeedWalletConnectionState {
  readonly accounts: `0x${string}`[];
  readonly chainId: number;
}

export const EMPTY_SEED_WALLET_CONNECTION: SeedWalletConnectionState = {
  accounts: [],
  chainId: 1,
};

export function createSeedWalletConnectionState(
  address: string,
  chainId: number
): SeedWalletConnectionState {
  return {
    accounts: [address as `0x${string}`],
    chainId,
  };
}

export function parseSeedWalletConnectionState(
  serializedConnection: string | null | undefined,
  connectorAddress: string
): SeedWalletConnectionState | null {
  if (!serializedConnection) {
    return null;
  }

  try {
    const candidate = JSON.parse(serializedConnection) as {
      readonly accounts?: unknown;
      readonly chainId?: unknown;
    };
    if (
      !Array.isArray(candidate.accounts) ||
      candidate.accounts.length !== 1 ||
      typeof candidate.accounts[0] !== "string" ||
      candidate.accounts[0].toLowerCase() !== connectorAddress.toLowerCase() ||
      !Number.isInteger(candidate.chainId) ||
      Number(candidate.chainId) <= 0
    ) {
      return null;
    }

    return createSeedWalletConnectionState(
      candidate.accounts[0],
      Number(candidate.chainId)
    );
  } catch {
    return null;
  }
}
