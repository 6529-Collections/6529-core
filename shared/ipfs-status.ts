export type IpfsStatus =
  | "disabled"
  | "stopped"
  | "starting"
  | "ready"
  | "unavailable";

export interface LocalIpfsPreferencesSnapshot {
  readonly enabled: boolean;
  readonly enabledAtStartup: boolean;
  readonly restartRequired: boolean;
}
