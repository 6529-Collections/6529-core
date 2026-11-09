import { uploadProfilePicture } from "@/services/api/profile-picture-upload-api";
import { addFileToIpfs, hasDesktopIpfsBridge } from "./IPFSContext";

export class LocalProfilePictureUploadError extends Error {
  constructor(cause: unknown) {
    super("Local IPFS couldn’t upload this picture. You can retry through 6529.", {
      cause,
    });
    this.name = "LocalProfilePictureUploadError";
  }
}

async function sanitizeDesktopProfilePicture(file: File): Promise<File> {
  const result = await window.api.sanitizeProfilePicture(
    await file.arrayBuffer(),
  );
  if (!result.ok) {
    throw new Error(result.error);
  }
  return new File([result.bytes], result.fileName, { type: result.contentType });
}

/**
 * Uploads a profile picture and resolves to the `ipfs://` URL saved as the
 * profile's `pfp_url`.
 *
 * Desktop sanitizes the picture before sending it to either destination. It
 * uses the API if local IPFS is disabled or the user chooses to retry there.
 */
export async function uploadProfilePictureFile(
  file: File,
  retryVia6529 = false
): Promise<string> {
  if (!hasDesktopIpfsBridge()) return uploadProfilePicture(file);

  const sanitized = await sanitizeDesktopProfilePicture(file);
  if (retryVia6529) return uploadProfilePicture(sanitized);

  try {
    const info = await window.api.getIpfsInfo();
    if (info?.status !== "disabled") {
      return `ipfs://${await addFileToIpfs(sanitized)}`;
    }
  } catch (cause) {
    throw new LocalProfilePictureUploadError(cause);
  }
  return uploadProfilePicture(sanitized);
}
