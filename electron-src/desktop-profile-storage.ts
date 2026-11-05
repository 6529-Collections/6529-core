import {
  parseDesktopProfileState,
  MAX_DESKTOP_PROFILES,
  type DesktopProfileState,
} from "../shared/desktop-profile-state";

interface ProfileStorageDependencies {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  encrypt(value: string): string;
  decrypt(value: string): string;
  readLegacy(): Promise<DesktopProfileState>;
  hasSession(address: string): boolean;
}

export class DesktopProfileStorage {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: ProfileStorageDependencies) {}

  private key(backend: string) {
    return `desktop-profile-state:v1:${backend}`;
  }

  private serialize<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.pending.then(operation, operation);
    this.pending = result.catch(() => undefined);
    return result;
  }

  private retainSessions(state: DesktopProfileState): DesktopProfileState {
    const accounts = state.accounts.filter(
      (account) =>
        account.authSessionVersion !== "v2" ||
        this.deps.hasSession(account.address),
    );
    return {
      version: 1,
      accounts,
      activeAddress: accounts.some(
        (account) => account.address === state.activeAddress,
      )
        ? state.activeAddress
        : null,
    };
  }

  private write(backend: string, state: DesktopProfileState) {
    if (state.accounts.length === 0) {
      // An explicit empty marker prevents reimport after logout, and needs no
      // keychain access when the app has no saved authentication state.
      this.deps.set(this.key(backend), { version: 1, empty: true });
      return;
    }
    const cipherTextBase64 = this.deps.encrypt(JSON.stringify(state));
    this.deps.set(this.key(backend), { version: 1, cipherTextBase64 });
  }

  restore(backend: string, current: unknown): Promise<DesktopProfileState> {
    const candidate = parseDesktopProfileState(current);
    return this.serialize(async () => {
      const stored = this.deps.get(this.key(backend));
      let state: DesktopProfileState;
      if (
        stored &&
        typeof stored === "object" &&
        "version" in stored &&
        stored.version === 1 &&
        "empty" in stored &&
        stored.empty === true
      ) {
        state = { version: 1, accounts: [], activeAddress: null };
      } else if (stored !== undefined && stored !== null) {
        if (
          typeof stored !== "object" ||
          !("cipherTextBase64" in stored) ||
          typeof stored.cipherTextBase64 !== "string" ||
          !("version" in stored) ||
          stored.version !== 1
        ) {
          throw new Error("Invalid encrypted Desktop profile state");
        }
        try {
          state = parseDesktopProfileState(
            JSON.parse(this.deps.decrypt(stored.cipherTextBase64)),
          );
        } catch {
          throw new Error("Could not decrypt saved Desktop profiles");
        }
      } else {
        const legacy = this.retainSessions(await this.deps.readLegacy());
        // Preserve the current origin's explicit selection when it already has
        // profiles, while recovering the remaining pre-fallback accounts.
        const current = this.retainSessions(candidate);
        const accounts = [...current.accounts];
        for (const account of legacy.accounts) {
          if (accounts.length >= MAX_DESKTOP_PROFILES) break;
          if (!accounts.some((saved) => saved.address === account.address))
            accounts.push(account);
        }
        state = parseDesktopProfileState({
          version: 1,
          accounts,
          activeAddress: current.accounts.length
            ? current.activeAddress
            : legacy.activeAddress,
        });
      }
      state = this.retainSessions(state);
      this.write(backend, state);
      return state;
    });
  }

  save(backend: string, value: unknown): Promise<void> {
    const state = parseDesktopProfileState(value);
    return this.serialize(() =>
      this.write(backend, this.retainSessions(state)),
    );
  }
}
