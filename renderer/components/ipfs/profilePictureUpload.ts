import { getUserProfileHeaderMessage } from "@/components/user/user-page-header/user-page-header.messages";
import { uploadProfilePicture } from "@/services/api/profile-picture-upload-api";
import { addFileToIpfs, hasDesktopIpfsBridge } from "./IPFSContext";

/** A local upload failed and the editor can offer an explicit API retry. */
export class LocalProfilePictureUploadError extends Error {
  constructor(cause: unknown) {
    super(
      getUserProfileHeaderMessage(
        "user.profileHeader.edit.localPictureUploadFailed"
      ),
      { cause }
    );
    this.name = "LocalProfilePictureUploadError";
  }
}

/** Strip metadata through the native bridge before sending the file. */
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
