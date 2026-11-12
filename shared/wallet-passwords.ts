export type WalletPasswordError =
  | "unavailable"
  | "busy"
  | "not-saved"
  | "invalid-password"
  | "failed";

export type WalletPasswordResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: WalletPasswordError };

/** Passwords are transient IPC values. Persisted passwords live in Keychain. */
export interface ElectronWalletPasswords {
  isAvailable(): Promise<boolean>;
  generate(): Promise<WalletPasswordResult<string>>;
  hasSavedPassword(address: string): Promise<boolean>;
  request(address: string): Promise<WalletPasswordResult<string>>;
  offerSave(address: string, password: string): Promise<WalletPasswordResult<boolean>>;
  forget(address: string): Promise<WalletPasswordResult<null>>;
}
