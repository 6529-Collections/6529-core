import { getAddress, isAddress, Wallet } from "ethers";
import { MNEMONIC_NA } from "../electron-constants";
import { parseSeedWalletConnectionState } from "../renderer/wagmiConfig/seedWalletConnectionState";
import { SIGN_TYPED_DATA_V4 } from "../renderer/wagmiConfig/typedDataRequest";
import { decryptData } from "../shared/encrypt";
import type {
  ISeedWallet,
  SeedWalletRequest,
  SeedWalletRequestResult,
} from "../shared/types";
import type {
  WalletPasswordResult,
  WalletRecoveryField,
  WalletRecoveryResult,
} from "../shared/wallet-passwords";
import { signSeedWalletRequest } from "./seed-wallet-signing";

interface PendingRequest {
  readonly request: SeedWalletRequest;
  readonly resolve: (result: SeedWalletRequestResult) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
  confirmed: boolean;
}

interface SavedUnlock {
  readonly address: string;
  readonly attempt: string;
  readonly chainId: number;
  readonly controller: AbortController;
  expiresAt: number;
}

const SAVED_UNLOCK_TTL_MS = 60_000;

function isWalletRequest(value: unknown): value is SeedWalletRequest {
  if (!value || typeof value !== "object") return false;
  const { requestId, from, chainId, method, params } =
    value as Partial<SeedWalletRequest>;
  return (
    typeof requestId === "string" &&
    requestId.length > 0 &&
    requestId.length <= 64 &&
    typeof from === "string" &&
    isAddress(from) &&
    typeof chainId === "number" &&
    (method === "personal_sign" ||
      method === SIGN_TYPED_DATA_V4 ||
      method === "eth_sendTransaction") &&
    Array.isArray(params)
  );
}

export class SeedWalletSession {
  private signer: Wallet | undefined;
  private unlockingAddress: string | undefined;
  private pending: PendingRequest | undefined;
  private savedUnlock: SavedUnlock | undefined;
  private revision = 0;

  constructor(
    private readonly getWallet: (
      address: string,
    ) => Promise<ISeedWallet | null>,
    private readonly getSavedPassword: (
      address: string,
    ) => Promise<WalletPasswordResult<string>>,
    private readonly readConnection: () => string | undefined,
    private readonly onSettled: (requestId: string) => void,
  ) {}

  async prepareSavedUnlock(
    address: unknown,
    attempt: unknown,
    authenticate: (signal: AbortSignal) => Promise<WalletPasswordResult<null>>,
    isCurrent: () => boolean,
  ): Promise<WalletPasswordResult<null>> {
    if (
      typeof address !== "string" ||
      !isAddress(address) ||
      typeof attempt !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(attempt)
    ) {
      return { ok: false, code: "unavailable" };
    }
    const connection = this.getConnection(address);
    if (!connection || this.signer) return { ok: false, code: "unavailable" };
    this.clearSavedUnlock();
    const savedUnlock: SavedUnlock = {
      address: getAddress(address),
      attempt,
      chainId: connection.chainId,
      controller: new AbortController(),
      expiresAt: 0,
    };
    this.savedUnlock = savedUnlock;
    try {
      const result = await authenticate(savedUnlock.controller.signal);
      if (!result.ok) return result;
      if (
        this.savedUnlock !== savedUnlock ||
        !isCurrent() ||
        this.getConnection(address)?.chainId !== savedUnlock.chainId
      ) {
        return { ok: false, code: "cancelled" };
      }
      savedUnlock.expiresAt = Date.now() + SAVED_UNLOCK_TTL_MS;
      return result;
    } catch {
      return { ok: false, code: "failed" };
    } finally {
      if (!savedUnlock.expiresAt && this.savedUnlock === savedUnlock) {
        this.clearSavedUnlock();
      }
    }
  }

  cancelSavedUnlock(attempt: unknown): void {
    if (this.savedUnlock && this.savedUnlock.attempt === attempt) {
      this.clearSavedUnlock();
    }
  }

