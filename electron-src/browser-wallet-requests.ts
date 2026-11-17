import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  getBytes,
  isHexString,
  TypedDataEncoder,
  verifyMessage,
  verifyTypedData,
} from "ethers";
import type { TypedDataDomain } from "ethers";
import {
  parseTypedDataRequest,
  SIGN_TYPED_DATA_V4,
} from "../renderer/wagmiConfig/typedDataRequest";
import { assertTypedDataRoot } from "../renderer/wagmiConfig/typedDataRoot";

/**
 * Wallet requests that 6529 Desktop hands to a browser wallet through the
 * browser connector page. The main process is the only place a request can
 * be created: it validates the request, binds it to the signed-in address and
 * chain, gives it a one-time random id with an expiry on its own clock, and
 * accepts exactly one verified result for it. The page fetches the request by
 * id from the app's own server and never trusts request content in its URL.
 */

export const BROWSER_WALLET_REQUEST_TTL_MS = 120_000;
export const BROWSER_WALLET_MAX_PENDING = 4;
export const BROWSER_WALLET_CHAIN_IDS: readonly number[] = [1, 11155111];

const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_TYPED_DATA_CHARS = 64 * 1024;
const MAX_TX_DATA_BYTES = 64 * 1024;
const MAX_ERROR_MESSAGE_CHARS = 200;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HEX_DATA_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;
const QUANTITY_PATTERN = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/;
const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE_PATTERN = /^0x[0-9a-fA-F]{130}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TRANSACTION_KEYS = new Set([
  "from",
  "to",
  "value",
  "data",
  "input",
  "gas",
  "gasPrice",
  "maxFeePerGas",
  "maxPriorityFeePerGas",
  "nonce",
  "chainId",
  "type",
]);

export type BrowserWalletMethod =
  | "personal_sign"
  | typeof SIGN_TYPED_DATA_V4
  | "eth_sendTransaction";

export type BrowserWalletFailureCode =
  | "invalid"
  | "unsupported"
  | "not-signed-in"
  | "busy"
  | "cancelled"
  | "rejected"
  | "expired"
  | "failed";

export type BrowserWalletOutcome =
  | { readonly ok: true; readonly value: string }
  | {
      readonly ok: false;
      readonly code: BrowserWalletFailureCode;
      readonly message: string;
    };

export interface BrowserWalletTransaction {
  readonly from: string;
  readonly to: string;
  readonly value: string;
  readonly data: string;
}

/** What the browser connector page receives for one pending request. */
export type BrowserWalletRequestView =
  | {
      readonly method: "personal_sign";
      readonly address: string;
      readonly chainId: number;
      readonly message: string;
    }
  | {
      readonly method: typeof SIGN_TYPED_DATA_V4;
      readonly address: string;
      readonly chainId: number;
      readonly typedData: string;
      /** The typed data domain's chain, which the wallet must be on. */
      readonly typedDataChainId: number | null;
    }
  | {
      readonly method: "eth_sendTransaction";
      readonly address: string;
      readonly chainId: number;
      readonly transaction: BrowserWalletTransaction;
    };

type Refusal = Extract<BrowserWalletOutcome, { ok: false }>;

const refuse = (
  code: BrowserWalletFailureCode,
  message: string,
): Refusal => ({ ok: false, code, message });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readChainId(value: unknown): number | null {
  let parsed: bigint;
  try {
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) return null;
      parsed = BigInt(value);
    } else if (typeof value === "bigint") {
      parsed = value;
    } else if (
      typeof value === "string" &&
      /^(?:[1-9][0-9]{0,19}|0x[0-9a-fA-F]{1,16})$/.test(value)
    ) {
      parsed = BigInt(value);
    } else {
      return null;
    }
  } catch {
    return null;
  }
  return parsed > 0n && parsed <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(parsed)
    : null;
}

const isSupportedChain = (chainId: number | null): chainId is number =>
  chainId !== null && BROWSER_WALLET_CHAIN_IDS.includes(chainId);

function readMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = HEX_DATA_PATTERN.test(value)
    ? value.toLowerCase()
    : `0x${Buffer.from(value, "utf8").toString("hex")}`;
  return (hex.length - 2) / 2 <= MAX_MESSAGE_BYTES ? hex : null;
}

