/** Ciphertext only. The decryption secret is carried separately in the link hash. */
export function isEncryptedConnectionDeviceSetup(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= 32768 &&
    /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/.test(value)
  );
}