  invalidateSavedUnlock(address: unknown): void {
    if (typeof address === "string" && this.savedUnlock &&
        this.savedUnlock.address.toLowerCase() === address.toLowerCase()) {
      this.clearSavedUnlock();
    }
  }

  private clearSavedUnlock(): void {
    const savedUnlock = this.savedUnlock;
    this.savedUnlock = undefined;
    savedUnlock?.controller.abort();
  }

  async unlock(
    address: unknown,
    password: unknown,
    isCurrent: () => boolean,
    attempt?: unknown,
  ): Promise<WalletPasswordResult<null>> {
    if (typeof address !== "string" || !isAddress(address)) {
      return { ok: false, code: "unavailable" };
    }
    const connection = this.getConnection(address);
    if (!connection || !isCurrent()) return { ok: false, code: "unavailable" };
    const savedUnlock = this.savedUnlock;
    if (password === undefined && (
      !savedUnlock ||
      savedUnlock.attempt !== attempt ||
      savedUnlock.address !== getAddress(address) ||
      savedUnlock.chainId !== connection.chainId ||
      savedUnlock.expiresAt <= Date.now()
    )) {
      return { ok: false, code: "unavailable" };
    }
    this.clearSavedUnlock();
    const revision = ++this.revision;
    this.signer = undefined;
    this.unlockingAddress = address;
    try {
      const result = await this.readSecrets(address, password);
      if (!result.ok) return result;
      const { wallet, pass } = result.value;
      const key = await decryptData(wallet.address, wallet.private_key, pass);
      const signer = new Wallet(key);
      if (signer.address !== getAddress(wallet.address))
        return { ok: false, code: "invalid-password" };
      if (
        !isCurrent() ||
        revision !== this.revision ||
        !this.getConnection(wallet.address)
      ) {
        return { ok: false, code: "unavailable" };
      }
      this.signer = signer;
      return { ok: true, value: null };
    } catch {
      return { ok: false, code: "failed" };
    } finally {
      if (revision === this.revision) this.unlockingAddress = undefined;
    }
  }

  async recover(
    address: unknown,
    field: WalletRecoveryField,
    password: unknown,
    approve: () => Promise<boolean>,
  ): Promise<WalletPasswordResult<WalletRecoveryResult>> {
    if (typeof password !== "string" || password.length === 0) {
      return { ok: false, code: "invalid-password" };
    }
    try {
      const result = await this.readSecrets(address, password);
      if (!result.ok) return result;
      if (!(await approve())) return { ok: false, code: "cancelled" };
      const { wallet, pass } = result.value;
      const value: { mnemonic?: string; privateKey?: string } = {};
      if (field !== "privateKey") {
        value.mnemonic =
          wallet.mnemonic === MNEMONIC_NA
            ? wallet.mnemonic
            : await decryptData(wallet.address, wallet.mnemonic, pass);
      }
      if (field !== "mnemonic") {
        value.privateKey = await decryptData(
          wallet.address,
          wallet.private_key,
          pass,
        );
      }
      return { ok: true, value };
    } catch {
      return { ok: false, code: "failed" };
    }
  }

  lock(): void {
    this.clearSavedUnlock();
    this.revision++;
    this.signer = undefined;
    this.unlockingAddress = undefined;
    if (this.pending) this.reject(this.pending.request.requestId);
  }

  invalidateWallet(address: string): void {
    this.invalidateSavedUnlock(address);
    const normalized = address.toLowerCase();
    if (
      this.signer?.address.toLowerCase() === normalized ||
      this.unlockingAddress?.toLowerCase() === normalized
    ) {
      this.lock();
    }
  }

  connectionChanged(): void {
    if (this.savedUnlock &&
        this.getConnection(this.savedUnlock.address)?.chainId !== this.savedUnlock.chainId) {
      this.clearSavedUnlock();
    }
    const address = this.signer?.address ?? this.unlockingAddress;
    if (address && !this.getConnection(address)) this.lock();
    if (this.pending && !this.isConnected(this.pending.request)) {
      this.reject(this.pending.request.requestId);
    }
  }

