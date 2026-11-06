import { cookies } from "next/headers";

import {
  hasValidatorAccess,
  VALIDATOR_ACCESS_COOKIE,
} from "@/lib/validator-page/accessGate";
import { resolveReleaseDownload } from "@/lib/validator-page/releaseDownload";

function plain(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

/**
 * /validator/download/<version>/<file>, or /validator/download/<file> for the
 * newest release. Core redirects to the hosted website, which enforces its
 * own access check and signs the download. Only listed files are forwarded.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const cookieStore = await cookies();
  if (!hasValidatorAccess(cookieStore.get(VALIDATOR_ACCESS_COOKIE)?.value)) {
    return plain(
      401,
      "Enter the password at https://6529.io/validator first.\n"
    );
  }
  const { path } = await params;
  const result = await resolveReleaseDownload(path);
  if (result.state === "unavailable") {
    return plain(
      503,
      "The release list is unavailable. Try again in a minute.\n"
    );
  }
  if (result.state === "not-found") {
    return plain(404, "No release has a file by that name.\n");
  }
  return new Response(null, {
    status: 302,
    headers: {
      "Cache-Control": "no-store",
      Location: result.url,
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
