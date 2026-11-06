import { TypedDataEncoder } from "ethers";
import type { TypedDataRequest } from "./typedDataRequest";

/** Apply the same EIP-712 root-type contract before either wallet signs. */
export function assertTypedDataRoot(request: TypedDataRequest): void {
  if (TypedDataEncoder.getPrimaryType(request.types) !== request.primaryType) {
    throw new Error(
      `Typed data primary type ${request.primaryType} is not the root type`
    );
  }
}
