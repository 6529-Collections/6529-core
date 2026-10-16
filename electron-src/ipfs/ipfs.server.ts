import axios from "axios";
import { ChildProcess, spawn } from "child_process";
import { app } from "electron";
import Logger from "electron-log";
import * as fs from "fs";
import * as path from "path";
import {
  createReadyLineDetector,
  IPFS_BOOTSTRAP_NODES,
  IpfsStartupCancelledError,
  IpfsStatus,
  runIpfsStartup,
} from "./ipfs-startup";

// The daemon normally reports ready within seconds; on a loaded machine it
// can take much longer, so this only bounds how long callers wait.
const IPFS_DAEMON_READY_TIMEOUT_MS = 180_000;
const IPFS_API_REQUEST_TIMEOUT_MS = 5_000;
const IPFS_LEFTOVER_STOP_TIMEOUT_MS = 15_000;

function getOS(): string {
  switch (process.platform) {
    case "darwin":
      return "mac";
    case "win32":
      return "win";
    case "linux":
      return "linux";
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

/** Yield between bounded probes while waiting for a leftover daemon to stop. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default class IPFSServer {
  private ipfsProcess: ChildProcess | null = null;
  private ipfsRepoPath: string;
  private ipfsPort: number;
  private rpcPort: number;
  private swarmPort: number;
  private mfsPath: string = "/6529-Desktop";
  private status: IpfsStatus = "stopped";
  private startup: Promise<IpfsStatus> | null = null;
  private shuttingDown = false;

  constructor(ipfsPort: number, rpcPort: number, swarmPort: number) {
    this.ipfsRepoPath = path.join(app.getPath("userData"), "ipfs-repo");
    this.ipfsPort = ipfsPort;
    this.rpcPort = rpcPort;
    this.swarmPort = swarmPort;
  }

  /** Return the current daemon state, including changes after startup settles. */
  getStatus(): IpfsStatus {
    return this.status;
  }

  /**
   * Starts IPFS once; later calls return the same result. Never rejects: a
   * failed step is logged and IPFS is marked unavailable, so the rest of the
   * app keeps working without it.
   */
  start(appPort: number): Promise<IpfsStatus> {
    if (!this.startup) {
      this.status = "starting";
      this.startup = this.init(appPort).then(
        () => {
          this.status = "ready";
          return this.status;
        },
        (error: unknown) => {
          if (error instanceof IpfsStartupCancelledError) {
            Logger.info(`[IPFS] ${error.message}`);
          } else {
            Logger.error(
              "[IPFS] Startup failed; continuing without IPFS:",
              error,
            );
          }
          this.status = "unavailable";
          return this.status;
        },
      );
    }
    return this.startup;
  }

  /**
   * Resolves once startup has finished, successfully or not, with the
   * current status: a daemon that became ready after the startup timeout,
   * or stopped after being ready, is reported as it is now.
   */
  async whenSettled(): Promise<IpfsStatus> {
    await this.startup;
    return this.status;
  }

  private getBinaryPath(): string {
    if (!app.isPackaged) {
      return path.join(
        app.getAppPath(),
        "ipfs-binaries",
        getOS(),
        process.arch,
        "ipfs",
      );
    }
    return path.join(process.resourcesPath, "ipfs-binaries", "ipfs");
  }

  /** Run ordered repository setup and daemon startup for this renderer port. */
  private async init(appPort: number): Promise<void> {
    Logger.info("[IPFS] Init", appPort);
    Logger.info("[IPFS] Swarm Port", this.swarmPort);
    Logger.info("[IPFS] Starting daemon...", getOS(), process.arch);
    Logger.info("[IPFS] Is Packaged:", app.isPackaged);

    const ipfsBinaryPath = this.getBinaryPath();
    Logger.info("[IPFS] Binary path:", ipfsBinaryPath);

    const configFilePath = path.join(this.ipfsRepoPath, "config");

    await runIpfsStartup({
      isRepoInitialized: () => fs.existsSync(configFilePath),
      runCommand: (args, timeoutMs) =>
        this.runCommand(ipfsBinaryPath, args, timeoutMs),
      stopLeftoverDaemon: () => this.stopLeftoverDaemon(),
      writeConfig: () => this.writeConfig(configFilePath, appPort),
      attachToRunningDaemon: () => this.attachToDaemon(),
      startDaemon: () => this.startDaemon(ipfsBinaryPath),
      isCancelled: () => this.shuttingDown,
      log: Logger,
    });
  }

  /** Run one repository command with bounded duration and captured error output. */
  private runCommand(
    ipfsBinaryPath: string,
    args: readonly string[],
    timeoutMs: number,
  ): Promise<void> {
    const name = `ipfs ${args.join(" ")}`;
    return new Promise((resolve, reject) => {
      const child = spawn(ipfsBinaryPath, [...args], {
        stdio: ["ignore", "ignore", "pipe"],
        env: { ...process.env, IPFS_PATH: this.ipfsRepoPath },
        windowsHide: true,
      });
      let stderr = "";
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error(`${name} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stderr?.on("data", (data) => {
        stderr = (stderr + data.toString()).slice(-2000);
      });
      child.once("error", (error) => finish(error));
      child.once("close", (code) => {
        if (code === 0) {
          finish();
        } else {
          finish(
            new Error(
              `${name} exited with code ${code}${
                stderr.trim() ? `: ${stderr.trim()}` : ""
              }`,
            ),
          );
        }
      });
    });
  }

  /** Apply the app's loopback endpoints, renderer origin and trusted peers. */
  private writeConfig(configFilePath: string, appPort: number): void {
    Logger.info(`[IPFS] Configuring`, appPort);
    const config = JSON.parse(fs.readFileSync(configFilePath, "utf-8"));

    // Configure RPC (API) port and HTTP headers
    config.Addresses.API = `/ip4/127.0.0.1/tcp/${this.rpcPort}`;
    config.API.HTTPHeaders = {
      "Access-Control-Allow-Origin": [`http://localhost:${appPort}`],
      "Access-Control-Allow-Methods": [
        "GET",
        "POST",
        "OPTIONS",
        "PUT",
        "DELETE",
      ],
      "Access-Control-Allow-Headers": [
        "Authorization",
        "Content-Type",
        "X-Requested-With",
      ],
    };

    // Configure Gateway. WebUI disables browse-by-CID when the configured host
    // is only a bind address like 0.0.0.0, so advertise the loopback endpoint.
    config.Addresses.Gateway = `/ip4/127.0.0.1/tcp/${this.ipfsPort}`;
    config.Addresses.Swarm = [`/ip4/0.0.0.0/tcp/${this.swarmPort}`];
    config.Addresses.Announce = [];
    config.Addresses.NoAnnounce = [];

    // Disable dynamic peer discovery & NAT features to avoid Malwarebytes Trojan blocks
    config.Swarm.EnableAutoNATService = false;
    config.Swarm.DisableNatPortMap = true;
    config.Swarm.EnableRelayHop = false;
    config.Swarm.DisableRelay = true;
    config.Discovery = {
      MDNS: { Enabled: false },
    };
    config.Routing = {
      Type: "none",
    };

    // Set only our trusted bootstrap nodes here
    config.Bootstrap = [...IPFS_BOOTSTRAP_NODES];

    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
    Logger.info(
      `[IPFS] Config updated with Gateway port ${this.ipfsPort} and RPC port ${this.rpcPort}.`,
    );
  }

  /**
   * A daemon from a session that ended without a clean quit keeps the
   * repository lock, and a new daemon cannot start until it is gone. Kubo
   * records the running daemon's RPC address in the repository's `api` file.
   */
  private async stopLeftoverDaemon(): Promise<void> {
    const apiFile = path.join(this.ipfsRepoPath, "api");
    if (!fs.existsSync(apiFile)) {
      return;
    }
    const match = fs
      .readFileSync(apiFile, "utf-8")
      .trim()
      .match(/^\/ip4\/127\.0\.0\.1\/tcp\/(\d+)$/);
    if (!match) {
      return;
    }
    const endpoint = `http://127.0.0.1:${match[1]}/api/v0`;
    try {
      await axios.post(`${endpoint}/shutdown`, null, {
        timeout: IPFS_API_REQUEST_TIMEOUT_MS,
      });
    } catch {
      // Nothing answered: the file is stale.
      return;
    }
    Logger.info("[IPFS] Stopping a daemon left running by an earlier session");
    const deadline = Date.now() + IPFS_LEFTOVER_STOP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await delay(500);
      try {
        await axios.post(`${endpoint}/id`, null, {
          timeout: IPFS_API_REQUEST_TIMEOUT_MS,
        });
      } catch {
        return;
      }
    }
    throw new Error("A daemon from an earlier session did not stop");
  }

  /** Reuse an answering daemon on the configured local API endpoint. */
  private async attachToDaemon(): Promise<boolean> {
    const apiEndpoint = `http://127.0.0.1:${this.rpcPort}/api/v0`;

    try {
      const response = await axios.post(`${apiEndpoint}/id`, null, {
        timeout: IPFS_API_REQUEST_TIMEOUT_MS,
      });
      Logger.info("[IPFS] Found running daemon with ID:", response.data.ID);

      // Create a fake ChildProcess-like object
      this.ipfsProcess = {
        stdout: null,
        stderr: null,
        pid: -1, // Indicates an attached process
        kill: () => {
          Logger.info("[IPFS] Attached daemon does not emit 'kill'.");
        },
        on: (event: string, _: any) => {
          if (event === "close") {
            Logger.warn("[IPFS] Attached daemon does not emit 'close'.");
          }
        },
      } as unknown as ChildProcess;

      return true;
    } catch (error) {
      Logger.info("[IPFS] No running daemon found to attach.");
      return false;
    }
  }

  /** Await daemon readiness with a timeout while tracking late readiness and exit. */
  private startDaemon(ipfsBinaryPath: string): Promise<void> {
    Logger.info("[IPFS] Spawning a new daemon...");
    const daemon = spawn(ipfsBinaryPath, ["daemon", "--migrate"], {
      stdio: "pipe",
      env: { ...process.env, IPFS_PATH: this.ipfsRepoPath },
      windowsHide: true,
    });
    this.ipfsProcess = daemon;

    return new Promise((resolve, reject) => {
      let ready = false;
      let settled = false;
      const isReadyLine = createReadyLineDetector();
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        // Leave the daemon running: if it becomes ready later it is used, and
        // it is stopped with the app either way.
        reject(
          new Error(
            `IPFS daemon not ready after ${IPFS_DAEMON_READY_TIMEOUT_MS}ms`,
          ),
        );
      }, IPFS_DAEMON_READY_TIMEOUT_MS);

      daemon.stdout?.on("data", (data) => {
        const output = data.toString();
        Logger.info(`[IPFS] ${output}`);

        if (!ready && isReadyLine(output)) {
          ready = true;
          clearTimeout(timer);
          Logger.info(
            `[IPFS] Daemon fully initialized. Gateway on port ${this.ipfsPort}, RPC on port ${this.rpcPort}`,
          );
          if (settled) {
            Logger.info("[IPFS] Daemon became ready after the startup timeout");
            this.status = "ready";
          } else {
            settled = true;
            resolve();
          }
          void this.logPeerCount();
        }
      });

      daemon.stderr?.on("data", (data) => {
        Logger.error(`[IPFS] ${data.toString()}`);
      });

      daemon.once("error", (err) => {
        Logger.error(`[IPFS] Failed to start daemon:`, err);
        clearTimeout(timer);
        if (this.ipfsProcess === daemon) {
          this.ipfsProcess = null;
        }
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      daemon.once("close", (code) => {
        clearTimeout(timer);
        if (this.ipfsProcess === daemon) {
          this.ipfsProcess = null;
        }
        if (!ready) {
          Logger.error(`[IPFS] Daemon exited prematurely with code ${code}`);
        } else if (!this.shuttingDown) {
          Logger.error(`[IPFS] Daemon exited with code ${code}`);
          this.status = "unavailable";
        }
        if (!settled) {
          settled = true;
          reject(new Error(`Daemon exited with code ${code}`));
        }
      });
    });
  }

  /** Log the connected peer count without failing startup when its probe fails. */
  private async logPeerCount(): Promise<void> {
    try {
      const response = await axios.post(
        `http://127.0.0.1:${this.rpcPort}/api/v0/swarm/peers`,
        null,
        { timeout: IPFS_API_REQUEST_TIMEOUT_MS },
      );
      const peers = response.data.Peers || [];
      Logger.info(`[IPFS] Connected to ${peers.length} peers.`);
    } catch (error: any) {
      Logger.warn(
        `[IPFS] Could not read the peer list:`,
        error.response?.data || error.message,
      );
    }
  }

  getApiEndpoint(): string {
    return `http://127.0.0.1:${this.rpcPort}`;
  }

  getGatewayEndpoint(): string {
    return `http://127.0.0.1:${this.ipfsPort}`;
  }

  getMfsPath(): string {
    return this.mfsPath;
  }

  /** Stop the owned or attached daemon and cancel any remaining startup steps. */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    const daemon = this.ipfsProcess;
    if (!daemon) {
      Logger.info("[IPFS] Daemon is not running.");
      return;
    }

    if (daemon.pid === -1) {
      // Attached to an existing daemon, use API shutdown instead of killing process
      Logger.info("[IPFS] Attempting to shut down attached daemon via API...");
      try {
        await axios.post(
          `http://127.0.0.1:${this.rpcPort}/api/v0/shutdown`,
          null,
          { timeout: IPFS_API_REQUEST_TIMEOUT_MS },
        );
        Logger.info("[IPFS] Attached daemon shut down successfully.");
        this.ipfsProcess = null;
      } catch (error) {
        Logger.error("[IPFS] Failed to shut down attached daemon:", error);
      }
      return;
    }

    if (daemon.exitCode !== null || daemon.signalCode !== null) {
      this.ipfsProcess = null;
      return;
    }

    return new Promise((resolve, reject) => {
      daemon.once("close", (code) => {
        this.ipfsProcess = null;
        if (!code) {
          Logger.info("[IPFS] Daemon stopped successfully.");
          resolve();
        } else {
          Logger.error(`[IPFS] Daemon shutdown failed with code ${code}`);
          reject(new Error(`Daemon shutdown failed with code ${code}`));
        }
      });

      Logger.info("[IPFS] Stopping daemon...");
      daemon.kill("SIGTERM");
    });
  }
}
