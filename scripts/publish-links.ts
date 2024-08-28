import * as yaml from "js-yaml";
import { arweaveFileUploader } from "./arweave";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const BUCKET = "6529bucket";
const BUCKET_PATH = "6529-core-app";
const BASE_PATH = `https://${BUCKET}.s3.eu-west-1.amazonaws.com`;
const CF_PATH = "https://d3lqz0a4bldqgf.cloudfront.net";
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
      return "x64 (recommended)";
    } else if (filePath?.includes("arm64")) {
      return "ARM64";
    } else if (filePath?.includes("ia32")) {
      return "x86";
    } else {
      return `Universal (larger file)`;
    }
  } else if (url.includes("/mac/")) {
    if (filePath?.includes("x64")) {
      return "Intel";
    } else if (filePath?.includes("arm64")) {
      return "Silicon";
    }
  } else if (url.includes("/linux/")) {
    if (filePath?.endsWith("AppImage")) {
      return "AppImage";
    } else if (filePath?.endsWith("deb")) {
      return "Debian";
    } else if (filePath?.endsWith("rpm")) {
      return "Red Hat";
    }
  }
  return filePath;
}

function getTitle(platform: string, version: string) {
  if (platform === "mac") {
    return `6529 CORE v${version} for macOS`;
  } else if (platform === "win") {
    return `6529 CORE v${version} for Windows`;
  } else if (platform === "linux") {
    return `6529 CORE v${version} for Linux`;
  }
  return platform;
}

async function processNewVersion(
  platform: string,
  filePath: string,
  skipArweave: boolean
) {
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

  const title = getTitle(platform, yml.version);

  let htmlContent = `
    <div style="display: flex; align-items: center; gap: 1rem;">
      <img src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x1000/0x0c58ef43ff3032005e472cb5709f8908acb00205/0.WEBP" alt="6529 CORE" width="75" height="75">
      <h1>${title}</h1>
    </div>
  `;
  for (const file of files) {
    const fileName = getFileName(file);
    const cloudfront = `${CF_PATH}/${BUCKET_PATH}/${platform}/${file
      .split("/")
      .pop()}`;
    htmlContent += `<div style="padding-bottom: 15px;">`;
    htmlContent += `<h3>${fileName}</h3>`;
    htmlContent += `<div class="link-row">CloudFront: <a href="${cloudfront}" target="_blank">${cloudfront}</a></div>`;
    if (skipArweave) {
      htmlContent += `<div class="link-row">Arweave: Coming Soon...</div>`;
    } else {
      const { url } = await arweaveUpload(file);
      htmlContent += `<div class="link-row">Arweave: <a href="${url}" target="_blank">${url}</a></div>`;
    }

    htmlContent += `</div>`;
  }

  const htmlFile = `
    <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>${title}</title>
          <link rel="icon" href="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x60/0x0c58ef43ff3032005e472cb5709f8908acb00205/100.WEBP" />
          <style>
            body {
              background-color: black;
              color: white;
              font-size: larger;
              padding: 1rem;
            }
            a {
              color: white;
              word-break: break-all;
              overflow-wrap: anywhere;
              white-space: normal;
            }
            .link-row {
              padding-top: 0.2rem;
              padding-bottom: 0.2rem;
            }
          </style>
      </head>
      <body>
      <pre>
        ${htmlContent}
      </pre>
    </body>
    </html>
  `;

  const newVersionKey = `${BUCKET_PATH}/${platform}/links/${yml.version}.html`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: newVersionKey,
      Body: htmlFile,
      ContentType: `text/html`,
    })
  );

  console.log("Uploaded", `${BASE_PATH}/${newVersionKey}`);
  console.timeEnd(`${platform} Processing`);
}

async function processAllPlatforms(skipArweave: boolean) {
  console.time("Total Processing");
  await Promise.all([
    processNewVersion("mac", "latest-mac.yml", skipArweave),
    processNewVersion("linux", "latest-linux.yml", skipArweave),
    processNewVersion("win", "latest.yml", skipArweave),
  ]);
  console.timeEnd("Total Processing");
}

const skipArweave = process.argv.includes("--skip-arweave");
processAllPlatforms(skipArweave);
