import { getAddress, isAddress } from "ethers";
import { mainnet, sepolia } from "viem/chains";

export interface SeedWalletConnectionState {
  readonly accounts: `0x${string}`[];
  readonly chainId: number;
}

export const EMPTY_SEED_WALLET_CONNECTION: SeedWalletConnectionState = {
  accounts: [],
  chainId: mainnet.id,
};

export const SUPPORTED_SEED_WALLET_CHAIN_IDS = [
  mainnet.id,
  sepolia.id,
] as const;

export type SupportedSeedWalletChainId =
  (typeof SUPPORTED_SEED_WALLET_CHAIN_IDS)[number];

export function requireSupportedSeedWalletChainId(
  chainId: number
): SupportedSeedWalletChainId {
  if (
    !SUPPORTED_SEED_WALLET_CHAIN_IDS.includes(
      chainId as SupportedSeedWalletChainId
    )
  ) {
    throw new Error(`Unsupported Core wallet chain ID: ${chainId}`);
  }
  return chainId as SupportedSeedWalletChainId;
}

function normalizeSeedWalletAddress(address: string): `0x${string}` {
  if (!isAddress(address)) {
    throw new Error("Invalid Core wallet address");
  }
  return getAddress(address) as `0x${string}`;
}

export function createSeedWalletConnectionState(
  address: string,
  chainId: number
): SeedWalletConnectionState {
  return {
    accounts: [normalizeSeedWalletAddress(address)],
    chainId: requireSupportedSeedWalletChainId(chainId),
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
      !Number.isInteger(candidate.chainId)
    ) {
      return null;
    }

    const candidateAddress = normalizeSeedWalletAddress(candidate.accounts[0]);
    const normalizedConnectorAddress =
      normalizeSeedWalletAddress(connectorAddress);
    if (candidateAddress !== normalizedConnectorAddress) {
      return null;
    }

    return createSeedWalletConnectionState(
      candidateAddress,
      Number(candidate.chainId)
    );
  } catch {
    return null;
  }
}
