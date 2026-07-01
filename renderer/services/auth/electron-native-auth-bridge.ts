import type { ElectronNativeAuth } from "@/shared/preload-types";

type NativeSessionLogin = ElectronNativeAuth["sessionLogin"];

export function getNativeAuthSessionLogin(): NativeSessionLogin | null {
  if (typeof window === "undefined") {
    return null;
  }

  const nativeAuth = window.nativeAuth;
  if (!nativeAuth) {
    return null;
  }

  const sessionLogin = nativeAuth["sessionLogin"];
  return typeof sessionLogin === "function"
    ? sessionLogin.bind(nativeAuth)
    : null;
}
