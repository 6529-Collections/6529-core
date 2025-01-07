import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import axios from "axios";
import { app } from "electron";
import FormData from "form-data";
import Logger from "electron-log";

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

export default class IPFSServer {
  private ipfsProcess: ChildProcess | null = null;
  private ipfsRepoPath: string;
  private ipfsPort: number;
  private rpcPort: number;
  private swarmPort: number;
  private mfsPath: string = "/6529-Core";

  constructor(ipfsPort: number, rpcPort: number, swarmPort: number) {
    this.ipfsRepoPath = path.join(app.getPath("userData"), "ipfs-repo");
    this.ipfsPort = ipfsPort;
    this.rpcPort = rpcPort;
    this.swarmPort = swarmPort;
  }

  async init(appPort: number): Promise<void> {
    Logger.info("[IPFS] Init", appPort);
    Logger.info("[IPFS] Swarm Port", this.swarmPort);

    if (this.ipfsProcess) {
      Logger.info("[IPFS] Daemon is already running.");
      return;
    }

    Logger.info("[IPFS] Starting daemon...", getOS(), process.arch);

    Logger.info("[IPFS] Is Packaged:", app.isPackaged);

    let ipfsBinaryPath;
    if (!app.isPackaged) {
      ipfsBinaryPath = path.join(
        app.getAppPath(),
        "ipfs-binaries",
        getOS(),
        process.arch,
        "ipfs"
      );
    } else {
      ipfsBinaryPath = path.join(
        process.resourcesPath,
        "ipfs-binaries",
        "ipfs"
      );
    }

    Logger.info("[IPFS] Binary path:", ipfsBinaryPath);

    await this.configureIPFS(appPort, ipfsBinaryPath);

    await this.resetBootstrapNodes(ipfsBinaryPath);

    const attached = await this.attachToDaemon();
    if (attached) {
      Logger.info("[IPFS] Successfully attached to existing daemon.");
      return;
    }

    Logger.info("[IPFS] Spawning a new daemon...");
    this.ipfsProcess = spawn(ipfsBinaryPath, ["daemon", "--migrate"], {
      stdio: "pipe",
      env: { ...process.env, IPFS_PATH: this.ipfsRepoPath },
    });

    await this.waitForDaemon();
  }

