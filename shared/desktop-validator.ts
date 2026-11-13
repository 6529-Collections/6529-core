export const DESKTOP_VALIDATOR_DOWNLOAD_URL = "https://6529.io/validator";

export type DesktopValidatorHealth =
  | "all-good"
  | "getting-ready"
  | "paused"
  | "not-signing"
  | "needs-attention"
  | "update-available"
  | "update-needed";

export interface DesktopValidatorNetworkAgreement {
  readonly signingAccounts: number;
  readonly signedTdhShare: number;
}

export type DesktopValidatorStatus =
  | { readonly service: "not-installed" | "stopped" | "unavailable" }
  | {
      readonly service: "running";
      readonly health: DesktopValidatorHealth;
      readonly release?: string | undefined;
      readonly signing: "counted" | "signed" | "not-signed";
      readonly nextSignatureAt?: number | undefined;
      readonly resultRoot?: string | undefined;
      readonly networkAgreement?: DesktopValidatorNetworkAgreement;
    };
