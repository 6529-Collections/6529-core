import { createConnector } from "@wagmi/core";
import { ethers } from "ethers";
import { mainnet, sepolia } from "viem/chains";
import { SeedWalletRequest } from "../shared/types";
import { hexToString } from "./helpers";

interface ProviderRequest {
  method: string;
  params: any[];
}

interface ConnectionObject {
  accounts: `0x${string}`[];
  chainId: number;
}

const CONNECTION_STORE = "seize-app-connection-seed-wallet";

export function seedWalletConnector(parameters: {
  wallet: ethers.Wallet;
  name: string;
  icon: string;
  id: string;
}) {
  const pendingCallbacks: Map<string, (request: SeedWalletRequest) => void> =
    new Map();

  let initialized = false;

  let connectionObject: ConnectionObject = {
    accounts: [],
    chainId: 1,
  };

  async function handlePendingRequest(name: string, data: SeedWalletRequest) {
    const { method, params } = data;

    if (!connectionObject.accounts.length) {
      throw new Error("No accounts found in connection object");
    }

    switch (method) {
      case "personal_sign":
        const signature = await parameters.wallet.signMessage(
          hexToString(params?.[0])
        );
        return signature;
      case "eth_sendTransaction":
        console.log(`[${name}] Sending transaction`, params);
        const provider = new ethers.AnkrProvider({
          name: connectionObject.chainId === sepolia.id ? "sepolia" : "mainnet",
          chainId: connectionObject.chainId,
        });
        const txResponse = await provider.send(method, params ?? []);
        console.log(`[${name}] Transaction response`, txResponse);
        return txResponse;
    }
  }

  async function init(name: string) {
    if (!window || initialized) return;

    const storedConnection = await window.store.get(CONNECTION_STORE);
    if (storedConnection) {
      connectionObject = JSON.parse(storedConnection);
    }

    window.seedConnector.onConfirm((_event: any, data: SeedWalletRequest) => {
      const callback = pendingCallbacks.get(data.requestId);
      if (callback) {
        callback(data);
        pendingCallbacks.delete(data.requestId);
      } else {
        console.log(
          `[${name}] No callback found for requestId`,
          data.requestId
        );
      }
    });

    window.seedConnector.onCancel((_event: any, data: SeedWalletRequest) => {
      pendingCallbacks.delete(data.requestId);
    });

    initialized = true;
  }

  function generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  return createConnector((config) => ({
    get icon() {
      return parameters.icon;
    },
    get id() {
      return parameters.id;
    },
    get name() {
      return parameters.name;
    },
    get supportsSimulation() {
      return false;
    },
    type: "seed-wallet",
    async setup() {
      //do nothing
    },
    async connect(params: {
      isReconnecting?: boolean;
    }): Promise<ConnectionObject> {
      console.log(`[${this.name}] Seed Wallet Connect method called`, params);
      await init(this.name);
      if (connectionObject.accounts.length > 0) {
        return connectionObject;
      }

      if (params.isReconnecting) {
        throw new Error(
          "Reconnection attempted, but no existing connection. Aborting."
        );
      }

      connectionObject = {
        accounts: [parameters.wallet.address as `0x${string}`],
        chainId: 1,
      };
      await window.store.set(
        CONNECTION_STORE,
        JSON.stringify(connectionObject)
      );
      return connectionObject;
    },
    async disconnect() {
      connectionObject = {
        accounts: [],
        chainId: 1,
      };
      await window.store.remove(CONNECTION_STORE);
    },
    async getAccounts() {
      return connectionObject.accounts;
    },
    async getChainId() {
      return connectionObject.chainId;
    },
    async getProvider(): Promise<any> {
      await init(this.name);
      return {
        request: async ({ method, params }: ProviderRequest): Promise<any> => {
          console.log(`[${this.name}] Provider method called`, method, params);

          if (method === "eth_chainId") {
            return this.getChainId();
          }

          return new Promise((resolve, reject) => {
            const requestId = generateRequestId();
            const request: SeedWalletRequest = {
              requestId,
              from: connectionObject.accounts[0],
              method,
              params,
            };

            window.seedConnector.initRequest(request);
            pendingCallbacks.set(requestId, (request: any) => {
              try {
                const response = handlePendingRequest(this.name, request);
                resolve(response);
              } catch (error: any) {
                reject(new Error(error.message));
              }
            });

            setTimeout(() => {
              console.log(
                `[${this.name}] Pending callback timed out`,
                requestId
              );
              pendingCallbacks.delete(requestId);
              reject(new Error("Provider request timed out"));
            }, 60000);
          });
        },
      };
    },
    async isAuthorized() {
      return true;
    },
    async switchChain(params: { chainId: number }) {
      console.log(`[${this.name}] Switch Chain method called`, params.chainId);
      const myChain = params.chainId === sepolia.id ? sepolia : mainnet;
      connectionObject.chainId = myChain.id;
      await window.store.set(
        CONNECTION_STORE,
        JSON.stringify(connectionObject)
      );
      console.log(`[${this.name}] Switched to chain`, myChain.name);
      return myChain;
    },
    async onAccountsChanged(accounts) {
      //do nothing
    },
    onChainChanged(chain) {
      //do nothing
    },
    async onConnect(connectInfo) {
      //do nothing
    },
    async onDisconnect(error) {
      //do nothing
    },
  }));
}
