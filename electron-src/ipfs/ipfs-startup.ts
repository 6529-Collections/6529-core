// Startup sequence for the bundled IPFS node, kept free of Electron and
// child_process so its ordering can be tested on its own.
//
// Every Kubo CLI command takes the repository lock, so each one must finish
// before the next starts: `init` first, then the bootstrap commands one at a
// time, then the daemon.

export const IPFS_BOOTSTRAP_NODES: readonly string[] = [
  "/ip4/147.75.69.23/tcp/4001/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb",
  "/dns/api-ipfs.6529.io/tcp/4001/p2p/12D3KooWSxNuefKxYjTH9xBH2Nt6yVh9LLoaxoMf3KZwDnXmXKdB",
];

export const IPFS_INIT_TIMEOUT_MS = 60_000;
export const IPFS_COMMAND_TIMEOUT_MS = 30_000;

export type { IpfsStatus } from "../../shared/ipfs-status";

export class IpfsStartupCancelledError extends Error {
  constructor() {
    super("IPFS startup cancelled because the app is quitting");
    this.name = "IpfsStartupCancelledError";
  }
}

export interface IpfsStartupLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

export interface IpfsStartupSteps {
  /** True when the repository already has its config file. */
  isRepoInitialized(): boolean;
  /** Runs one Kubo CLI command to completion; rejects on a non-zero exit or timeout. */
  runCommand(args: readonly string[], timeoutMs: number): Promise<void>;
  /** Stops a daemon left running on this repository by an earlier session. */
  stopLeftoverDaemon(): Promise<void>;
  /** Writes the app's ports, CORS origin, routing and bootstrap list into the config. */
  writeConfig(): void;
  /** True when a daemon is already answering on the configured RPC port. */
  attachToRunningDaemon(): Promise<boolean>;
  /** Spawns the daemon and resolves once it reports that it is ready. */
  startDaemon(): Promise<void>;
  /** Import and pin the bundled WebUI after daemon migration/readiness. */
  ensureWebUi(): Promise<void>;
  isCancelled(): boolean;
  log: IpfsStartupLogger;
}

/** Stop the startup sequence before another step when the app is quitting. */
function throwIfCancelled(steps: IpfsStartupSteps): void {
  if (steps.isCancelled()) {
    throw new IpfsStartupCancelledError();
  }
}

/** Replace bootstrap peers sequentially to avoid overlapping repository locks. */
async function resetBootstrapNodes(steps: IpfsStartupSteps): Promise<void> {
  await steps.runCommand(["bootstrap", "rm", "--all"], IPFS_COMMAND_TIMEOUT_MS);
  for (const node of IPFS_BOOTSTRAP_NODES) {
    throwIfCancelled(steps);
    await steps.runCommand(["bootstrap", "add", node], IPFS_COMMAND_TIMEOUT_MS);
    steps.log.info(`[IPFS] Added bootstrap node: ${node}`);
  }
}

/** Initialize and configure the repository, then attach to or start its daemon. */
export async function runIpfsStartup(steps: IpfsStartupSteps): Promise<void> {
  if (!steps.isRepoInitialized()) {
    steps.log.info("[IPFS] Initializing repo...");
    await steps.runCommand(["init"], IPFS_INIT_TIMEOUT_MS);
  }
  throwIfCancelled(steps);

  await steps.stopLeftoverDaemon();
  throwIfCancelled(steps);

  steps.log.info("[IPFS] Resetting bootstrap nodes");
  try {
    await resetBootstrapNodes(steps);
  } catch (error) {
    if (error instanceof IpfsStartupCancelledError) {
      throw error;
    }
    // Not fatal: writeConfig below sets the same trusted list in the config file.
    steps.log.warn(
      "[IPFS] Resetting bootstrap nodes failed; the config file still lists only the trusted nodes",
      error,
    );
  }
  throwIfCancelled(steps);

  steps.writeConfig();

  if (await steps.attachToRunningDaemon()) {
    steps.log.info("[IPFS] Successfully attached to existing daemon.");
  } else {
    throwIfCancelled(steps);
    await steps.startDaemon();
  }
  throwIfCancelled(steps);
  await steps.ensureWebUi();
}

/** Watches daemon output for the readiness line, which can arrive split across chunks. */
export function createReadyLineDetector(
  marker = "Daemon is ready",
): (chunk: string) => boolean {
  let tail = "";
  return (chunk: string) => {
    const text = tail + chunk;
    if (text.includes(marker)) {
      tail = "";
      return true;
    }
    tail = text.slice(-(marker.length - 1));
    return false;
  };
}
