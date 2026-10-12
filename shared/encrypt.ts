import crypto from "crypto";

// Seed wallets written before the v2 envelope use AES-256-CBC with a
// PBKDF2-SHA256 key at 100,000 rounds, salted with Buffer.from(address, "hex").
// The address starts with "0x" and hex decoding stops at the "x", so that salt
// is empty. These records must stay readable exactly as they were written;
// nothing writes this format any more.
const LEGACY_ALGORITHM = "aes-256-cbc";
const LEGACY_KDF_ITERATIONS = 100000;

// New records use the same v2 envelope as the web app wallets
// (renderer/components/app-wallets/app-wallet-helpers.ts): a random salt per
// record, PBKDF2-SHA256 at 600,000 rounds and authenticated AES-256-GCM.
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_VERSION = 2;
const KDF_ITERATIONS = 600000;
const MIN_KDF_ITERATIONS = LEGACY_KDF_ITERATIONS + 1;
const KDF_SALT_BYTES = 16;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

const HEX_PATTERN = /^[0-9a-f]+$/i;
const LEGACY_PATTERN = /^[0-9a-f]+:[0-9a-f]+$/i;

interface EncryptedEnvelopeV2 {
  version: typeof ENCRYPTION_VERSION;
  algorithm: typeof ENCRYPTION_ALGORITHM;
  kdf: {
    name: "pbkdf2";
    hash: "sha256";
    iterations: number;
    salt: string;
    key_length: number;
  };
  iv: string;
  auth_tag: string;
  ciphertext: string;
}

function deriveKey(
  password: string,
  salt: Buffer,
  iterations: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      iterations,
      KEY_BYTES,
      "sha256",
      (err, derivedKey) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(derivedKey);
      }
    );
  });
}

function isHexOfLength(value: unknown, bytes?: number): value is string {
  return (
    typeof value === "string" &&
    HEX_PATTERN.test(value) &&
    value.length % 2 === 0 &&
    (bytes === undefined || value.length === bytes * 2)
  );
}

function isValidKdfIterations(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= MIN_KDF_ITERATIONS &&
    value <= KDF_ITERATIONS
  );
}

function isEnvelopeShaped(value: string): boolean {
  return value.startsWith("{");
}

function parseEnvelope(encryptedData: string): EncryptedEnvelopeV2 | null {
  if (!isEnvelopeShaped(encryptedData)) {
    return null;
  }
  try {
    const parsed = JSON.parse(encryptedData) as Partial<EncryptedEnvelopeV2>;
    if (
      parsed.version !== ENCRYPTION_VERSION ||
      parsed.algorithm !== ENCRYPTION_ALGORITHM ||
      parsed.kdf?.name !== "pbkdf2" ||
      parsed.kdf.hash !== "sha256" ||
      !isValidKdfIterations(parsed.kdf.iterations) ||
      parsed.kdf.key_length !== KEY_BYTES ||
      // encryptData writes 16-byte salts; longer ones are accepted.
      !isHexOfLength(parsed.kdf.salt) ||
      parsed.kdf.salt.length < KDF_SALT_BYTES * 2 ||
      !isHexOfLength(parsed.iv, IV_BYTES) ||
      !isHexOfLength(parsed.auth_tag, AUTH_TAG_BYTES) ||
      !isHexOfLength(parsed.ciphertext)
    ) {
      return null;
    }
    return parsed as EncryptedEnvelopeV2;
  } catch {
    return null;
  }
}

/**
 * Returns 2 for a valid v2 envelope, 1 for a legacy record, and null for
 * anything else, including an envelope that fails validation.
 */
export function getEncryptionVersion(value: unknown): 1 | 2 | null {
  if (typeof value !== "string") {
    return null;
  }
  if (parseEnvelope(value)) {
    return 2;
  }
  return LEGACY_PATTERN.test(value) ? 1 : null;
}

/**
 * Encrypts with a fresh random salt and IV, so the same data and password
 * never produce the same output twice.
 */
export async function encryptData(
  data: string,
  password: string
): Promise<string> {
  const salt = crypto.randomBytes(KDF_SALT_BYTES);
  const key = await deriveKey(password, salt, KDF_ITERATIONS);
  const iv = crypto.randomBytes(IV_BYTES);

  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");

  const envelope: EncryptedEnvelopeV2 = {
    version: ENCRYPTION_VERSION,
    algorithm: ENCRYPTION_ALGORITHM,
    kdf: {
      name: "pbkdf2",
      hash: "sha256",
      iterations: KDF_ITERATIONS,
      salt: salt.toString("hex"),
      key_length: KEY_BYTES,
    },
    iv: iv.toString("hex"),
    auth_tag: cipher.getAuthTag().toString("hex"),
    ciphertext: encrypted,
  };

  return JSON.stringify(envelope);
}

/**
 * Decrypts a v2 envelope, or a legacy record. `legacySalt` is the wallet
 * address; only legacy records use it. A value shaped like an envelope never
 * falls back to the legacy format: if it fails validation, it is rejected.
 */
export async function decryptData(
  legacySalt: string,
  encryptedData: string,
  password: string
): Promise<string> {
  if (isEnvelopeShaped(encryptedData)) {
    const envelope = parseEnvelope(encryptedData);
    if (!envelope) {
      throw new Error("Invalid encrypted envelope");
    }
    const key = await deriveKey(
      password,
      Buffer.from(envelope.kdf.salt, "hex"),
      envelope.kdf.iterations
    );
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      key,
      Buffer.from(envelope.iv, "hex")
    );
    decipher.setAuthTag(Buffer.from(envelope.auth_tag, "hex"));
    let decrypted = decipher.update(envelope.ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  const [ivHex, encryptedHex] = encryptedData.split(":");
  if (!LEGACY_PATTERN.test(encryptedData) || !ivHex || !encryptedHex) {
    throw new Error("Invalid encrypted data");
  }
  const key = await deriveKey(
    password,
    Buffer.from(legacySalt, "hex"),
    LEGACY_KDF_ITERATIONS
  );
  const decipher = crypto.createDecipheriv(
    LEGACY_ALGORITHM,
    key,
    Buffer.from(ivHex, "hex")
  );
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
