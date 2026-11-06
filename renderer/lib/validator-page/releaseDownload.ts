import {
  getOfferedRelease,
  getReleaseFeedSnapshot,
  type ValidatorRelease,
} from "./releaseFeed";
import { getReleaseDownloadPath } from "./releaseFiles";

type ReleaseDownloadResult =
  | { readonly state: "found"; readonly url: string }
  | { readonly state: "not-found" }
  | { readonly state: "unavailable" };

function decodeSegment(segment: string | undefined): string | null {
  if (segment === undefined) {
    return null;
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * Only the newest release can be downloaded (the owner, 2026-11-01 and
 * 2026-11-04): an older test release stays in the feed and on the history
 * page, with its SHA-256, but its files are not handed out. A newest
 * release the feed lists as unsafe hands out none.
 */
function findRelease(
  releases: readonly ValidatorRelease[],
  segments: readonly string[]
): { release: ValidatorRelease; fileName: string } | null {
  const newest = getOfferedRelease(releases);
  if (!newest) {
    return null;
  }
  const listed = (fileName: string | null): fileName is string =>
    fileName !== null && newest.files.some((file) => file.name === fileName);
  if (segments.length === 1) {
    const fileName = decodeSegment(segments[0]);
    return listed(fileName) ? { release: newest, fileName } : null;
  }
  if (segments.length === 2) {
    const version = decodeSegment(segments[0]);
    const fileName = decodeSegment(segments[1]);
    return version === newest.version && listed(fileName)
      ? { release: newest, fileName }
      : null;
  }
  return null;
}

/**
 * Core: validate a local download route against the newest public release,
 * then hand off to the website. Its password gate and file signing stay on
 * the hosted server; Desktop never needs AWS credentials.
 */
export async function resolveReleaseDownload(
  segments: readonly string[]
): Promise<ReleaseDownloadResult> {
  const snapshot = await getReleaseFeedSnapshot();
  if (snapshot.state === "error") {
    return { state: "unavailable" };
  }
  const match = findRelease(snapshot.releases, segments);
  if (!match) {
    return { state: "not-found" };
  }
  return {
    state: "found",
    url: getReleaseDownloadPath(match.release, { name: match.fileName }),
  };
}