  start(
    value: unknown,
    show: (request: SeedWalletRequest) => void,
  ): Promise<SeedWalletRequestResult> {
    if (!isWalletRequest(value)) {
      return Promise.resolve({
        ok: false,
        code: "failed",
        message: "Invalid wallet request",
      });
    }
    const { requestId, from, chainId, method, params } = value;
    const request = { requestId, from, chainId, method, params };
    if (!this.isConnected(request)) {
      return Promise.resolve({
        ok: false,
        code: "failed",
        message: "Wallet connection changed",
      });
    }
    if (this.pending) {
      return Promise.resolve({
        ok: false,
        code: "failed",
        message: "Another wallet request is pending",
      });
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.finish({
          ok: false,
          code: "failed",
          message: "Provider request timed out",
        });
      }, 60_000);
      this.pending = { request, resolve, timeout, confirmed: false };
      try {
        show(request);
      } catch {
        this.finish({
          ok: false,
          code: "failed",
          message: "Unable to open wallet request",
        });
      }
    });
  }

  async confirm(requestId: unknown): Promise<void> {
    const pending = this.pending;
    if (
      !pending ||
      pending.request.requestId !== requestId ||
      pending.confirmed
    )
      return;
    pending.confirmed = true;
    const signer = this.signer;
    const revision = this.revision;
    try {
      const assertActive = () => {
        if (
          this.pending !== pending ||
          revision !== this.revision ||
          signer?.address !== getAddress(pending.request.from) ||
          !this.isConnected(pending.request)
        ) {
          throw new Error("Wallet is locked or the connection changed");
        }
      };
      if (!signer) throw new Error("Wallet is locked");
      const value = await signSeedWalletRequest(
        signer,
        pending.request,
        assertActive,
      );
      if (this.pending === pending) this.finish({ ok: true, value });
    } catch {
      if (this.pending === pending) {
        this.finish({
          ok: false,
          code: "failed",
          message: "Wallet request failed",
        });
      }
    }
  }

  reject(requestId: unknown): void {
    if (this.pending && this.pending.request.requestId === requestId) {
      this.finish({ ok: false, code: "rejected", message: "Request rejected" });
    }
  }

  private finish(result: SeedWalletRequestResult): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = undefined;
    clearTimeout(pending.timeout);
    pending.resolve(result);
    this.onSettled(pending.request.requestId);
  }

  private isConnected(request: SeedWalletRequest): boolean {
    return this.getConnection(request.from)?.chainId === request.chainId;
  }

  private getConnection(address: string) {
    return parseSeedWalletConnectionState(this.readConnection(), address);
  }

  private async readSecrets(
    address: unknown,
    password: unknown,
  ): Promise<WalletPasswordResult<{ wallet: ISeedWallet; pass: string }>> {
    if (typeof address !== "string" || !isAddress(address))
      return { ok: false, code: "failed" };
    const canonicalAddress = getAddress(address);
    const wallet =
      (await this.getWallet(address)) ??
      (canonicalAddress === address
        ? null
        : await this.getWallet(canonicalAddress));
    if (!wallet) return { ok: false, code: "failed" };
    if (password === undefined) {
      const saved = await this.getSavedPassword(wallet.address);
      if (!saved.ok) return saved;
      return { ok: true, value: { wallet, pass: saved.value } };
    }
    if (typeof password !== "string" || !password || password.length > 4096) {
      return { ok: false, code: "invalid-password" };
    }
    try {
      const verified = await decryptData(
        wallet.address,
        wallet.address_hashed,
        password,
      );
      if (getAddress(verified) !== getAddress(wallet.address))
        return { ok: false, code: "invalid-password" };
    } catch {
      return { ok: false, code: "invalid-password" };
    }
    return { ok: true, value: { wallet, pass: password } };
  }
}