  private async attachToDaemon(): Promise<boolean> {
    const apiEndpoint = `http://127.0.0.1:${this.rpcPort}/api/v0`;

    try {
      const response = await axios.post(`${apiEndpoint}/id`);
      Logger.info("[IPFS] Found running daemon with ID:", response.data.ID);

      // Create a fake ChildProcess-like object
      this.ipfsProcess = {
        stdout: null,
        stderr: null,
        pid: -1, // Indicates an attached process
        kill: () => {
          Logger.info("[IPFS] Cannot kill attached process.");
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

  private async waitForDaemon(): Promise<void> {
    return new Promise((resolve, reject) => {
      let initialized = false;

      this.ipfsProcess?.stdout?.on("data", async (data) => {
        const output = data.toString();
        Logger.info(`[IPFS] ${output}`);

        if (output.includes("Daemon is ready")) {
          initialized = true;
          Logger.info(
            `[IPFS] Daemon fully initialized. Gateway on port ${this.ipfsPort}, RPC on port ${this.rpcPort}`
          );
          await this.verifyConnectivity();
          resolve();
        }
      });

      this.ipfsProcess?.stderr?.on("data", (data) => {
        Logger.error(`[IPFS] ${data.toString()}`);
      });

      this.ipfsProcess?.on("error", (err) => {
        Logger.error(`[IPFS] Failed to start daemon:`, err);
        reject(err);
      });

      this.ipfsProcess?.on("close", (code) => {
        if (!initialized) {
          Logger.error(`[IPFS] Daemon exited prematurely with code ${code}`);
          reject(new Error(`Daemon exited with code ${code}`));
        }
      });
    });
  }

  private async configureIPFS(
    appPort: number,
    ipfsBinaryPath: string
  ): Promise<void> {
    Logger.info(`[IPFS] Configuring`, appPort);
    const configFilePath = path.join(this.ipfsRepoPath, "config");

    // Initialize the repo if it doesn't exist
    if (!fs.existsSync(this.ipfsRepoPath)) {
      Logger.info("[IPFS] Initializing repo...");
      spawn(ipfsBinaryPath, ["init"], {
        env: { ...process.env, IPFS_PATH: this.ipfsRepoPath },
        stdio: "inherit",
      });
    }

    // Wait for the config file to be created
    while (!fs.existsSync(configFilePath)) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Fetch the public IP address dynamically
    const publicIP = await this.getPublicIP();
    Logger.info(`[IPFS] Public IP Address: ${publicIP}`);

    // Update the configuration
    const config = JSON.parse(fs.readFileSync(configFilePath, "utf-8"));
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
    config.Addresses.Gateway = `/ip4/0.0.0.0/tcp/${this.ipfsPort}`;
    config.Addresses.Announce = [];
    config.Addresses.NoAnnounce = [];
    config.Swarm.EnableAutoNATService = true;
    config.Swarm.DisableNatPortMap = false;
    config.Swarm.EnableRelayHop = true;
    config.Swarm.DisableRelay = false;
    config.Addresses.Swarm = [`/ip4/0.0.0.0/tcp/${this.swarmPort}`];
    config.Bootstrap = [
      "/ip4/147.75.69.23/tcp/4001/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb",
    ];

    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
    Logger.info(
      `[IPFS] Config updated with Gateway port ${this.ipfsPort}, RPC port ${this.rpcPort}, and Public IP ${publicIP}.`
    );
  }

  private async resetBootstrapNodes(ipfsBinaryPath: string): Promise<void> {
    Logger.info(`[IPFS] Resetting bootstrap nodes`);
    return new Promise((resolve, reject) => {
      const bootstrapProcess = spawn(
        ipfsBinaryPath,
        ["bootstrap", "add", "--default"],
        {
          stdio: "pipe",
          env: { ...process.env, IPFS_PATH: this.ipfsRepoPath },
        }
      );

      bootstrapProcess.on("close", (code) => {
        if (code === 0) {
          Logger.info(`[IPFS] Default bootstrap nodes added successfully.`);
          resolve();
        } else {
          Logger.error(
            `[IPFS] Failed to add bootstrap nodes. Exit code: ${code}`
          );
          reject(new Error(`Bootstrap process exited with code ${code}`));
        }
      });

      bootstrapProcess.on("error", (err) => {
        Logger.error(`[IPFS] Error resetting bootstrap nodes:`, err);
        reject(err);
      });
    });
  }

  private async getPublicIP(): Promise<string> {
    try {
      const response = await axios.get("https://api.ipify.org?format=json");
      return response.data.ip;
    } catch (error) {
      Logger.error(`[IPFS] Failed to fetch public IP:`, error);
      throw new Error("Unable to determine public IP address.");
    }
  }

  private async verifyConnectivity(): Promise<void> {
    try {
      const response = await axios.post(
        `http://127.0.0.1:${this.rpcPort}/api/v0/swarm/peers`
      );
      const peers = response.data.Peers || [];
      Logger.info(`[IPFS] Connected to ${peers.length} peers.`);
    } catch (error: any) {
      Logger.error(
        `[IPFS] Failed to verify connectivity:`,
        error.response?.data || error.message
      );
      throw new Error("IPFS connectivity verification failed.");
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

  async shutdown(): Promise<void> {
    if (!this.ipfsProcess) {
      Logger.info("[IPFS] Daemon is not running.");
      return;
    }

    return new Promise((resolve, reject) => {
      this.ipfsProcess?.on("close", (code) => {
        if (!code) {
          Logger.info("[IPFS] Daemon stopped successfully.");
          this.ipfsProcess = null;
          resolve();
        } else {
          Logger.error(`[IPFS] Daemon shutdown failed with code ${code}`);
          reject(new Error(`Daemon shutdown failed with code ${code}`));
        }
      });

      Logger.info("[IPFS] Stopping daemon...");
      this.ipfsProcess?.kill("SIGTERM");
    });
  }

  async addFile(filePath: string): Promise<string> {
    try {
      const fileStream = fs.createReadStream(filePath);
      const formData = new FormData();
      formData.append("file", fileStream);

      const baseDomain = `http://127.0.0.1:${this.rpcPort}`;

      const addResponse = await axios.post(
        `${baseDomain}/api/v0/add?pin=true`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
        }
      );

      const cid = addResponse.data.Hash;
      Logger.info("[IPFS] File added to IPFS with CID:", cid);

      const fileName = path.basename(filePath);
      await axios.post(
        `${baseDomain}/api/v0/files/cp?arg=/ipfs/${cid}&arg=${this.mfsPath}/${fileName}`
      );

      Logger.info(`[IPFS] File added to MFS at ${this.mfsPath}/${fileName}`);
      return cid;
    } catch (error: any) {
      Logger.error(
        `[IPFS] Failed to add file to IPFS or MFS:`,
        error.response?.data || error.message
      );
      throw error;
    }
  }
}
