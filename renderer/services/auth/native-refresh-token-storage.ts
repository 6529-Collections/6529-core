import { TokenRefreshCancelledError } from "@/errors/authentication";
import { Capacitor } from "@capacitor/core";
import { isElectron } from "@/helpers";
import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";

const NATIVE_REFRESH_TOKEN_KEY_PREFIX = "6529-native-refresh-token";

const inMemoryNativeRefreshTokens = new Map<string, string | null>();
const storageOperations = new Map<string, Promise<unknown>>();

function serializeStorage<T>(
  address: string,
  task: () => Promise<T>
): Promise<T> {
  const key = address.toLowerCase();
  const previous = storageOperations.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(task);
  storageOperations.set(key, pending);
  void pending
    .finally(() => {
      if (storageOperations.get(key) === pending) storageOperations.delete(key);
    })
    .catch(() => undefined);
  return pending;
}

function isMissingKey(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message === "Item with given key does not exist";
}

async function readStoredValue(key: string): Promise<string | null> {
  try {
    const result = await SecureStoragePlugin.get({ key });
    return typeof result.value === "string" && result.value.trim()
      ? result.value
      : null;
  } catch (error) {
    if (isMissingKey(error)) return null;
    throw error;
  }
}

export type NativeRefreshTokenClientType = "native" | "desktop";

type ElectronNativeAuthBridge = {
  readonly isAvailable: () => Promise<boolean>;
  readonly removeRefreshToken: (request: {
    readonly client_type?: NativeRefreshTokenClientType | undefined;
    readonly client_address: string;
  }) => Promise<void>;
};

export function isNativeSecureStorageAvailable(): boolean {
  return Capacitor.isNativePlatform() || getElectronNativeAuthBridge() !== null;
}

async function writeNativeRefreshToken({
  address,
  refreshToken,
  clientType = getNativeRefreshTokenClientType(),
}: {
  readonly address: string;
  readonly refreshToken: string;
  readonly clientType?: NativeRefreshTokenClientType | undefined;
}): Promise<void> {
  if (!isNativeSecureStorageAvailable()) {
    return;
  }
  if (isElectron()) {
    // Electron stores native refresh tokens in the main process during
    // login/refresh/redeem so they are never exposed to the renderer.
    return;
  }

  const key = getNativeRefreshTokenKey(address, clientType);
  await SecureStoragePlugin.set({ key, value: refreshToken });
  inMemoryNativeRefreshTokens.set(key, refreshToken);
}

async function readNativeRefreshToken(
  address: string,
  clientType: NativeRefreshTokenClientType
): Promise<string | null> {
  if (!isNativeSecureStorageAvailable()) {
    return null;
  }
  // Desktop refresh credentials belong exclusively to the main process.
  if (isElectron()) {
    return null;
  }
  const key = getNativeRefreshTokenKey(address, clientType);
  const cached = inMemoryNativeRefreshTokens.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const value = await readStoredValue(key);
  if (value) inMemoryNativeRefreshTokens.set(key, value);
  return value;
}

export function setNativeRefreshToken(params: {
  readonly address: string;
  readonly refreshToken: string;
  readonly clientType?: NativeRefreshTokenClientType | undefined;
}): Promise<void> {
  return serializeStorage(params.address, () =>
    writeNativeRefreshToken(params)
  );
}

export function getNativeRefreshToken(
  address: string,
  clientType: NativeRefreshTokenClientType = getNativeRefreshTokenClientType()
): Promise<string | null> {
  return serializeStorage(address, () =>
    readNativeRefreshToken(address, clientType)
  );
}

export function getNativeRefreshRequestId(
  address: string,
  refreshToken: string
): Promise<string> {
  return serializeStorage(address, async () => {
    if ((await readNativeRefreshToken(address, "native")) !== refreshToken) {
      throw new TokenRefreshCancelledError();
    }
    const key = `${getNativeRefreshTokenKey(address, "native")}:pending-refresh`;
    const stored = await readStoredValue(key);
    if (stored) {
      let attempt: unknown;
      try {
        attempt = JSON.parse(stored) as unknown;
      } catch {
        // A damaged journal must not permanently prevent fresh attempts.
        attempt = null;
      }
      if (
        typeof attempt === "object" &&
        attempt !== null &&
        "token" in attempt &&
        attempt.token === refreshToken &&
        "id" in attempt &&
        typeof attempt.id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          attempt.id
        )
      )
        return attempt.id;
    }
    const id = crypto.randomUUID();
    // Persist before sending: app termination must not lose the retry proof.
    await SecureStoragePlugin.set({
      key,
      value: JSON.stringify({ token: refreshToken, id }),
    });
    return id;
  });
}

export function persistRotatedNativeRefreshToken(
  address: string,
  previousToken: string,
  refreshToken: string
): Promise<void> {
  return serializeStorage(address, async () => {
    if ((await readNativeRefreshToken(address, "native")) !== previousToken) {
      throw new TokenRefreshCancelledError();
    }
    await writeNativeRefreshToken({
      address,
      refreshToken,
      clientType: "native",
    });
  });
}

export function removeNativeRefreshToken(
  address: string,
  clientType: NativeRefreshTokenClientType = getNativeRefreshTokenClientType()
): Promise<void> {
  return serializeStorage(address, async () => {
    const key = getNativeRefreshTokenKey(address, clientType);
    // Keep this logout tombstone even if durable deletion fails: a late refresh
    // must never restore credentials after an explicit logout in this process.
    inMemoryNativeRefreshTokens.set(key, null);
    if (!isNativeSecureStorageAvailable()) return;
    if (isElectron()) {
      const electronNativeAuth = getElectronNativeAuthBridge();
      if (!electronNativeAuth) return;
      await electronNativeAuth.removeRefreshToken({
        client_type: clientType,
        client_address: address,
      });
      return;
    }
    // Delete the credential before its recovery proof.
    await removeStoredValue(key);
    await removeStoredValue(`${key}:pending-refresh`);
  });
}

async function removeStoredValue(key: string): Promise<void> {
  try {
    await SecureStoragePlugin.remove({ key });
  } catch (error) {
    if (!isMissingKey(error)) throw error;
  }
}

function getNativeRefreshTokenClientType(): NativeRefreshTokenClientType {
  return isElectron() ? "desktop" : "native";
}

function getNativeRefreshTokenKey(
  address: string,
  clientType: NativeRefreshTokenClientType
): string {
  const addressKey = address.toLowerCase();
  // Desktop and mobile/native sessions use separate refresh-token namespaces.
  if (clientType === "desktop") {
    return `${NATIVE_REFRESH_TOKEN_KEY_PREFIX}:desktop:${addressKey}`;
  }
  return `${NATIVE_REFRESH_TOKEN_KEY_PREFIX}:${addressKey}`;
}

function getElectronNativeAuthBridge(): ElectronNativeAuthBridge | null {
  if (typeof window === "undefined" || !isElectron()) {
    return null;
  }

  const nativeAuth = (window as Window & {
    readonly nativeAuth?: ElectronNativeAuthBridge | undefined;
  }).nativeAuth;
  if (
    !nativeAuth ||
    typeof nativeAuth.removeRefreshToken !== "function"
  ) {
    return null;
  }

  return nativeAuth;
}
