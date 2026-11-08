import { uploadProfilePicture } from "@/services/api/profile-picture-upload-api";
import { addFileToIpfs, hasDesktopIpfsBridge } from "./IPFSContext";

/**
 * Uploads a profile picture and resolves to the `ipfs://` URL saved as the
 * profile's `pfp_url`.
 *
 * 6529 Desktop pins the picture on the user's own local IPFS node (owner
 * decision, kept from before the web moved uploads to the API). It never falls
 * back to the API: with the node off or unavailable the upload fails. Outside
 * Desktop the website's path is unchanged, and the 6529 API checks and pins the
 * picture.
 */
export async function uploadProfilePictureFile(file: File): Promise<string> {
  if (hasDesktopIpfsBridge()) {
    return `ipfs://${await addFileToIpfs(file)}`;
  }
  return uploadProfilePicture(file);
}
