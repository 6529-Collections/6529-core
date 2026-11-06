import type { TypedDataDomain, Wallet } from "ethers";
import { parseTypedDataRequest } from "./typedDataRequest";
import { assertTypedDataRoot } from "./typedDataRoot";

/**
 * Signs an eth_signTypedData_v4 request with a Core seed wallet's key, only
 * for that wallet's own address and exactly the requested primary type.
 */
export async function signSeedWalletTypedData(
  wallet: Pick<Wallet, "address" | "signTypedData">,
  params: unknown
): Promise<string> {
  const request = parseTypedDataRequest(params);
  if (request.address !== wallet.address.toLowerCase()) {
    throw new Error("Typed data request is for another wallet");
  }
  assertTypedDataRoot(request);
  return await wallet.signTypedData(
    request.domain as TypedDataDomain,
    request.types,
    request.message
  );
}
