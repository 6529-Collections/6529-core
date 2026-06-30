import { Capacitor } from "@capacitor/core";
import { isElectron } from "@/helpers";
import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";

const NATIVE_REFRESH_TOKEN_KEY_PREFIX = "6529-native-refresh-token";

const inMemoryNativeRefreshTokens = new Map<string, string>();

export type NativeRefreshTokenClientType = "native" | "desktop";

type ElectronNativeAuthBridge = {
  readonly isAvailable: () => Promise<boolean>;
  readonly getRefreshToken: (key: string) => Promise<string | null>;
  readonly setRefreshToken: (
    key: string,
    refreshToken: string
  ) => Promise<void>;
  readonly removeRefreshToken: (key: string) => Promise<void>;
};

export function isNativeSecureStorageAvailable(): boolean {
  return Capacitor.isNativePlatform() || getElectronNativeAuthBridge() !== null;
}

export async function setNativeRefreshToken({
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
  const key = getNativeRefreshTokenKey(address, clientType);
  const electronNativeAuth = getElectronNativeAuthBridge();
  if (electronNativeAuth) {
    await electronNativeAuth.setRefreshToken(key, refreshToken);
    inMemoryNativeRefreshTokens.set(key, refreshToken);
    return;
  }

  await SecureStoragePlugin.set({ key, value: refreshToken });
  inMemoryNativeRefreshTokens.set(key, refreshToken);
}

export async function getNativeRefreshToken(
  address: string,
  clientType: NativeRefreshTokenClientType = getNativeRefreshTokenClientType()
): Promise<string | null> {
  if (!isNativeSecureStorageAvailable()) {
    return null;
  }
  const key = getNativeRefreshTokenKey(address, clientType);
  const cached = inMemoryNativeRefreshTokens.get(key);
  if (cached) {
    return cached;
  }
  try {
    const electronNativeAuth = getElectronNativeAuthBridge();
    if (electronNativeAuth) {
      const result = await electronNativeAuth.getRefreshToken(key);
      if (typeof result !== "string" || result.trim().length === 0) {
        return null;
      }
      inMemoryNativeRefreshTokens.set(key, result);
      return result;
    }

    const result = await SecureStoragePlugin.get({ key });
    if (typeof result.value !== "string" || result.value.trim().length === 0) {
      return null;
    }
    inMemoryNativeRefreshTokens.set(key, result.value);
    return result.value;
  } catch {
    return null;
  }
}

export async function removeNativeRefreshToken(
  address: string,
  clientType: NativeRefreshTokenClientType = getNativeRefreshTokenClientType()
): Promise<void> {
  const key = getNativeRefreshTokenKey(address, clientType);
  inMemoryNativeRefreshTokens.delete(key);
  if (!isNativeSecureStorageAvailable()) {
    return;
  }
  try {
    const electronNativeAuth = getElectronNativeAuthBridge();
    if (electronNativeAuth) {
      await electronNativeAuth.removeRefreshToken(key);
      return;
    }

    await SecureStoragePlugin.remove({ key });
  } catch {
    // Missing secure-storage keys are treated as already removed.
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
    typeof nativeAuth.getRefreshToken !== "function" ||
    typeof nativeAuth.setRefreshToken !== "function" ||
    typeof nativeAuth.removeRefreshToken !== "function"
  ) {
    return null;
  }

  return nativeAuth;
}
