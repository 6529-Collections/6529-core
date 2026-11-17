// The browser connector page's view of a wallet request issued by 6529
// Desktop. The page reads the request from the app's own server by the
// one-time id in its URL fragment; nothing else in the URL is trusted.
// Keep this module free of frontend dependencies: the Electron suite tests it.
import { formatEther } from "viem";

export const BROWSER_WALLET_REQUEST_PATH = "/_desktop/browser-wallet-request";
export const BROWSER_WALLET_REQUEST_HEADER = "x-6529-browser-connector";

const ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const HEX_PATTERN = /^0x(?:[0-9a-f]{2})*$/;
const QUANTITY_PATTERN = /^0x[0-9a-f]{1,64}$/;

export interface BrowserWalletPageTransaction {
  readonly from: string;
  readonly to: string;
  readonly value: string;
  readonly data: string;
}

export type BrowserWalletPageRequest =
  | {
      readonly method: "personal_sign";
      readonly address: string;
      readonly chainId: number;
      readonly message: string;
    }
  | {
      readonly method: "eth_signTypedData_v4";
      readonly address: string;
      readonly chainId: number;
      readonly typedData: string;
      readonly typedDataChainId: number | null;
    }
  | {
      readonly method: "eth_sendTransaction";
      readonly address: string;
      readonly chainId: number;
      readonly transaction: BrowserWalletPageTransaction;
    };

export interface BrowserWalletClaimResponse {
  readonly request: BrowserWalletPageRequest;
  readonly returnToken: string;
  readonly expiresInMs: number;
}

export type BrowserWalletRefusal =
  | "missing"
  | "unknown"
  | "expired"
  | "unavailable"
  | "malformed";

export interface BrowserWalletDetailRow {
  readonly label: string;
  readonly value: string;
  readonly monospace?: boolean;
}

export interface BrowserWalletDescription {
  readonly title: string;
  readonly rows: readonly BrowserWalletDetailRow[];
  readonly warnings: readonly string[];
  /** The network the browser wallet must be on, or null for any. */
  readonly requiredChainId: number | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isChainId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** The one-time request id from the page's URL fragment (`#request=`). */
export function readBrowserWalletRequestId(hash: string): string | null {
  const id = new URLSearchParams(hash.replace(/^#/, "")).get("request");
  return id && ID_PATTERN.test(id) ? id : null;
}

/** Copy for each reason the page shows nothing to sign. */
export function describeBrowserWalletRefusal(
  refusal: BrowserWalletRefusal
): string {
  switch (refusal) {
    case "expired":
      return "This wallet request has expired.";
    case "unavailable":
      return "6529 Desktop Classic could not be reached to load this wallet request.";
    case "missing":
    case "unknown":
    case "malformed":
      return "This wallet request was not issued by 6529 Desktop Classic, or it has already been used.";
  }
}

function parseTransaction(
  value: unknown,
  address: string
): BrowserWalletPageTransaction | null {
  if (!isRecord(value)) return null;
  const { from, to, value: amount, data } = value;
  return from === address &&
    typeof to === "string" &&
    ADDRESS_PATTERN.test(to) &&
    typeof amount === "string" &&
    QUANTITY_PATTERN.test(amount) &&
    typeof data === "string" &&
    HEX_PATTERN.test(data)
    ? { from, to, value: amount, data }
    : null;
}

function parseRequest(value: unknown): BrowserWalletPageRequest | null {
  if (!isRecord(value)) return null;
  const { method, address, chainId } = value;
  if (
    typeof address !== "string" ||
    !ADDRESS_PATTERN.test(address) ||
    !isChainId(chainId)
  ) {
    return null;
  }
  switch (method) {
    case "personal_sign":
      return typeof value["message"] === "string" &&
        HEX_PATTERN.test(value["message"])
        ? { method, address, chainId, message: value["message"] }
        : null;
    case "eth_signTypedData_v4": {
      const typedDataChainId = value["typedDataChainId"];
      return typeof value["typedData"] === "string" &&
        (typedDataChainId === null || isChainId(typedDataChainId))
        ? {
            method,
            address,
            chainId,
            typedData: value["typedData"],
            typedDataChainId,
          }
        : null;
    }
    case "eth_sendTransaction": {
      const transaction = parseTransaction(value["transaction"], address);
      return transaction ? { method, address, chainId, transaction } : null;
    }
    default:
      return null;
  }
}

/** Validates the app server's answer for a request id. */
export function parseBrowserWalletClaimResponse(
  value: unknown
): BrowserWalletClaimResponse | null {
  if (!isRecord(value)) return null;
  const request = parseRequest(value["request"]);
  const { returnToken, expiresInMs } = value;
  return request &&
    typeof returnToken === "string" &&
    TOKEN_PATTERN.test(returnToken) &&
    typeof expiresInMs === "number" &&
    Number.isFinite(expiresInMs) &&
    expiresInMs > 0
    ? { request, returnToken, expiresInMs }
    : null;
}

/** Reads the request for this page from the app server that served it. */
export async function fetchBrowserWalletRequest(
  id: string,
  fetchFn: typeof fetch = fetch
): Promise<
  | { readonly ok: true; readonly claim: BrowserWalletClaimResponse }
  | { readonly ok: false; readonly refusal: BrowserWalletRefusal }
> {
  let response: Response;
  try {
    response = await fetchFn(BROWSER_WALLET_REQUEST_PATH, {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        [BROWSER_WALLET_REQUEST_HEADER]: "1",
      },
      body: JSON.stringify({ id }),
    });
  } catch {
    return { ok: false, refusal: "unavailable" };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, refusal: "unavailable" };
  }
  if (!response.ok) {
    const error = isRecord(body) ? body["error"] : undefined;
    return {
      ok: false,
      refusal: error === "expired" ? "expired" : "unknown",
    };
  }
  const claim = parseBrowserWalletClaimResponse(body);
  return claim ? { ok: true, claim } : { ok: false, refusal: "malformed" };
}

export function browserWalletChainName(chainId: number): string {
  switch (chainId) {
    case 1:
      return "Ethereum";
    case 11155111:
      return "Sepolia (test network)";
    default:
      return `Chain ${chainId}`;
  }
}

/**
 * Control characters other than tab and line breaks, and bidi or zero-width
 * marks, could hide or reorder what the user reads.
 */
function isHiddenOrControl(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  if (code === 0x09 || code === 0x0a || code === 0x0d) return false;
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0xfeff
  );
}

