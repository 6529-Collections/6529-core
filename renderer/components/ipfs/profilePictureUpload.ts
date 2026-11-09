import { uploadProfilePicture } from "@/services/api/profile-picture-upload-api";
import { addFileToIpfs, hasDesktopIpfsBridge } from "./IPFSContext";

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
 * 6529 Desktop sanitizes the picture before pinning it on the user's local IPFS
 * node. The upload requires the local node. The website uses the 6529 API to
 * check and pin the picture.
 */
export async function uploadProfilePictureFile(file: File): Promise<string> {
  if (hasDesktopIpfsBridge()) {
    return `ipfs://${await addFileToIpfs(await sanitizeDesktopProfilePicture(file))}`;
  }
  return uploadProfilePicture(file);
}
