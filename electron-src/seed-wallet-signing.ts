import {
  getAddress,
  getBigInt,
  getBytes,
  isHexString,
  JsonRpcProvider,
  Wallet,
} from "ethers";
import type { TransactionRequest } from "ethers";
import { SEED_WALLET_SEPOLIA_CHAIN_ID } from "../renderer/wagmiConfig/seedWalletConnectionState";
import { signSeedWalletTypedData } from "../renderer/wagmiConfig/seedWalletTypedData";
import { SIGN_TYPED_DATA_V4 } from "../renderer/wagmiConfig/typedDataRequest";
import type { SeedWalletRequest } from "../shared/types";

export async function signSeedWalletRequest(
  wallet: Wallet,
  request: SeedWalletRequest,
  assertActive: () => void,
): Promise<string> {
  assertActive();
  const [first, second] = request.params;
  switch (request.method) {
    case "personal_sign":
      if (
        typeof first !== "string" ||
        !isHexString(first, true) ||
        typeof second !== "string" ||
        getAddress(second) !== wallet.address
      ) {
        throw new Error("Invalid personal sign request for this wallet");
      }
      return wallet.signMessage(getBytes(first));
    case SIGN_TYPED_DATA_V4:
      return signSeedWalletTypedData(wallet, request.params);
    case "eth_sendTransaction":
      if (!first || typeof first !== "object" || Array.isArray(first)) {
        throw new Error("Invalid wallet transaction");
      }
      return sendSeedWalletTransaction(
        wallet,
        request.chainId,
        first,
        assertActive,
      );
    default:
      throw new Error("Unsupported wallet request");
  }
}

async function sendSeedWalletTransaction(
  wallet: Wallet,
  chainId: number,
  transaction: TransactionRequest,
  assertActive: () => void,
): Promise<string> {
  if (
    transaction.chainId != null &&
    getBigInt(transaction.chainId) !== BigInt(chainId)
  ) {
    throw new Error("Wallet transaction chain does not match the connected chain");
  }
  const url =
    chainId === SEED_WALLET_SEPOLIA_CHAIN_ID
      ? "https://11155111.rpc.thirdweb.com"
      : "https://rpc1.6529.io";
  const provider = new JsonRpcProvider(url, chainId);
  try {
    const signer = wallet.connect(provider);
    const populated = await signer.populateTransaction(transaction);
    assertActive();
    const signed = await signer.signTransaction(populated);
    assertActive();
    const response = await provider.broadcastTransaction(signed);
    return response.hash;
  } finally {
    provider.destroy();
  }
}
