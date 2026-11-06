/**
 * Core adaptation: Desktop reads the public hosted feed, never the private
 * release bucket. Only the website has the IAM role needed to read that bucket.
 * Keep this transport when syncing the renderer from FE.
 */
const FETCH_TIMEOUT_MS = 5_000;
// The feed is a few kilobytes; refuse anything far larger.
const MAX_FEED_OBJECT_BYTES = 1024 * 1024;

export const FEED_OBJECT_KEY = "feed/releases.json";
export const FEED_SIGNATURE_OBJECT_KEY = "feed/releases.json.sig";

const HOSTED_FEED_URLS: Readonly<Record<string, string>> = {
  [FEED_OBJECT_KEY]: "https://6529.io/validator/releases.json",
  [FEED_SIGNATURE_OBJECT_KEY]: "https://6529.io/validator/releases.json.sig",
};

export type BucketObject =
  | {
      readonly state: "found";
      readonly body: Uint8Array<ArrayBuffer>;
      readonly etag: string | null;
      readonly lastModified: string | null;
    }
  | { readonly state: "missing" }
  | { readonly state: "error"; readonly reason: string };

/**
 * Reads only the two public feed objects, without visitor cookies or AWS
 * credentials. Retain the FE object shape and its existing cache/parser.
 */
export async function readReleaseObject(key: string): Promise<BucketObject> {
  const url = Object.hasOwn(HOSTED_FEED_URLS, key)
    ? HOSTED_FEED_URLS[key]
    : undefined;
  if (!url) {
    return { state: "missing" };
  }
  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status === 404) {
      await response.body?.cancel();
      return { state: "missing" };
    }
    if (!response.ok) {
      await response.body?.cancel();
      return {
        state: "error",
        reason: `hosted feed answered ${response.status}`,
      };
    }
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > MAX_FEED_OBJECT_BYTES) {
      return { state: "error", reason: "object is too large" };
    }
    return {
      state: "found",
      body,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
    };
  } catch (error) {
    return {
      state: "error",
      reason: error instanceof Error ? error.message : "unknown error",
    };
  }
}
