import { getAwsCredentials } from "@/lib/validator-page/awsCredentials";
import type { BucketObject } from "@/lib/validator-page/releasesBucket";
import { presignS3GetUrl } from "@/lib/validator-page/sigv4";

const FETCH_TIMEOUT_MS = 5_000;
const MAX_FEED_OBJECT_BYTES = 1024 * 1024;

export type BucketLocation = {
  readonly bucket: string;
  readonly region: string;
};

export function getReleaseObjectKey(version: string, fileName: string): string {
  return `releases/${version}/${fileName}`;
}

type PresignOptions = {
  readonly expiresInSeconds: number;
  readonly responseParams?: Readonly<Record<string, string>> | undefined;
};

/** Presigns a short-lived GET for one object in a private bucket. */
export async function presignBucketObject(
  { bucket, region }: BucketLocation,
  key: string,
  options: PresignOptions
): Promise<string> {
  return presignS3GetUrl({
    bucket,
    region,
    key,
    credentials: await getAwsCredentials(),
    expiresInSeconds: options.expiresInSeconds,
    responseParams: options.responseParams,
  });
}

/**
 * Reads one small object from a private bucket. A missing key is `missing`,
 * not an error: the role can list the bucket, so S3 answers 404 for it.
 */
export async function readBucketObject(
  location: BucketLocation,
  key: string
): Promise<BucketObject> {
  try {
    const url = await presignBucketObject(location, key, {
      expiresInSeconds: 60,
    });
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status === 404) {
      await response.body?.cancel();
      return { state: "missing" };
    }
    if (!response.ok) {
      await response.body?.cancel();
      return { state: "error", reason: `S3 answered ${response.status}` };
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
