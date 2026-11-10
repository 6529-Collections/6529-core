import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { DesktopValidatorStatus } from "../shared/desktop-validator";

const DOWNLOAD_URL = "https://6529.io/validator";

interface ValidatorInstallation {
  readonly appPath: string;
  readonly cliPath: string;
}

function installationCandidates(): readonly ValidatorInstallation[] {
  if (process.platform === "darwin") {
    return ["/Applications", path.join(homedir(), "Applications")].map(
      (directory) => {
        const appPath = path.join(directory, "6529 Validator.app");
        return {
          appPath,
          cliPath: path.join(appPath, "Contents", "Resources", "validator"),
        };
      },
    );
  }
  if (process.platform === "win32") {
    // The MSI installs a 64-bit app. Its Start menu shortcut runs this exe
    // directly, and the installer gives the installing user access to status.
    const programFiles =
      process.env["ProgramW6432"] ?? process.env["ProgramFiles"];
    if (programFiles) {
      const directory = path.join(programFiles, "6529 Validator");
      return [
        {
          appPath: path.join(directory, "validator-app.exe"),
          cliPath: path.join(directory, "validator.exe"),
        },
      ];
    }
  }
  return [];
}

async function findInstallation(): Promise<ValidatorInstallation | undefined> {
  for (const candidate of installationCandidates()) {
    try {
      const [app, cli] = await Promise.all([
        stat(candidate.appPath),
        stat(candidate.cliPath),
      ]);
      if (
        cli.isFile() &&
        (process.platform === "darwin" ? app.isDirectory() : app.isFile())
      ) {
        return candidate;
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function interpretValidatorStatus(
  stdout: string,
  exitCode: string | number = 0,
): DesktopValidatorStatus {
  // Exit 3 can print an old snapshot. Exit 5 means live status with a warning.
  if (exitCode === 3) return "stopped";
  if (exitCode !== 0 && exitCode !== 5) return "unavailable";

  try {
    const snapshot = asRecord(JSON.parse(stdout));
    const signed = asRecord(snapshot?.["day"])?.["signed"];
    if (snapshot?.["format"] !== 1 || typeof signed !== "boolean") {
      return "unavailable";
    }
    return signed ? "signed" : "running";
  } catch {
    return "unavailable";
  }
}

async function readValidatorStatus(): Promise<DesktopValidatorStatus> {
  let installation: ValidatorInstallation | undefined;
  try {
    installation = await findInstallation();
  } catch {
    return "unavailable";
  }
  if (!installation) return "not-installed";

  return new Promise((resolve) => {
    execFile(
      installation.cliPath,
      ["status", "--json"],
      { timeout: 5000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        // A timeout cannot establish that the service stopped.
        resolve(
          interpretValidatorStatus(stdout, error ? (error.code ?? "error") : 0),
        );
      },
    );
  });
}

let pendingStatus: Promise<DesktopValidatorStatus> | undefined;

export function getDesktopValidatorStatus(): Promise<DesktopValidatorStatus> {
  pendingStatus ??= readValidatorStatus().finally(() => {
    pendingStatus = undefined;
  });
  return pendingStatus;
}

export async function openDesktopValidator(
  launcher: {
    openPath: (appPath: string) => Promise<string>;
    openExternal: (url: string) => Promise<void>;
  },
  locateInstallation = findInstallation,
): Promise<void> {
  const installation = await locateInstallation();
  if (!installation) {
    await launcher.openExternal(DOWNLOAD_URL);
    return;
  }

  // The standalone app handles the OS reopen event on macOS and its
  // single-instance activation on Windows.
  const openError = await launcher.openPath(installation.appPath);
  if (openError !== "") {
    throw new Error("6529 Validator could not be opened");
  }
}
