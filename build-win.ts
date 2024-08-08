import * as dotenv from "dotenv";
import { execSync } from "child_process";
import { resolve } from "path";
import * as fs from "fs";

dotenv.config();

console.log("Building Windows installer...");

const certificateFile = resolve(__dirname, process.env.CSC_LINK!);

if (!fs.existsSync(certificateFile)) {
  throw new Error(`Certificate file not found: ${certificateFile}`);
}

const command = `electron-builder --win --ia32 --x64 --arm64 --publish always`;
const env = {
  ...process.env,
  CSC_LINK: certificateFile,
  CSC_KEY_PASSWORD: process.env.CSC_KEY_PASSWORD,
};
execSync(command, { stdio: "inherit", env });
