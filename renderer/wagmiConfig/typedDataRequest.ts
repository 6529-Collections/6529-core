// EIP-712 typed-data requests (eth_signTypedData_v4) for the 6529 Desktop
// wallet connectors. wagmi/viem send them as [address, typed data JSON]; the
// typed data repeats the EIP712Domain type, which signers derive from the
// domain themselves. Encrypted messages and app device grants are EIP-712, so
// a connector without this method cannot turn them on.
// Keep this module free of frontend dependencies: the Electron suite tests it.

export const SIGN_TYPED_DATA_V4 = "eth_signTypedData_v4";

export interface TypedDataField {
  readonly name: string;
  readonly type: string;
}

export interface TypedDataRequest {
  /** Lowercase 0x address the request asks to sign with. */
  readonly address: string;
  readonly domain: Record<string, unknown>;
  /** The message types, without EIP712Domain. */
  readonly types: Record<string, TypedDataField[]>;
  readonly primaryType: string;
  readonly message: Record<string, unknown>;
}

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/** Limit the request envelope to JSON objects rather than arrays or null. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Validate the structural EIP-712 field definition before copying it. */
const isField = (value: unknown): value is TypedDataField =>
  isRecord(value) &&
  typeof value["name"] === "string" &&
  typeof value["type"] === "string";

/** Preserve JSON chain IDs when viem re-infers the EIP-712 domain types. */
function normalizeDomain(
  domain: Record<string, unknown>
): Record<string, unknown> {
  const chainId = domain["chainId"];
  if (chainId === undefined) return { ...domain };
  const invalid = () =>
    new Error(
      "Invalid typed data chain ID. Ask the requester to send a valid request."
    );
  if (
    (typeof chainId === "number" && !Number.isSafeInteger(chainId)) ||
    (typeof chainId === "string" &&
      !/^(?:[0-9]+|0x[0-9a-fA-F]+)$/.test(chainId)) ||
    !["string", "number", "bigint"].includes(typeof chainId)
  )
    throw invalid();
  const normalized = BigInt(chainId as string | number | bigint);
  if (normalized < 0n || normalized >= 2n ** 256n) throw invalid();
  return { ...domain, chainId: normalized };
}

/** The address an eth_signTypedData_v4 request names, or null. */
export function getTypedDataRequestAddress(params: unknown): string | null {
  const address = Array.isArray(params) ? params[0] : undefined;
  return typeof address === "string" && ADDRESS_PATTERN.test(address)
    ? address.toLowerCase()
    : null;
}

/** Parses eth_signTypedData_v4 params; throws on anything malformed. */
export function parseTypedDataRequest(params: unknown): TypedDataRequest {
  const address = getTypedDataRequestAddress(params);
  if (!address) {
    throw new Error("Typed data request has no valid address");
  }
  const raw = (params as unknown[])[1];
  let typedData: unknown;
  try {
    typedData = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error("Typed data request is not valid JSON");
  }
  if (!isRecord(typedData)) {
    throw new Error("Typed data request has no typed data");
  }
  const { domain, types, primaryType, message } = typedData;
  if (
    !isRecord(domain) ||
    !isRecord(types) ||
    typeof primaryType !== "string" ||
    primaryType.length === 0 ||
    !isRecord(message)
  ) {
    throw new Error("Typed data request is incomplete");
  }
  const messageTypes: Record<string, TypedDataField[]> = Object.create(null);
  for (const [name, fields] of Object.entries(types)) {
    if (name === "EIP712Domain") {
      continue;
    }
    if (!Array.isArray(fields) || !fields.every(isField)) {
      throw new Error(`Typed data type ${name} is invalid`);
    }
    messageTypes[name] = fields.map(({ name: field, type }) => ({
      name: field,
      type,
    }));
  }
  if (!Object.prototype.hasOwnProperty.call(messageTypes, primaryType)) {
    throw new Error(`Typed data has no ${primaryType} type`);
  }
  return {
    address,
    domain: normalizeDomain(domain),
    types: messageTypes,
    primaryType,
    message,
  };
}
