export type DesktopValidatorHealth =
  | "all-good"
  | "getting-ready"
  | "paused"
  | "not-signing"
  | "needs-attention"
  | "update-available"
  | "update-needed";

export type DesktopValidatorStatus =
  | { readonly service: "not-installed" | "stopped" | "unavailable" }
  | {
      readonly service: "running";
      readonly health: DesktopValidatorHealth;
      readonly release?: string | undefined;
      readonly signing: "counted" | "signed" | "not-signed";
      readonly nextSignatureAt?: number | undefined;
      readonly resultRoot?: string | undefined;
    };
