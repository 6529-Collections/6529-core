import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

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
  }
}

function signAllExecutables(): void {
  const dirPath = path.join(__dirname, "dist");

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

signAllExecutables();
