// Text for the Core wallet's EIP-712 confirmation. The raw values are what the
// wallet signs and are always shown; a 6529 device grant's MLS ciphersuites
// also get a readable note. Keep this module free of frontend dependencies:
// the Electron suite tests it.

/** Grant types that name MLS ciphersuites (v1 `ciphersuite`, v2 `ciphersuites`). */
const GRANT_PRIMARY_TYPES = new Set(["DeviceGrant", "MlsDeviceGrant"]);

/** Encryption strength of the suites 6529 grants name (D172). */
const MLS_CIPHERSUITE_LABELS: ReadonlyMap<number, string> = new Map([
  [0x004e, "AES-256"],
  [0x004f, "AES-128"],
]);

const isSuite = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 0xffff;

/** "MLS 0x004E, AES-256" for a known suite, "MLS 0x1234" otherwise. */
function describeSuite(suite: number): string {
  const codePoint = `0x${suite.toString(16).toUpperCase().padStart(4, "0")}`;
  const label = MLS_CIPHERSUITE_LABELS.get(suite);
  return label ? `MLS ${codePoint}, ${label}` : `MLS ${codePoint}`;
}

/** A typed-data value as text; a domain chain ID arrives as a bigint. */
export function formatTypedDataValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return String(value);
  return JSON.stringify(value) ?? String(value);
}

/**
 * A readable note for a 6529 grant's ciphersuite field, or null for any other
 * field or request. Signing-only app grants name no suite (`[]`, or 0 in v1).
 */
export function describeTypedDataField(
  primaryType: string,
  field: string,
  value: unknown
): string | null {
  if (!GRANT_PRIMARY_TYPES.has(primaryType)) return null;
  let suites: readonly number[];
  if (field === "ciphersuites" && Array.isArray(value) && value.every(isSuite)) {
    suites = value;
  } else if (field === "ciphersuite" && isSuite(value)) {
    suites = value === 0 ? [] : [value];
  } else {
    return null;
  }
  return suites.length === 0
    ? "no encrypted messages"
    : suites.map(describeSuite).join("; ");
}
