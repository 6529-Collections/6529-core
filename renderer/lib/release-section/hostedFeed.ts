import { discardResponse } from "@/lib/fetch/fetchDeadline";
import {
  RELEASE_LIST_PAIR_HEADER,
  type SignedFeedSnapshot,
} from "@/lib/validator-page/feedResponse";

type Product = "desktop" | "ai";
type FeedObject = NonNullable<SignedFeedSnapshot["feed"]>;
type Failure = { readonly state: "error"; readonly reason: string };
type Missing = { readonly state: "missing" };
type Part =
  | {
      readonly state: "ok";
      readonly object: FeedObject;
      readonly pairId: string | undefined;
    }
  | Failure
  | Missing;

const FETCH_TIMEOUT_MS = 5_000;
const MAX_LIST_BYTES = 64 * 1024;
const MAX_SIGNATURE_BYTES = 1024;

async function readPart(url: string, maxBytes: number): Promise<Part> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      discardResponse(response);
      return response.status === 404
        ? { state: "missing" }
        : { state: "error", reason: `hosted feed answered ${response.status}` };
    }
    if (Number(response.headers.get("content-length")) > maxBytes) {
      discardResponse(response);
      return { state: "error", reason: "hosted feed object is too large" };
    }
    // Preserve signed bytes and cap allocation even for chunked responses.
    const body = new Uint8Array(maxBytes);
    let length = 0;
    const reader = response.body?.getReader();
    try {
      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value.byteLength > maxBytes - length) {
          void reader.cancel().catch(() => undefined);
          return { state: "error", reason: "hosted feed object is too large" };
        }
        body.set(value, length);
        length += value.byteLength;
      }
    } finally {
      reader?.releaseLock();
    }
    return {
      state: "ok",
      object: {
        body: body.subarray(0, length),
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      },
      pairId: response.headers.get(RELEASE_LIST_PAIR_HEADER) ?? undefined,
    };
  } catch (error) {
    return {
      state: "error",
      reason: error instanceof Error ? error.message : "hosted feed read failed",
    };
  }
}

type HostedPair =
  | {
      readonly state: "ok";
      readonly feed: FeedObject;
      readonly signature: FeedObject;
      readonly pairId?: string | undefined;
    }
  | Failure
  | Missing;

/** Read the exact public bytes for the caller to verify with its pinned keys. */
export async function readHostedReleasePair(
  product: Product
): Promise<HostedPair> {
  const url = `https://6529.io/${product}/releases.json`;
  const [feed, signature] = await Promise.all([
    readPart(url, MAX_LIST_BYTES),
    readPart(`${url}.sig`, MAX_SIGNATURE_BYTES),
  ]);
  if (feed.state === "error") return feed;
  if (signature.state === "error") return signature;
  if (feed.state === "missing" && signature.state === "missing") return feed;
  if (feed.state !== "ok" || signature.state !== "ok") {
    return { state: "error", reason: "the hosted feed or signature is missing" };
  }
  if (feed.pairId !== signature.pairId) {
    return { state: "error", reason: "the hosted feed and signature disagree" };
  }
  return {
    state: "ok",
    feed: feed.object,
    signature: signature.object,
    pairId: feed.pairId,
  };
}
