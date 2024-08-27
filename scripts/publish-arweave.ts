import * as yaml from "js-yaml";
import { arweaveFileUploader } from "./arweave";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const BUCKET = "6529bucket";
const BUCKET_PATH = "6529-core-app";
const BASE_PATH = `https://${BUCKET}.s3.eu-west-1.amazonaws.com`;
const s3 = new S3Client({ region: "eu-west-1" });

async function fetchWithProgress(url: string) {
  const response = await fetch(url);
  const filePath = url.split("/").pop();

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }

  const contentLength = response.headers.get("content-length");
  const totalBytes = contentLength ? parseInt(contentLength, 10) : null;

  if (totalBytes === null) {
    console.log(
      "Unable to determine file size; progress tracking not available."
    );
  }

  const reader = response.body?.getReader();
  let receivedBytes = 0;
  const chunks: any[] = [];
  let lastLoggedPercent = 0;

  while (true) {
    const { done, value } = await reader!.read();

    if (done) {
      break;
    }

    chunks.push(value);
    receivedBytes += value.length;

    if (totalBytes !== null) {
      const percentComplete = (receivedBytes / totalBytes) * 100;

      if (percentComplete - lastLoggedPercent >= 10) {
        // Log every 10%
        lastLoggedPercent = Math.floor(percentComplete / 10) * 10;
        console.log(`${filePath} ${lastLoggedPercent}%`);
      }
    } else {
      console.log(`${filePath} ${receivedBytes} bytes`);
    }
  }

  const arrayBuffer = new Uint8Array(receivedBytes);
  let position = 0;
  for (let chunk of chunks) {
    arrayBuffer.set(chunk, position);
    position += chunk.length;
  }

  return Buffer.from(arrayBuffer.buffer);
}

async function arweaveUpload(file: string) {
  console.log("Downloading...", file);
  const fileBuffer = await fetchWithProgress(file);
  const contentType = "application/octet-stream";
  const { url } = await arweaveFileUploader.uploadFile(
    file,
    fileBuffer,
    contentType
  );
  console.log(`Uploaded ${file} at ${url}`);
  return { url };
}

function getFileName(url: string) {
  const filePath = url.split("/").pop();
  if (url.includes("/win/")) {
    if (filePath?.includes("x64")) {
      return "Windows x64 (recommended)";
    } else if (filePath?.includes("arm64")) {
      return "Windows ARM64";
    } else if (filePath?.includes("ia32")) {
      return "Windows x86";
    } else {
      return `Windows Universal (larger file)`;
    }
  } else if (url.includes("/mac/")) {
    if (filePath?.includes("x64")) {
      return "macOS Intel";
    } else if (filePath?.includes("arm64")) {
      return "macOS Silicon";
    }
  } else if (url.includes("/linux/")) {
    if (filePath?.endsWith("AppImage")) {
      return "Linux AppImage";
    } else if (filePath?.endsWith("deb")) {
      return "Linux Debian";
    } else if (filePath?.endsWith("rpm")) {
      return "Linux Red Hat";
    }
  }
  return filePath;
}

async function processNewVersion(platform: string, filePath: string) {
  console.log("Fetching latest version", platform, filePath);
  console.time(`${platform} Processing`);

  const url = `${BASE_PATH}/${BUCKET_PATH}/${platform}/${filePath}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }

  const data = await response.text();
  const yml: any = yaml.load(data);

  const files: string[] = [];
  yml.files.forEach((file: any) => {
    if (file.url.endsWith("zip")) {
      return;
    }
    files.push(`${BASE_PATH}/${BUCKET_PATH}/${platform}/${file.url}`);
  });

  console.log("Files processed", files.length);

  let newVersionContents = "";

  for (const file of files) {
    const fileName = getFileName(file);
    const { url } = await arweaveUpload(file);
    newVersionContents += `${fileName}\n`;
    newVersionContents += `${file}\n`;
    newVersionContents += `${url}\n\n`;
  }

  const newVersionKey = `${BUCKET_PATH}/${platform}/${yml.version}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: newVersionKey,
      Body: newVersionContents,
      ContentType: `text/plain`,
    })
  );
  console.timeEnd(`${platform} Processing`);
}

async function processAllPlatforms() {
  console.time("Total Processing");
  await Promise.all([
    processNewVersion("mac", "latest-mac.yml"),
    processNewVersion("linux", "latest-linux.yml"),
    processNewVersion("win", "latest.yml"),
  ]);
  console.timeEnd("Total Processing");
}

processAllPlatforms();