function readTransaction(
  value: unknown,
  address: string,
  chainId: number,
): BrowserWalletTransaction | Refusal {
  if (!isRecord(value)) return refuse("invalid", "The transaction is malformed.");
  for (const key of Object.keys(value)) {
    if (!TRANSACTION_KEYS.has(key)) {
      return refuse("unsupported", `Transactions with "${key}" are not supported.`);
    }
  }
  const { from, to, value: amount, data, input, chainId: txChainId } = value;
  if (typeof from !== "string" || from.toLowerCase() !== address) {
    return refuse("invalid", "The transaction is not from the signed-in wallet.");
  }
  if (typeof to !== "string" || !ADDRESS_PATTERN.test(to)) {
    return refuse("unsupported", "Transactions without a recipient are not supported.");
  }
  if (txChainId !== undefined && readChainId(txChainId) !== chainId) {
    return refuse("invalid", "The transaction is for another network.");
  }
  if (amount !== undefined && (typeof amount !== "string" || !QUANTITY_PATTERN.test(amount))) {
    return refuse("invalid", "The transaction value is malformed.");
  }
  if (data !== undefined && input !== undefined && data !== input) {
    return refuse("invalid", "The transaction data is ambiguous.");
  }
  const callData = data ?? input ?? "0x";
  if (typeof callData !== "string" || !HEX_DATA_PATTERN.test(callData)) {
    return refuse("invalid", "The transaction data is malformed.");
  }
  if ((callData.length - 2) / 2 > MAX_TX_DATA_BYTES) {
    return refuse("invalid", "The transaction data is too large.");
  }
  return {
    from: address,
    to: to.toLowerCase(),
    value: typeof amount === "string" ? amount.toLowerCase() : "0x0",
    data: callData.toLowerCase(),
  };
}

/**
 * Checks a wallet request from the app window and reduces it to what the
 * browser connector page will show and sign. Refuses raw hash signing, any
 * method other than message, typed data and transaction requests, requests
 * for another address, and chains the app does not use.
 */
export function validateBrowserWalletRequest(
  input: unknown,
): { readonly ok: true; readonly view: BrowserWalletRequestView } | Refusal {
  if (!isRecord(input)) return refuse("invalid", "The wallet request is malformed.");
  const { method, params, address: rawAddress, chainId: rawChainId } = input;
  if (method === "eth_sign") {
    return refuse("unsupported", "Signing a raw hash is not supported.");
  }
  if (
    method !== "personal_sign" &&
    method !== SIGN_TYPED_DATA_V4 &&
    method !== "eth_sendTransaction"
  ) {
    return refuse("unsupported", "This wallet request is not supported in the browser.");
  }
  if (typeof rawAddress !== "string" || !ADDRESS_PATTERN.test(rawAddress)) {
    return refuse("invalid", "The wallet request has no valid address.");
  }
  const address = rawAddress.toLowerCase();
  const chainId = readChainId(rawChainId);
  if (!isSupportedChain(chainId)) {
    return refuse("invalid", "The wallet request is for an unsupported network.");
  }
  if (!Array.isArray(params)) {
    return refuse("invalid", "The wallet request is malformed.");
  }

  if (method === "personal_sign") {
    const message = readMessage(params[0]);
    if (message === null) return refuse("invalid", "The message is malformed or too large.");
    if (typeof params[1] !== "string" || params[1].toLowerCase() !== address) {
      return refuse("invalid", "The message is not for the signed-in wallet.");
    }
    return { ok: true, view: { method, address, chainId, message } };
  }

  if (method === SIGN_TYPED_DATA_V4) {
    const raw = params[1];
    const typedData = typeof raw === "string" ? raw : JSON.stringify(raw ?? null);
    if (typedData.length > MAX_TYPED_DATA_CHARS) {
      return refuse("invalid", "The typed data is too large.");
    }
    let typedDataChainId: number | null = null;
    try {
      const parsed = parseTypedDataRequest([params[0], typedData]);
      assertTypedDataRoot(parsed);
      if (parsed.address !== address) {
        return refuse("invalid", "The typed data is not for the signed-in wallet.");
      }
      if (parsed.domain["chainId"] !== undefined) {
        typedDataChainId = readChainId(parsed.domain["chainId"]);
        if (!isSupportedChain(typedDataChainId)) {
          return refuse("invalid", "The typed data is for an unsupported network.");
        }
      }
      // Throws on fields that do not match their declared types.
      TypedDataEncoder.hash(
        parsed.domain as TypedDataDomain,
        parsed.types,
        parsed.message,
      );
    } catch {
      return refuse("invalid", "The typed data is malformed.");
    }
    return {
      ok: true,
      view: { method, address, chainId, typedData, typedDataChainId },
    };
  }

  const transaction = readTransaction(params[0], address, chainId);
  if ("ok" in transaction) return transaction;
  return { ok: true, view: { method, address, chainId, transaction } };
}

