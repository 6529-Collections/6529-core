import { createHash, randomBytes } from "node:crypto";
import type { WalletPasswordResult } from "../shared/wallet-passwords";

export interface MacWalletKeychainNative {
  authenticate(): Promise<boolean>;
  cancelAuthentication(): void;
  contains(service: string, account: string): Promise<boolean>;
  read(service: string, account: string): Promise<string | null>;
  save(service: string, account: string, password: string): Promise<null>;
  forget(service: string, account: string): Promise<null>;
}

type SaveDecision = "save" | "skip" | "cancelled" | "busy";

export class WalletKeychain {
  private readonly service: string;
  private readonly busyAccounts = new Set<string>();
  private readonly declinedOffers = new Set<string>();

  constructor(
    private readonly native: MacWalletKeychainNative | null,
    profilePath: string,
    private readonly verifyPassword: (
      address: string,
      password: string,
    ) => Promise<boolean>,
  ) {
    const profile = createHash("sha256").update(profilePath).digest("hex");
    this.service = `com.6529.core.wallet-password.${profile}`;
  }

  isAvailable(): boolean {
    return this.native !== null;
  }

  async authenticate(signal: AbortSignal): Promise<boolean> {
    const native = this.native;
    if (!native || signal.aborted) return false;
    const cancel = () => native.cancelAuthentication();
    signal.addEventListener("abort", cancel, { once: true });
    try {
      return await native.authenticate();
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  }

  generate(): WalletPasswordResult<string> {
    if (!this.native) return { ok: false, code: "unavailable" };
    return { ok: true, value: randomBytes(18).toString("base64url") };
  }

  async hasSavedPassword(address: unknown): Promise<boolean> {
    const result = await this.run<boolean>(address, async (native, _address, account) => ({
      ok: true,
      value: await native.contains(this.service, account),
    }));
    return result.ok && result.value;
  }

  request(address: unknown): Promise<WalletPasswordResult<string>> {
    return this.run<string>(address, async (native, address, account) => {
      const password = await native.read(this.service, account);
      if (password === null) return { ok: false, code: "not-saved" };
      if (!(await this.verifyPassword(address, password))) {
        return { ok: false, code: "invalid-password" };
      }
      return { ok: true, value: password };
    });
  }

  offerSave(
    address: unknown,
    password: unknown,
    confirm: () => Promise<SaveDecision>,
  ): Promise<WalletPasswordResult<boolean>> {
    return this.run<boolean>(address, async (native, address, account) => {
      if (this.declinedOffers.has(account)) {
        return { ok: true, value: false };
      }
      if (
        typeof password !== "string" ||
        password.length === 0 ||
        password.length > 4096 ||
        !(await this.verifyPassword(address, password))
      ) {
        return { ok: false, code: "invalid-password" };
      }
      const decision = await confirm();
      if (decision === "busy") return { ok: false, code: "busy" };
      if (decision === "skip") this.declinedOffers.add(account);
      if (decision !== "save") return { ok: true, value: false };
      // Saving updates an existing item after consent without reading it first.
      await native.save(this.service, account, password);
      return { ok: true, value: true };
    });
  }

  saveForSetup(
    address: string,
    password: string,
    confirm: () => Promise<SaveDecision>,
    persist: () => Promise<void>,
  ): Promise<WalletPasswordResult<null>> {
    return this.run<null>(address, async (native, _address, account) => {
      const decision = await confirm();
      if (decision === "busy") return { ok: false, code: "busy" };
      if (decision !== "save") return { ok: false, code: "cancelled" };

      // Rollback must only remove the item provisioned by this setup.
      if (await native.contains(this.service, account)) return { ok: false, code: "failed" };
      await native.save(this.service, account, password);
      try {
        await persist();
      } catch {
        await native.forget(this.service, account);
        return { ok: false, code: "wallet-setup-failed" };
      }
      return { ok: true, value: null };
    });
  }

  forget(address: unknown): Promise<WalletPasswordResult<null>> {
    return this.run<null>(address, async (native, _address, account) => {
      await native.forget(this.service, account);
      this.declinedOffers.add(account);
      return { ok: true, value: null };
    });
  }

  async deleteWallet(
    address: string,
    remove: (address: string) => Promise<void>,
  ): Promise<WalletPasswordResult<null>> {
    if (!this.native) {
      await remove(address);
      return { ok: true, value: null };
    }
    return this.run<null>(address, async (native, address, account) => {
      await native.forget(this.service, account);
      await remove(address);
      this.declinedOffers.delete(account);
      return { ok: true, value: null };
    });
  }

  private async run<T>(
    address: unknown,
    operation: (
      native: MacWalletKeychainNative,
      address: string,
      account: string,
    ) => Promise<WalletPasswordResult<T>>,
  ): Promise<WalletPasswordResult<T>> {
    if (!this.native) return { ok: false, code: "unavailable" };
    if (typeof address !== "string" || !/^0x[0-9a-f]{40}$/i.test(address)) {
      return { ok: false, code: "failed" };
    }
    const account = address.toLowerCase();
    if (this.busyAccounts.has(account)) return { ok: false, code: "busy" };
    this.busyAccounts.add(account);
    try {
      return await operation(this.native, address, account);
    } catch {
      return { ok: false, code: "failed" };
    } finally {
      this.busyAccounts.delete(account);
    }
  }
}
