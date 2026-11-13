import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { DESKTOP_VALIDATOR_DOWNLOAD_URL } from "../shared/desktop-validator";
import type {
  DesktopValidatorHealth,
  DesktopValidatorNetworkAgreement,
  DesktopValidatorStatus,
} from "../shared/desktop-validator";

interface ValidatorInstallation {
  readonly appPath: string;
  readonly cliPath: string;
}

/** Resolve the standalone installers' standard app and CLI paths for this OS. */
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

/** Require both the launcher and status CLI before using an installation. */
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

export async function isDesktopValidatorInstalled(): Promise<boolean> {
  return (await findInstallation()) !== undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

const SECONDS_PER_DAY = 86_400;
const SIGNING_OFFSET_SECONDS = 15 * 60;
const PREPARING_STATES = new Set([
  "JOINING",
  "SYNCING",
  "LAUNCH",
  "AUTHORIZED",
  "COMPUTING_EARLIER",
  "COMPUTING",
]);

function getHealth(
  snapshot: Record<string, unknown>,
  dayState: unknown,
  exitCode: string | number,
): DesktopValidatorHealth {
  const update = asRecord(snapshot["update"]);
  const auto = asRecord(update?.["auto"]);
  const alerts = Array.isArray(snapshot["alerts"]) ? snapshot["alerts"] : [];
  const updateNeedsAttention = alerts.some((value: unknown) => {
    const alert = asRecord(value);
    return (
      alert?.["needs_you"] === true &&
      ["UPDATE_URGENT", "UPDATE_DEADLINE", "UNSAFE_RELEASE"].includes(
        String(alert["code"]),
      )
    );
  });
  if (
    updateNeedsAttention ||
    update?.["unsafe_reason"] ||
    (update?.["state"] === "URGENT" &&
      update["newer"] === true &&
      !update["latest_unsafe"] &&
      (auto?.["on"] !== true || auto["state"] === "BLOCKED"))
  ) {
    return "update-needed";
  }
  if (snapshot["signing_paused"] === true || dayState === "PAUSED")
    return "paused";
  if (typeof dayState === "string" && PREPARING_STATES.has(dayState))
    return "getting-ready";
  if (
    exitCode === 5 ||
    dayState === "MISSED" ||
    dayState === "DIFFERS" ||
    dayState === "ERROR"
  ) {
    return "needs-attention";
  }
  if (update?.["state"] === "AVAILABLE" || update?.["state"] === "URGENT") {
    if (update["newer"] === true && !update["latest_unsafe"])
      return "update-available";
  }
  if (
    snapshot["role"] === "WATCHER" ||
    dayState === "NO_KEY" ||
    dayState === "NOT_AUTHORIZED"
  ) {
    return "not-signing";
  }
  return "all-good";
}

function getNetworkAgreement(
  cycle: Record<string, unknown> | undefined,
  resultRoot: string | undefined,
): DesktopValidatorNetworkAgreement | undefined {
  const certificate = asRecord(cycle?.["certificate"]);
  const certificateRoot = certificate?.["cycle_root"];
  if (
    !certificate ||
    !resultRoot ||
    typeof certificateRoot !== "string" ||
    certificateRoot.toLowerCase() !== resultRoot.toLowerCase() ||
    certificate["cycle_day"] !== cycle?.["day"]
  ) {
    return undefined;
  }

  const signingAccounts = certificate["signing_accounts"];
  const signedWeight = certificate["signed_weight"];
  const countedWeight = certificate["w"];
  if (
    typeof signingAccounts !== "number" ||
    !Number.isSafeInteger(signingAccounts) ||
    signingAccounts < 0 ||
    typeof signedWeight !== "number" ||
    !Number.isSafeInteger(signedWeight) ||
    signedWeight < 0 ||
    typeof countedWeight !== "number" ||
    !Number.isSafeInteger(countedWeight) ||
    countedWeight <= 0 ||
    signedWeight > countedWeight
  ) {
    return undefined;
  }

  return { signingAccounts, signedTdhShare: signedWeight / countedWeight };
}

/** Keep the IPC response small and never expose cached signing as live. */
export function interpretValidatorStatus(
  stdout: string,
  exitCode: string | number = 0,
): DesktopValidatorStatus {
  // Exit 3 can print an old snapshot. Exit 5 means live status with a warning.
  if (exitCode === 3) return { service: "stopped" };
  if (exitCode !== 0 && exitCode !== 5) return { service: "unavailable" };

  try {
    const snapshot = asRecord(JSON.parse(stdout));
    const day = asRecord(snapshot?.["day"]);
    const signed = day?.["signed"];
    if (snapshot?.["format"] !== 1 || typeof signed !== "boolean") {
      return { service: "unavailable" };
    }
    const today = snapshot["today"];
    const cycles = snapshot["cycles"];
    const cycle =
      typeof today === "number" && Array.isArray(cycles)
        ? cycles.map(asRecord).find((record) => record?.["day"] === today)
        : undefined;
    const dayState = day?.["state"];
    const health = getHealth(snapshot, dayState, exitCode);
    const cycleKeys = cycle?.["keys"];
    const counted =
      signed &&
      (dayState === "IN_CERTIFICATE" ||
        (dayState === "FINAL" &&
          Array.isArray(cycleKeys) &&
          cycleKeys.some(
            (key: unknown) => asRecord(key)?.["in_certificate"] === true,
          )));
    const root = cycle?.["cycle_root"];
    const resultRoot =
      typeof root === "string" && /^0x[0-9a-f]{64}$/i.test(root)
        ? root
        : undefined;
    const networkAgreement = getNetworkAgreement(cycle, resultRoot);
    const release = snapshot["release"];
    const nextAt =
      typeof today === "number" && Number.isSafeInteger(today)
        ? (today + 1) * SECONDS_PER_DAY + SIGNING_OFFSET_SECONDS
        : undefined;
    const updateBy = snapshot["update_by_unix"];
    const updateDeadline = asRecord(snapshot["update"])?.["deadline_unix"];
    const canSignNext =
      signed &&
      snapshot["role"] === "SIGNER" &&
      (health === "all-good" || health === "update-available") &&
      nextAt !== undefined &&
      Number.isSafeInteger(nextAt) &&
      (typeof updateBy !== "number" || nextAt < updateBy) &&
      (typeof updateDeadline !== "number" || nextAt < updateDeadline);
    return {
      service: "running",
      health,
      release:
        typeof release === "string" && /^[\w.+-]{1,64}$/.test(release)
          ? release
          : undefined,
      signing: counted ? "counted" : signed ? "signed" : "not-signed",
      nextSignatureAt: canSignNext ? nextAt : undefined,
      resultRoot,
      ...(networkAgreement ? { networkAgreement } : {}),
    };
  } catch {
    return { service: "unavailable" };
  }
}

async function readValidatorStatus(): Promise<DesktopValidatorStatus> {
  let installation: ValidatorInstallation | undefined;
  try {
    installation = await findInstallation();
  } catch {
    return { service: "unavailable" };
  }
  if (!installation) return { service: "not-installed" };

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

/** Share in-flight status reads so simultaneous controls spawn one CLI call. */
export function getDesktopValidatorStatus(): Promise<DesktopValidatorStatus> {
  pendingStatus ??= readValidatorStatus().finally(() => {
    pendingStatus = undefined;
  });
  return pendingStatus;
}

/** Open the standalone app or send users without an installation to its download page. */
export async function openDesktopValidator(
  launcher: {
    openPath: (appPath: string) => Promise<string>;
    openExternal: (url: string) => Promise<void>;
  },
  locateInstallation = findInstallation,
): Promise<void> {
  const installation = await locateInstallation();
  if (!installation) {
    await launcher.openExternal(DESKTOP_VALIDATOR_DOWNLOAD_URL);
    return;
  }

  // The standalone app handles the OS reopen event on macOS and its
  // single-instance activation on Windows.
  const openError = await launcher.openPath(installation.appPath);
  if (openError !== "") {
    throw new Error("6529 Validator could not be opened");
  }
}
