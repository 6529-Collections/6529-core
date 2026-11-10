import type { SanitizedProfilePicture } from "../../shared/preload-types";
import {
  stripMetadataLosslessly,
  type LosslessStripFormat,
} from "./profile-picture-metadata/lossless-metadata-strip";

// Match the web profile picture upload limit and format policy.
const MAX_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function detectFormat(bytes: Buffer): LosslessStripFormat | undefined {
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  const header = bytes.toString("latin1", 0, 12);
  if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) return "gif";
  if (header.startsWith("RIFF") && header.slice(8) === "WEBP") return "webp";
}

export function sanitizeProfilePicture(input: unknown): SanitizedProfilePicture {
  if (!(input instanceof ArrayBuffer) || input.byteLength === 0) {
    return { ok: false, error: "Select a profile picture to upload." };
  }
  if (input.byteLength > MAX_BYTES) {
    return { ok: false, error: "Profile picture is too large. The limit is 2 MB." };
  }
  const bytes = Buffer.from(input);
  const format = detectFormat(bytes);
  if (!format) {
    return {
      ok: false,
      error: "Profile picture must be a PNG, JPEG, GIF or WebP image.",
    };
  }
  try {
    const { output } = stripMetadataLosslessly(bytes, format);
    return {
      ok: true,
      bytes: Uint8Array.from(output).buffer,
      contentType: `image/${format}`,
      fileName: `pfp.${format === "jpeg" ? "jpg" : format}`,
    };
  } catch {
    return {
      ok: false,
      error:
        "This profile picture could not be cleaned of its metadata. Export it again as a standard PNG, JPEG, GIF or WebP image and retry.",
    };
  }
}
