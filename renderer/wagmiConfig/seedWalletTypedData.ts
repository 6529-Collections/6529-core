import { TypedDataEncoder, type TypedDataDomain, type Wallet } from "ethers";
import { parseTypedDataRequest } from "./typedDataRequest";

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
  // ethers derives the primary type from the types; it must be the one asked.
  if (TypedDataEncoder.getPrimaryType(request.types) !== request.primaryType) {
    throw new Error(
      `Typed data primary type ${request.primaryType} is not the root type`
    );
  }
  return await wallet.signTypedData(
    request.domain as TypedDataDomain,
    request.types,
    request.message
  );
}
