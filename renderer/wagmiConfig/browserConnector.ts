import { setAuthJwt } from "@/services/auth/auth.utils";
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
  let scheme = "core6529";
  let port = 6529;

  let connectionObject: ConnectionObject = {
    accounts: [],
    chainId: 1,
  };

  async function init(name: string) {
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
        console.log(
          `[${name}] No callback found for requestId`,
          data.requestId
        );
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

  return createConnector((_config) => ({
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
    async connect(opts?: {
      isReconnecting?: boolean;
      chainId?: number;
      withCapabilities?: boolean;
    }) {
      console.log(`[${this.name}] Browser Connect method called`, opts);
      await init(this.name);

      // Return existing connection if chain matches (or none requested)
      if (
        connectionObject.accounts.length > 0 &&
        (!opts?.chainId || connectionObject.chainId === opts.chainId)
      ) {
        if (opts?.withCapabilities) {
          const accountsWithCaps = connectionObject.accounts.map((address) => ({
            address,
            capabilities: {} as Record<string, unknown>,
          })) as unknown as readonly {
            address: `0x${string}`;
            capabilities: Record<string, unknown>;
          }[];

          return {
            accounts: accountsWithCaps as any,
            chainId: connectionObject.chainId,
          } as any;
        }

        return {
          accounts: connectionObject.accounts as readonly `0x${string}`[],
          chainId: connectionObject.chainId,
        } as any;
      }

      if (opts?.isReconnecting) {
        throw new Error(
          "Reconnection attempted, but no existing connection. Aborting."
        );
      }

      return new Promise((resolve, reject) => {
        const requestId = generateRequestId();
        const t = Date.now();
        const chainId = opts?.chainId || connectionObject.chainId;
        const url = `http://localhost:${port}/browser-connector?task=connect&scheme=${scheme}&requestId=${requestId}&t=${t}&chainId=${chainId}`;

        parameters.openUrlFn(url);

        deepLinkCallbacks.set(requestId, async (response: any) => {
          if (!response || response.error) {
            reject(new Error(response?.error));
          } else {
            connectionObject = {
              accounts: response.accounts,
              chainId: response.chainId,
            };
            const auth = response.auth;
            setAuthJwt(auth.address, auth.token, auth.refreshToken, auth.role);
            await window.store.set(
              CONNECTION_STORE,
              JSON.stringify(connectionObject)
            );

            if (opts?.withCapabilities) {
              const accountsWithCaps = (
                response.accounts as `0x${string}`[]
              ).map((address) => ({
                address,
                capabilities: {} as Record<string, unknown>,
              })) as unknown as readonly {
                address: `0x${string}`;
                capabilities: Record<string, unknown>;
              }[];

              resolve({
                accounts: accountsWithCaps as any,
                chainId: response.chainId,
              } as any);
              return;
            }

            resolve({
              accounts: response.accounts as readonly `0x${string}`[],
              chainId: response.chainId,
            } as any);
          }
        });

        setTimeout(() => {
          console.log(`[${this.name}] Deep link callback timed out`, requestId);
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
      await init(this.name);
      return {
        request: async ({ method, params }: ProviderRequest): Promise<any> => {
          console.log(`[${this.name}] Provider method called`, method, params);

          if (method === "eth_chainId") {
            return this.getChainId();
          }

          return new Promise((resolve, reject) => {
            const requestId = generateRequestId();
            const encodedParams = encodeURIComponent(JSON.stringify(params));
            const t = Date.now();
            const url = `http://localhost:${port}/browser-connector?task=provider&scheme=${scheme}&requestId=${requestId}&t=${t}&method=${method}&params=${encodedParams}`;

            parameters.openUrlFn(url);

            deepLinkCallbacks.set(requestId, (response: any) => {
              if (!response || response.error) {
                reject(new Error(response?.error));
              } else {
                resolve(response);
              }
            });

            setTimeout(() => {
              console.log(
                `[${this.name}] Deep link callback timed out`,
                requestId
              );
              deepLinkCallbacks.delete(requestId);
              reject(new Error("Provider request timed out"));
            }, 60000);
          });
        },
      };
    },
    async isAuthorized() {
      return !!connectionObject.accounts.length;
    },
    async switchChain(params: { chainId: number }) {
      console.log(`[${this.name}] Switch Chain method called`, params.chainId);
      await this.connect({
        chainId: params.chainId,
      });
      return connectionObject.chainId === sepolia.id ? sepolia : mainnet;
    },
    async onAccountsChanged(_accounts) {
      //do nothing
    },
    onChainChanged(_chain) {
      //do nothing
    },
    async onConnect(_connectInfo) {
      //do nothing
    },
    async onDisconnect(_error) {
      //do nothing
    },
  }));
}
