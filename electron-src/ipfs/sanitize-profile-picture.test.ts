import assert from "node:assert/strict";
import { test } from "node:test";
import { crc32 } from "node:zlib";
import {
  describeImageContainer,
  type LosslessStripFormat,
} from "./profile-picture-metadata/lossless-metadata-strip";
import { sanitizeProfilePicture } from "./sanitize-profile-picture";

const privateText = Buffer.from("owner@example.invalid");

// One-pixel test images and a two-frame looping GIF.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z8AAAAMBAQCc479ZAAAAAElFTkSuQmCC",
  "base64",
);
const jpeg = Buffer.from(
  "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/" +
    "2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/" +
    "wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/" +
    "8QAFQEBAQAAAAAAAAAAAAAAAAAABgj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABykX//Z",
  "base64",
);
const gif = Buffer.from(
  "R0lGODlhGAAMAIAAAExpcf8AACH/C05FVFNDQVBFMi4wAwEBAAAh+QQFCAAAACwAAAAAGAAMAAACD4yPqcvtD6OctNqLs96wAAAh+QQFEAAAACwAAAAAGAAMAIBMaXEA/wACD4yPqcvtD6OctNqLs96wAAA7",
  "base64",
);
const webp = Buffer.from(
  "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=",
  "base64",
);

const pngText = Buffer.concat([Buffer.from("Author\0"), privateText]);
const pngTextChunk = Buffer.alloc(12 + pngText.length);
pngTextChunk.writeUInt32BE(pngText.length);
pngTextChunk.write("tEXt", 4);
pngText.copy(pngTextChunk, 8);
pngTextChunk.writeUInt32BE(
  crc32(pngTextChunk.subarray(4, -4)),
  pngTextChunk.length - 4,
);

const jpegComment = Buffer.from([0xff, 0xfe, 0, privateText.length + 2]);
// EXIF orientation 6 is display metadata and must survive.
const jpegOrientation = Buffer.from(
  "ffe1002245786966000049492a0008000000010012010300010000000600000000000000",
  "hex",
);
const gifComment = Buffer.from([0x21, 0xfe, privateText.length]);
const webpExif = Buffer.alloc(8 + privateText.length + (privateText.length % 2));
webpExif.write("EXIF");
webpExif.writeUInt32LE(privateText.length, 4);
privateText.copy(webpExif, 8);
const webpWithExif = Buffer.concat([webp, webpExif]);
webpWithExif.writeUInt32LE(webpWithExif.length - 8, 4);

const fixtures: ReadonlyArray<{
  format: LosslessStripFormat;
  input: Buffer;
  fileName: string;
  orientation: number;
}> = [
  {
    format: "png",
    input: Buffer.concat([png.subarray(0, -12), pngTextChunk, png.subarray(-12)]),
    fileName: "pfp.png",
    orientation: 1,
  },
  {
    format: "jpeg",
    input: Buffer.concat([
      jpeg.subarray(0, 2),
      jpegOrientation,
      jpegComment,
      privateText,
      jpeg.subarray(2),
    ]),
    fileName: "pfp.jpg",
    orientation: 6,
  },
  {
    format: "gif",
    input: Buffer.concat([
      gif.subarray(0, -1),
      gifComment,
      privateText,
      Buffer.from([0, 0x3b]),
    ]),
    fileName: "pfp.gif",
    orientation: 1,
  },
  {
    format: "webp",
    input: webpWithExif,
    fileName: "pfp.webp",
    orientation: 1,
  },
];

for (const { format, input, fileName, orientation } of fixtures) {
  test(`cleans ${format} profile pictures while preserving the render stream`, () => {
    const before = describeImageContainer(input, format);
    assert.ok(before.metadataBlocks.length > 0);
    const sanitized = sanitizeProfilePicture(Uint8Array.from(input).buffer);
    assert.ok(sanitized.ok);
    assert.equal(sanitized.fileName, fileName);
    assert.equal(sanitized.contentType, `image/${format}`);

    const cleaned = Buffer.from(sanitized.bytes);
    assert.equal(cleaned.includes(privateText), false);
    const after = describeImageContainer(cleaned, format);
    assert.deepEqual(after.metadataBlocks, []);
    assert.equal(after.renderDigest, before.renderDigest);
    assert.equal(after.orientation, orientation);
  });
}

test("rejects empty, oversized, unsupported and malformed input without returning upload bytes", () => {
  assert.deepEqual(sanitizeProfilePicture(null), {
    ok: false,
    error: "Select a profile picture to upload.",
  });
  for (const [input, expectedError] of [
    [new ArrayBuffer(0), /Select a profile picture/],
    [new ArrayBuffer(2 * 1024 * 1024 + 1), /too large/],
    [new TextEncoder().encode("<svg></svg>").buffer, /must be a PNG/],
    [Uint8Array.from(png.subarray(0, -12)).buffer, /could not be cleaned/],
  ] as const) {
    const result = sanitizeProfilePicture(input);
    assert.equal(result.ok, false);
    assert.match(result.error, expectedError);
    assert.equal("bytes" in result, false);
  }
});
