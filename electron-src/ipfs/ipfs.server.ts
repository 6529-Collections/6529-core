import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import axios from "axios";
import { app } from "electron";
import FormData from "form-data";

export default class IPFSServer {
  private ipfsProcess: ChildProcess | null = null;
  private ipfsRepoPath: string;
  private ipfsPort: number;
  private rpcPort: number;
  private mfsPath: string = "/6529-Core";

  constructor(ipfsPort: number, rpcPort: number) {
    this.ipfsRepoPath = path.join(app.getPath("userData"), "ipfs-repo");
    this.ipfsPort = ipfsPort;
    this.rpcPort = rpcPort;
  }

  async init(appPort: number): Promise<void> {
    if (this.ipfsProcess) {
      console.log("IPFS daemon is already running.");
      return;
    }

    const platform = process.platform;
    const arch = process.arch;
    console.log("Starting IPFS daemon...", platform, arch);

    const ipfsBinaryPath = path.join(
      app.getAppPath(),
      "ipfs-binaries",
      platform,
      arch,
      "ipfs"
    );

    console.log("IPFS binary path:", ipfsBinaryPath);

    await this.configureIPFS(appPort);

    await this.resetBootstrapNodes(ipfsBinaryPath);

    this.ipfsProcess = spawn(ipfsBinaryPath, ["daemon", "--migrate"], {
      stdio: "pipe",
      env: { ...process.env, IPFS_PATH: this.ipfsRepoPath },
    });

    await this.waitForDaemon();

    await this.configureMFS();
  }

  private async waitForDaemon(): Promise<void> {
    return new Promise((resolve, reject) => {
      let initialized = false;

      this.ipfsProcess?.stdout?.on("data", async (data) => {
        const output = data.toString();
        console.log(`[IPFS] ${output}`);

        if (output.includes("Daemon is ready")) {
          initialized = true;
          console.log(
            `IPFS daemon fully initialized. Gateway on port ${this.ipfsPort}, RPC on port ${this.rpcPort}`
          );
          await this.verifyConnectivity();
          await this.connectToPublicGateways();
          resolve();
        }
      });

      this.ipfsProcess?.stderr?.on("data", (data) => {
        console.error(`[IPFS ERROR] ${data.toString()}`);
      });

      this.ipfsProcess?.on("error", (err) => {
        console.error("Failed to start IPFS daemon:", err);
        reject(err);
      });

      this.ipfsProcess?.on("close", (code) => {
        if (!initialized) {
          console.error(`IPFS daemon exited prematurely with code ${code}`);
          reject(new Error(`Daemon exited with code ${code}`));
        }
      });
    });
  }

  private async configureIPFS(appPort: number): Promise<void> {
    console.log("configureIPFS", appPort);
    const configFilePath = path.join(this.ipfsRepoPath, "config");
    const ipfsBinaryPath = path.join(
      app.getAppPath(),
      "ipfs-binaries",
      process.platform,
      process.arch,
      "ipfs"
    );

    // Initialize the repo if it doesn't exist
    if (!fs.existsSync(this.ipfsRepoPath)) {
      console.log("Initializing IPFS repo...");
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
    console.log(`Public IP Address: ${publicIP}`);

    // Update the configuration
    const config = JSON.parse(fs.readFileSync(configFilePath, "utf-8"));
    config.Addresses.API = `/ip4/127.0.0.1/tcp/${this.rpcPort}`;
    config.API.HTTPHeaders = {
      "Access-Control-Allow-Origin": ["*"],
      //   `http://localhost:${appPort}`,
      //   `http://localhost:3001`, // todo: remove this
      // ],
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
    config.Addresses.Announce = [`/ip4/${publicIP}/tcp/4001`];
    config.Addresses.NoAnnounce = [];
    config.Swarm.EnableAutoNATService = true;
    config.Swarm.DisableNatPortMap = false;

    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
    console.log(
      `IPFS config updated with Gateway port ${this.ipfsPort}, RPC port ${this.rpcPort}, and Public IP ${publicIP}.`
    );
  }

  private async resetBootstrapNodes(ipfsBinaryPath: string): Promise<void> {
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
          console.log("Default bootstrap nodes added successfully.");
          resolve();
        } else {
          console.error(`Failed to add bootstrap nodes. Exit code: ${code}`);
          reject(new Error(`Bootstrap process exited with code ${code}`));
        }
      });

      bootstrapProcess.on("error", (err) => {
        console.error("Error resetting bootstrap nodes:", err);
        reject(err);
      });
    });
  }

  private async getPublicIP(): Promise<string> {
    try {
      const response = await axios.get("https://api.ipify.org?format=json");
      return response.data.ip;
    } catch (error) {
      console.error("Failed to fetch public IP:", error);
      throw new Error("Unable to determine public IP address.");
    }
  }

  private async configureMFS(): Promise<void> {
    try {
      const baseDomain = `http://127.0.0.1:${this.rpcPort}`;
      await axios.post(
        `${baseDomain}/api/v0/files/mkdir?arg=${this.mfsPath}&parents=true`
      );
      console.log(`MFS directory ${this.mfsPath} configured.`);
    } catch (error: any) {
      console.error(
        `Failed to create MFS directory ${this.mfsPath}:`,
        error.response?.data || error.message
      );
      throw new Error(`MFS configuration failed: ${error.message}`);
    }
  }

  private async verifyConnectivity(): Promise<void> {
    try {
      const response = await axios.post(
        `http://127.0.0.1:${this.rpcPort}/api/v0/swarm/peers`
      );
      const peers = response.data.Peers || [];
      console.log(`Connected to ${peers.length} peers.`);
    } catch (error: any) {
      console.error(
        "Failed to verify IPFS connectivity:",
        error.response?.data || error.message
      );
      throw new Error("IPFS connectivity verification failed.");
    }
  }

  private async connectToPublicGateways(): Promise<void> {
    const publicGateways = [
      "/ip4/147.75.69.23/tcp/4001/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb",
    ];

    for (const address of publicGateways) {
      try {
        console.log(`Connecting to gateway: ${address}`);
        const response = await axios.post(
          `http://127.0.0.1:${this.rpcPort}/api/v0/swarm/connect?arg=${address}`
        );
        console.log(`Connected to gateway: ${address}`, response.data);
      } catch (error: any) {
        console.error(
          `Failed to connect to gateway ${address}:`,
          error.response?.data || error.message
        );
      }
    }
  }

  async shutdown(): Promise<void> {
    if (!this.ipfsProcess) {
      console.log("IPFS daemon is not running.");
      return;
    }

    return new Promise((resolve, reject) => {
      this.ipfsProcess?.on("close", (code) => {
        if (code === 0) {
          console.log("IPFS daemon stopped successfully.");
          this.ipfsProcess = null;
          resolve();
        } else {
          console.error(`IPFS daemon shutdown failed with code ${code}`);
          reject(new Error(`Daemon shutdown failed with code ${code}`));
        }
      });

      console.log("Stopping IPFS daemon...");
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
      console.log("File added to IPFS with CID:", cid);

      const fileName = path.basename(filePath);
      await axios.post(
        `${baseDomain}/api/v0/files/cp?arg=/ipfs/${cid}&arg=${this.mfsPath}/${fileName}`
      );

      console.log(`File added to MFS at ${this.mfsPath}/${fileName}`);
      return cid;
    } catch (error: any) {
      console.error(
        "Failed to add file to IPFS or MFS:",
        error.response?.data || error.message
      );
      throw error;
    }
  }
}
