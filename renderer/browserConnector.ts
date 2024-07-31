import { createConnector } from "@wagmi/core";
import { mainnet } from "viem/chains";

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
      }
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
        const url = `http://localhost:6529/app-wallet?task=connect&requestId=${requestId}`;

        parameters.openUrlFn(url);

        deepLinkCallbacks.set(requestId, async (response: any) => {
          if (response.error) {
            reject(new Error(response.error));
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

          return new Promise((resolve, reject) => {
            const requestId = generateRequestId();
            const encodedParams = encodeURIComponent(JSON.stringify(params));
            const url = `http://localhost:6529/app-wallet?task=provider&requestId=${requestId}&method=${method}&params=${encodedParams}`;

            parameters.openUrlFn(url);

            deepLinkCallbacks.set(requestId, (response: any) => {
              if (response.error) {
                reject(new Error(response.error));
              } else {
                resolve(response);
              }
            });

            setTimeout(() => {
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
    async switchChain() {
      //donthing
      return mainnet;
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
