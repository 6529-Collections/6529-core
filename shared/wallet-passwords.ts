export type WalletPasswordError =
  | "unavailable"
  | "busy"
  | "cancelled"
  | "not-saved"
  | "invalid-password"
  | "failed";

export type WalletPasswordResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: WalletPasswordError };

export type WalletRecoveryField = "mnemonic" | "privateKey" | "both";

export interface WalletRecoveryResult {
  readonly mnemonic?: string;
  readonly privateKey?: string;
}

/** Saved passwords stay in main. A password typed by the user may be sent to main. */
export interface ElectronWalletPasswords {
  isAvailable(): Promise<boolean>;
  generate(): Promise<WalletPasswordResult<string>>;
  hasSavedPassword(address: string): Promise<boolean>;
  unlock(
    address: string,
    password?: string,
  ): Promise<WalletPasswordResult<null>>;
  lock(): Promise<void>;
  recover(
    address: string,
    field: WalletRecoveryField,
    password?: string,
  ): Promise<WalletPasswordResult<WalletRecoveryResult>>;
  offerSave(
    address: string,
    password: string,
  ): Promise<WalletPasswordResult<boolean>>;
  forget(address: string): Promise<WalletPasswordResult<null>>;
}
