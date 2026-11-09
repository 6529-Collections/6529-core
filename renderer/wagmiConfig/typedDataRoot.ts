import { TypedDataEncoder } from "ethers";
import type { TypedDataRequest } from "./typedDataRequest";

/** Apply the same EIP-712 root-type contract before either wallet signs. */
export function assertTypedDataRoot(request: TypedDataRequest): void {
  let root: string;
  try {
    root = TypedDataEncoder.getPrimaryType(request.types);
  } catch {
    throw new Error(
      "Invalid typed data request. Ask the requester to send a valid request."
    );
  }
  if (root !== request.primaryType) {
    throw new Error(
      "Invalid typed data request: the primary type is not the root type. Ask the requester to send a valid request."
    );
  }
}
