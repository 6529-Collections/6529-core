import { TokenRefreshCancelledError } from "@/errors/authentication";
import { isElectron } from "@/helpers";
import {
  isNativeSecureStorageAvailable,
  setNativeRefreshToken,
} from "./native-refresh-token-storage";

export interface PersistSessionResponseOptions {
  readonly shouldPersist?: (() => boolean) | undefined;
}

type PersistableSessionResponse =
  | { readonly client_type: "web"; readonly address: string }
  | {
      readonly client_type: "native" | "desktop";
      readonly address: string;
      readonly native_refresh_token: string;
    };

export const assertSessionPersistenceIsCurrent = (
  options: PersistSessionResponseOptions
): void => {
  if (options.shouldPersist?.() === false) {
    throw new TokenRefreshCancelledError(
      "Auth state changed before session persistence completed"
    );
  }
};

export const persistNativeRefreshTokenIfNeeded = async (
  response: PersistableSessionResponse,
  options: PersistSessionResponseOptions
): Promise<"not-required" | "persisted" | "unavailable"> => {
  if (response.client_type === "web") {
    return "not-required";
  }
  if (!isNativeSecureStorageAvailable()) {
    return "unavailable";
  }

  assertSessionPersistenceIsCurrent(options);
  if (response.client_type === "desktop" && isElectron()) {
    // Electron's main-process bridge already persisted the refresh token while
    // handling login/refresh/redeem. Never send that token back into renderer
    // storage, even transiently.
    return "persisted";
  }
  await setNativeRefreshToken({
    address: response.address,
    refreshToken: response.native_refresh_token,
    clientType: response.client_type,
  });
  return "persisted";
};
