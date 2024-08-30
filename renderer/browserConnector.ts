import { createConnector } from "@wagmi/core";
import { mainnet, sepolia } from "viem/chains";

interface ProviderRequest {
  method: string;
  params?: any[];
}

interface ProviderResponse {
  result?: any;
  error?: string;
}

interface ConnectionObject {
  accounts: `0x${string}`[];
  chainId: number;
}

const CONNECTION_STORE = "seize-app-connection";

export function browserConnector(parameters: {
  openUrlFn: (url: string) => void;
  name: string;
  icon: string;
  id: string;
}) {
  const deepLinkCallbacks: Map<string, (response: ProviderResponse) => void> =
    new Map();

  let initialized = false;
  let scheme = "";
  let port = 6529;

  let connectionObject: ConnectionObject = {
    accounts: [],
    chainId: 1,
  };

  async function init() {
    if (!window || initialized) return;

    const storedConnection = await window.store.get(CONNECTION_STORE);
    if (storedConnection) {
      connectionObject = JSON.parse(storedConnection);
    }

    window.api.onWalletConnection((_event: any, data: any) => {
      const callback = deepLinkCallbacks.get(data.requestId);
      if (callback) {
        callback(data.data);
        deepLinkCallbacks.delete(data.requestId);
      } else {
        console.log("No callback found for requestId", data.requestId);
      }
    });

    window.api.getInfo().then((newInfo) => {
      scheme = newInfo.scheme;
      port = newInfo.port;
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
    type: "browser",
    async setup() {
      //donthing
    },
    async connect(params: {
      isReconnecting?: boolean;
    }): Promise<ConnectionObject> {
      console.log("Connect method called", params);
      await init();
      if (connectionObject.accounts.length > 0) {
        return connectionObject;
      }

      if (params.isReconnecting) {
        throw new Error(
          "Reconnection attempted, but no existing connection. Aborting."
        );
      }

      return new Promise((resolve, reject) => {
        const requestId = generateRequestId();
        const t = Date.now();
        const url = `http://localhost:${port}/app-wallet?task=connect&scheme=${scheme}&requestId=${requestId}&t=${t}`;

        parameters.openUrlFn(url);

        deepLinkCallbacks.set(requestId, async (response: any) => {
          if (!response || response.error) {
            reject(new Error(response?.error));
          } else {
            connectionObject = {
              accounts: response.accounts,
              chainId: response.chainId,
            };
            await window.store.set(
              CONNECTION_STORE,
              JSON.stringify(connectionObject)
            );
            resolve(connectionObject);
          }
        });

        setTimeout(() => {
          console.log("Deep link callback timed out", requestId);
          deepLinkCallbacks.delete(requestId);
          reject(new Error("Connection request timed out"));
        }, 60000);
      });
    },
    async disconnect() {
      deepLinkCallbacks.clear();
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
      await init();
      return {
        request: async ({ method, params }: ProviderRequest): Promise<any> => {
          console.log("Provider method called", method, params);

          if (method === "eth_chainId") {
            return this.getChainId();
          }

          return new Promise((resolve, reject) => {
            const requestId = generateRequestId();
            const encodedParams = encodeURIComponent(JSON.stringify(params));
            const t = Date.now();
            const url = `http://localhost:${port}/app-wallet?task=provider&scheme=${scheme}&requestId=${requestId}&t=${t}&method=${method}&params=${encodedParams}`;

            parameters.openUrlFn(url);

            deepLinkCallbacks.set(requestId, (response: any) => {
              if (!response || response.error) {
                reject(new Error(response?.error));
              } else {
                resolve(response);
              }
            });
            console.log("i am deepLinkCallbacks", deepLinkCallbacks);

            setTimeout(() => {
              console.log("Deep link callback timed out", requestId);
              deepLinkCallbacks.delete(requestId);
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
      console.log("Switch Chain method called", params.chainId);
      await init();
      const myChain = params.chainId === sepolia.id ? sepolia : mainnet;
      connectionObject.chainId = myChain.id;
      await window.store.set(
        CONNECTION_STORE,
        JSON.stringify(connectionObject)
      );
      console.log("Switched to chain", myChain.name);
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