interface PendingRequest {
  readonly view: BrowserWalletRequestView;
  readonly expiresAt: number;
  readonly returnToken: string;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly settle: (outcome: BrowserWalletOutcome) => void;
}

export type BrowserWalletClaim =
  | {
      readonly ok: true;
      readonly request: BrowserWalletRequestView;
      readonly returnToken: string;
      readonly expiresInMs: number;
    }
  | { readonly ok: false; readonly code: "unknown" | "expired" };

export interface BrowserWalletRequestStoreOptions {
  /** True when the address has a desktop session in this app. */
  readonly hasSession: (address: string) => boolean;
  readonly now?: () => number;
  readonly random?: (size: number) => Buffer;
  readonly ttlMs?: number;
  readonly maxPending?: number;
  readonly setTimer?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

/** Pending browser wallet requests for one run of the app (memory only). */
export class BrowserWalletRequestStore {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly secret: Buffer;
  private readonly hasSession: (address: string) => boolean;
  private readonly now: () => number;
  private readonly random: (size: number) => Buffer;
  private readonly ttlMs: number;
  private readonly maxPending: number;
  private readonly setTimer: NonNullable<BrowserWalletRequestStoreOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<BrowserWalletRequestStoreOptions["clearTimer"]>;

  constructor(options: BrowserWalletRequestStoreOptions) {
    this.hasSession = options.hasSession;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? randomBytes;
    this.ttlMs = options.ttlMs ?? BROWSER_WALLET_REQUEST_TTL_MS;
    this.maxPending = options.maxPending ?? BROWSER_WALLET_MAX_PENDING;
    this.setTimer = options.setTimer ?? setTimeout;
    this.clearTimer = options.clearTimer ?? clearTimeout;
    this.secret = this.random(32);
  }

  /** Validates and registers a request; `done` settles exactly once. */
  create(
    input: unknown,
  ):
    | {
        readonly ok: true;
        readonly id: string;
        readonly done: Promise<BrowserWalletOutcome>;
      }
    | Refusal {
    const validated = validateBrowserWalletRequest(input);
    if (!validated.ok) return validated;
    if (!this.hasSession(validated.view.address)) {
      return refuse("not-signed-in", "Sign in with this wallet before using it.");
    }
    if (this.pending.size >= this.maxPending) {
      return refuse("busy", "Finish the open wallet requests first.");
    }
    const id = this.random(32).toString("base64url");
    let settle!: (outcome: BrowserWalletOutcome) => void;
    const done = new Promise<BrowserWalletOutcome>((resolve) => {
      settle = resolve;
    });
    const timer = this.setTimer(() => {
      this.finish(id, refuse("expired", "The wallet request expired."));
    }, this.ttlMs);
    this.pending.set(id, {
      view: validated.view,
      expiresAt: this.now() + this.ttlMs,
      returnToken: createHmac("sha256", this.secret)
        .update(`browser-wallet-return:${id}`)
        .digest("base64url"),
      timer,
      settle,
    });
    return { ok: true, id, done };
  }

  /** The request for the browser connector page, while it is pending. */
  claim(id: unknown): BrowserWalletClaim {
    const entry = this.lookup(id);
    if (!entry) return { ok: false, code: "unknown" };
    const expiresInMs = entry.expiresAt - this.now();
    if (expiresInMs <= 0) {
      this.finish(id as string, refuse("expired", "The wallet request expired."));
      return { ok: false, code: "expired" };
    }
    return {
      ok: true,
      request: entry.view,
      returnToken: entry.returnToken,
      expiresInMs,
    };
  }