/** The exact message text, or null when the bytes are not readable text. */
export function decodeBrowserWalletMessage(hex: string): string | null {
  if (!HEX_PATTERN.test(hex)) return null;
  const bytes = new Uint8Array((hex.length - 2) / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes
    );
  } catch {
    return null;
  }
  return [...text].some(isHiddenOrControl) ? null : text;
}

function formatTypedValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value, null, 2) ?? String(value);
}

function describeTypedData(
  request: Extract<
    BrowserWalletPageRequest,
    { method: "eth_signTypedData_v4" }
  >
): BrowserWalletDescription {
  let parsed: unknown;
  try {
    parsed = JSON.parse(request.typedData);
  } catch {
    parsed = null;
  }
  const rows: BrowserWalletDetailRow[] = [];
  const warnings: string[] = [];
  if (isRecord(parsed)) {
    rows.push({
      label: "Type",
      value: String(parsed["primaryType"]),
      monospace: true,
    });
    const domain = isRecord(parsed["domain"]) ? parsed["domain"] : {};
    if (typeof domain["name"] === "string") {
      rows.push({ label: "App", value: domain["name"] });
    }
    if (domain["version"] !== undefined) {
      rows.push({ label: "Version", value: formatTypedValue(domain["version"]) });
    }
    if (request.typedDataChainId !== null) {
      rows.push({
        label: "Network",
        value: browserWalletChainName(request.typedDataChainId),
      });
    }
    if (typeof domain["verifyingContract"] === "string") {
      rows.push({
        label: "Contract",
        value: domain["verifyingContract"],
        monospace: true,
      });
    }
    const message = isRecord(parsed["message"]) ? parsed["message"] : {};
    for (const [field, value] of Object.entries(message)) {
      rows.push({
        label: field,
        value: formatTypedValue(value),
        monospace: typeof value !== "string" || /^0x[0-9a-fA-F]+$/.test(value),
      });
    }
  } else {
    warnings.push("This typed data could not be read.");
  }
  return {
    title: "Sign typed data",
    rows,
    warnings,
    requiredChainId: request.typedDataChainId,
  };
}

/** What the page shows before the browser wallet is asked. */
export function describeBrowserWalletRequest(
  request: BrowserWalletPageRequest
): BrowserWalletDescription {
  switch (request.method) {
    case "personal_sign": {
      const text = decodeBrowserWalletMessage(request.message);
      return {
        title: "Sign a message",
        rows: [
          text === null
            ? { label: "Message (raw bytes)", value: request.message, monospace: true }
            : { label: "Message", value: text },
        ],
        warnings:
          text === null
            ? [
                "This message is not readable text. Sign it only if you know exactly what it is.",
              ]
            : [],
        requiredChainId: null,
      };
    }
    case "eth_signTypedData_v4":
      return describeTypedData(request);
    case "eth_sendTransaction": {
      const { transaction } = request;
      const hasCall = transaction.data !== "0x";
      const rows: BrowserWalletDetailRow[] = [
        { label: "Network", value: browserWalletChainName(request.chainId) },
        { label: "From", value: transaction.from, monospace: true },
        { label: "To", value: transaction.to, monospace: true },
        {
          label: "Value",
          value: `${formatEther(BigInt(transaction.value))} ETH`,
        },
        {
          label: "Function",
          value: hasCall
            ? `${transaction.data.slice(0, 10)} (not decoded)`
            : "None (plain ETH transfer)",
          monospace: hasCall,
        },
      ];
      if (hasCall) {
        rows.push({ label: "Data", value: transaction.data, monospace: true });
      }
      return {
        title: "Send a transaction",
        rows,
        warnings: hasCall
          ? [
              "This transaction calls a contract function that this page cannot decode. Approve it only if you started it in 6529 Desktop Classic and your wallet shows the same details.",
            ]
          : [],
        requiredChainId: request.chainId,
      };
    }
  }
}

export type BrowserWalletPageOutcome =
  | { readonly result: string }
  | { readonly error: "cancelled" | "rejected"; readonly message?: string };

/** The link that hands the outcome back to 6529 Desktop Classic. */
export function buildBrowserWalletReturnLink(
  scheme: string,
  id: string,
  returnToken: string,
  outcome: BrowserWalletPageOutcome
): string {
  const data = JSON.stringify({ v: 2, id, token: returnToken, ...outcome });
  return `${scheme}://connector?data=${encodeURIComponent(data)}`;
}
