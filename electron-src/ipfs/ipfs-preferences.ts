import type { LocalIpfsPreferencesSnapshot } from "../../shared/ipfs-status";

export const LOCAL_IPFS_ENABLED_KEY = "local-ipfs-enabled";

/** A startup snapshot, deliberately independent of subsequent preference writes. */
export class LocalIpfsPreferences {
  readonly enabledAtStartup: boolean;
  private enabled: boolean;

  constructor(
    storedValue: unknown,
    private readonly persist: (enabled: boolean) => void,
  ) {
    // Missing/legacy/invalid values keep the existing opt-out behavior.
    this.enabled = storedValue !== false;
    this.enabledAtStartup = this.enabled;
  }

  getSnapshot(): LocalIpfsPreferencesSnapshot {
    return {
      enabled: this.enabled,
      enabledAtStartup: this.enabledAtStartup,
      restartRequired: this.enabled !== this.enabledAtStartup,
    };
  }

  setEnabled(enabled: unknown): LocalIpfsPreferencesSnapshot {
    if (typeof enabled !== "boolean") {
      throw new TypeError("Local IPFS preference must be a boolean");
    }
    this.persist(enabled);
    this.enabled = enabled;
    return this.getSnapshot();
  }
}