  /**
   * Accepts the page's return link once for a live request with its return
   * token, after checking the result. Anything else is dropped.
   */
  complete(payload: unknown): boolean {
    if (!isBrowserWalletReturn(payload)) return false;
    const entry = this.lookup(payload.id);
    if (!entry || entry.expiresAt <= this.now()) return false;
    const expected = Buffer.from(entry.returnToken);
    const received = Buffer.from(payload.token);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return false;
    }
    if ("error" in payload) {
      const code = payload.error === "cancelled" ? "cancelled" : "rejected";
      this.finish(
        payload.id,
        refuse(code, sanitizeMessage(payload.message) ?? "The browser wallet did not complete the request."),
      );
      return true;
    }
    this.finish(
      payload.id,
      verifyResult(entry.view, payload.result)
        ? { ok: true, value: payload.result }
        : refuse("failed", "The browser wallet returned a result that does not match the request."),
    );
    return true;
  }

  /** Settles every pending request, e.g. when the app window goes away. */
  cancelAll(): void {
    for (const id of [...this.pending.keys()]) {
      this.finish(id, refuse("cancelled", "The wallet request was cancelled."));
    }
  }

  get size(): number {
    return this.pending.size;
  }

  private lookup(id: unknown): PendingRequest | undefined {
    return typeof id === "string" && ID_PATTERN.test(id)
      ? this.pending.get(id)
      : undefined;
  }

  private finish(id: string, outcome: BrowserWalletOutcome): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    this.clearTimer(entry.timer);
    entry.settle(outcome);
  }
}

type BrowserWalletReturn =
  | { readonly v: 2; readonly id: string; readonly token: string; readonly result: string }
  | {
      readonly v: 2;
      readonly id: string;
      readonly token: string;
      readonly error: string;
      readonly message?: string;
    };

/** True for a browser connector return link of the app-issued request format. */
export function isBrowserWalletReturnFormat(payload: unknown): boolean {
  return isRecord(payload) && payload["v"] === 2;
}

function isBrowserWalletReturn(payload: unknown): payload is BrowserWalletReturn {
  if (!isRecord(payload) || payload["v"] !== 2) return false;
  const keys = Object.keys(payload).sort().join(",");
  if (typeof payload["id"] !== "string" || typeof payload["token"] !== "string") {
    return false;
  }
  if (keys === "id,result,token,v") return typeof payload["result"] === "string";
  if (keys === "error,id,token,v" || keys === "error,id,message,token,v") {
    return (
      (payload["error"] === "cancelled" || payload["error"] === "rejected") &&
      (payload["message"] === undefined || typeof payload["message"] === "string")
    );
  }
  return false;
}

function sanitizeMessage(message: string | undefined): string | null {
  if (typeof message !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = message.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_ERROR_MESSAGE_CHARS
    ? `${cleaned.slice(0, MAX_ERROR_MESSAGE_CHARS)}…`
    : cleaned;
}

/** A signature must recover to the bound address; a hash must be well formed. */
function verifyResult(view: BrowserWalletRequestView, result: string): boolean {
  try {
    switch (view.method) {
      case "personal_sign":
        return (
          SIGNATURE_PATTERN.test(result) &&
          verifyMessage(getBytes(view.message), result).toLowerCase() === view.address
        );
      case SIGN_TYPED_DATA_V4: {
        if (!SIGNATURE_PATTERN.test(result)) return false;
        const parsed = parseTypedDataRequest([view.address, view.typedData]);
        return (
          verifyTypedData(
            parsed.domain as TypedDataDomain,
            parsed.types,
            parsed.message,
            result,
          ).toLowerCase() === view.address
        );
      }
      case "eth_sendTransaction":
        // A hash cannot be tied to the issued recipient, value and data
        // without reading the chain; the page sends exactly the issued fields.
        return TX_HASH_PATTERN.test(result) && isHexString(result, 32);
    }
  } catch {
    return false;
  }
}
