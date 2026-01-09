import { execSync } from "child_process";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  AZURE_KEY_VAULT_URL,
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
  AZURE_TENANT_ID,
  CERT_NAME,
} = process.env;

function signExecutable(filePath: string): void {
  const command =
    `azuresigntool sign --azure-key-vault-url "${AZURE_KEY_VAULT_URL}" ` +
    `--azure-key-vault-client-id "${AZURE_CLIENT_ID}" ` +
    `--azure-key-vault-client-secret "${AZURE_CLIENT_SECRET}" ` +
    `--azure-key-vault-tenant-id "${AZURE_TENANT_ID}" ` +
    `--azure-key-vault-certificate "${CERT_NAME}" ` +
    `--timestamp-rfc3161 "http://timestamp.digicert.com" ` +
    `"${filePath}"`;

  console.log(`Signing ${filePath}...`);
  try {
    execSync(command, { stdio: "inherit" });
    console.log(`${filePath} signed successfully!`);
  } catch (error) {
    console.error(`Failed to sign ${filePath}:`, error);
    throw error;
  }
}

function signIpfsBinaries(): void {
  console.log("Signing IPFS binaries...");
  const ipfsBinariesDir = path.join(__dirname, "../ipfs-binaries/win");

  if (!fs.existsSync(ipfsBinariesDir)) {
    console.warn(`IPFS binaries directory not found: ${ipfsBinariesDir}`);
    return;
  }

  const architectures = ["x64", "arm64"];

  for (const arch of architectures) {
    const ipfsPath = path.join(ipfsBinariesDir, arch, "ipfs.exe");

    if (fs.existsSync(ipfsPath)) {
      signExecutable(ipfsPath);
    } else {
      console.warn(`IPFS binary not found: ${ipfsPath}`);
    }
  }

  console.log("All IPFS binaries signed successfully!");
}

function signDistExecutables(): void {
  console.log("Signing dist executables...");
  const dirPath = path.join(__dirname, "../dist");

  if (fs.existsSync(dirPath)) {
    const files = fs
      .readdirSync(dirPath)
      .map((file) => path.join(dirPath, file));

    files.forEach((file) => {
      if (file.endsWith(".exe")) {
        signExecutable(file);
      }
    });
  } else {
    console.warn(`Directory not found: ${dirPath}`);
  }
}

const args = process.argv.slice(2);

if (args.includes("--ipfs")) {
  signIpfsBinaries();
} else {
  signDistExecutables();
}
