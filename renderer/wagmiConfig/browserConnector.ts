import { setActiveWalletAccount, setAuthJwt } from "@/services/auth/auth.utils";
import { createConnector } from "wagmi";
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

const LEGACY_CONNECTION_STORE = "seize-app-connection";
const getConnectionStoreKey = (connectorId: string) =>
  `seize-app-connection-${connectorId}`;
const HEX_ADDRESS_REGEX = /^0x[0-9a-f]{40}$/;
const INVALID_CONNECTION_PAYLOAD_ERROR =
  "Invalid connection payload: accounts must be array of 0x-prefixed 40-hex strings and chainId must be a positive integer.";

const parsePositiveChainId = (chainId: unknown): number | null => {
  if (
    typeof chainId === "number" &&
    Number.isFinite(chainId) &&
    Number.isInteger(chainId) &&
    chainId > 0
  ) {
    return chainId;
  }

  if (typeof chainId === "bigint") {
    if (chainId <= 0n || chainId > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
    return Number(chainId);
  }

  if (typeof chainId === "string") {
    const normalizedChainId = chainId.trim().toLowerCase();
    if (normalizedChainId.length === 0) {
      return null;
    }

    const parsedChainId = /^0x[0-9a-f]+$/.test(normalizedChainId)
      ? Number.parseInt(normalizedChainId.slice(2), 16)
      : /^[0-9]+$/.test(normalizedChainId)
        ? Number.parseInt(normalizedChainId, 10)
        : Number.NaN;
    if (
      Number.isFinite(parsedChainId) &&
      Number.isInteger(parsedChainId) &&
      parsedChainId > 0
    ) {
      return parsedChainId;
    }
  }

  return null;
};

const parseConnectionPayload = (
  accountsInput: unknown,
  chainIdInput: unknown
): ConnectionObject | null => {
  if (!Array.isArray(accountsInput)) {
    return null;
  }

  const accounts: `0x${string}`[] = [];
  for (const account of accountsInput) {
    if (typeof account !== "string") {
      return null;
    }
    const normalizedAccount = account.toLowerCase();
    if (!HEX_ADDRESS_REGEX.test(normalizedAccount)) {
      return null;
    }
    accounts.push(normalizedAccount as `0x${string}`);
  }

  const chainId = parsePositiveChainId(chainIdInput);
  if (chainId === null) {
    return null;
  }

  return {
    accounts,
    chainId,
  };
};

export function browserConnector(parameters: {
  openUrlFn: (url: string) => void;
  name: string;
  icon: string;
  id: string;
}) {
  const connectionStoreKey = getConnectionStoreKey(parameters.id);
  const deepLinkCallbacks: Map<string, (response: ProviderResponse) => void> =
    new Map();
  const pendingDeepLinkResponses: Map<string, ProviderResponse> = new Map();

  let initialized = false;
  let scheme = "core6529";
  let port = 6529;

  let connectionObject: ConnectionObject = {
    accounts: [],
    chainId: 1,
  };

  const parseConnectionObject = (
    rawConnection: string | null
  ): ConnectionObject | null => {
    if (!rawConnection) {
      return null;
    }
    try {
      const parsed = JSON.parse(rawConnection) as {
        accounts?: unknown;
        chainId?: unknown;
      };
      return parseConnectionPayload(parsed.accounts, parsed.chainId);
    } catch {
      return null;
    }
  };

  async function init(name: string) {
    if (!window || initialized) return;

    const storedConnection = await window.store.get(connectionStoreKey);
    const parsedStoredConnection = parseConnectionObject(storedConnection);
    if (parsedStoredConnection) {
      connectionObject = parsedStoredConnection;
    }

    window.api.onWalletConnection((_event: any, data: any) => {
      const requestId =
        typeof data?.requestId === "string" ? data.requestId : undefined;
      if (!requestId) {
        return;
      }

      const callback = deepLinkCallbacks.get(requestId);
      if (callback) {
        callback(data.data);
        deepLinkCallbacks.delete(requestId);
      } else {
        pendingDeepLinkResponses.set(requestId, data.data ?? {});
        console.log(
          `[${name}] No callback found for requestId`,
          requestId
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

  const registerDeepLinkCallback = (
    requestId: string,
    callback: (response: ProviderResponse) => void
  ) => {
    deepLinkCallbacks.set(requestId, callback);

    const pendingResponse = pendingDeepLinkResponses.get(requestId);
    if (pendingResponse) {
      pendingDeepLinkResponses.delete(requestId);
      callback(pendingResponse);
      deepLinkCallbacks.delete(requestId);
    }
  };

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

      const legacyStoredConnection = await window.store.get(
        LEGACY_CONNECTION_STORE
      );
      const parsedLegacyConnection = parseConnectionObject(
        legacyStoredConnection
      );
      if (
        parsedLegacyConnection &&
        parsedLegacyConnection.accounts.length > 0
      ) {
        connectionObject = parsedLegacyConnection;
        await window.store.set(
          connectionStoreKey,
          JSON.stringify(connectionObject)
        );
        await window.store.remove(LEGACY_CONNECTION_STORE);

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

      return new Promise((resolve, reject) => {
        const requestId = generateRequestId();
        const t = Date.now();
        const chainId = opts?.chainId || connectionObject.chainId;
        const url = `http://localhost:${port}/browser-connector?task=connect&scheme=${scheme}&requestId=${requestId}&t=${t}&chainId=${chainId}`;
        const timeoutId = setTimeout(() => {
          console.log(`[${this.name}] Deep link callback timed out`, requestId);
          deepLinkCallbacks.delete(requestId);
          pendingDeepLinkResponses.delete(requestId);
          reject(new Error("Connection request timed out"));
        }, 60000);

        registerDeepLinkCallback(requestId, async (response: any) => {
          clearTimeout(timeoutId);
          if (!response || response.error) {
            reject(new Error(response?.error));
          } else {
            const validatedConnection = parseConnectionPayload(
              response.accounts,
              response.chainId
            );
            if (!validatedConnection) {
              reject(new Error(INVALID_CONNECTION_PAYLOAD_ERROR));
              return;
            }
            const {
              accounts: validatedAccounts,
              chainId: validatedChainId,
            } = validatedConnection;
            connectionObject = {
              accounts: validatedAccounts,
              chainId: validatedChainId,
            };
            const auth = response.auth as
              | {
                  address?: string;
                  token?: string;
                  refreshToken?: string;
                  role?: string | null;
                }
              | undefined;
            const responseActiveAddressLower =
              typeof response?.activeAddress === "string"
                ? response.activeAddress.toLowerCase()
                : null;
            const primaryConnectedAccount =
              responseActiveAddressLower &&
              validatedAccounts.includes(
                responseActiveAddressLower as `0x${string}`
              )
                ? (responseActiveAddressLower as `0x${string}`)
                : validatedAccounts[0];
            const authAddressLower =
              typeof auth?.address === "string"
                ? auth.address.toLowerCase()
                : undefined;
            const matchingAuthAccount =
              typeof authAddressLower === "string"
                ? validatedAccounts.find(
                    (account) => account === authAddressLower
                  )
                : undefined;
            const hasMatchingAuthAddress =
              typeof matchingAuthAccount === "string";
            const shouldPersistAuthForConnectedAccount =
              hasMatchingAuthAddress &&
              typeof primaryConnectedAccount === "string" &&
              matchingAuthAccount === primaryConnectedAccount;

            if (
              shouldPersistAuthForConnectedAccount &&
              typeof auth?.token === "string" &&
              typeof auth?.refreshToken === "string"
            ) {
              setAuthJwt(
                matchingAuthAccount,
                auth.token,
                auth.refreshToken,
                auth.role ?? undefined
              );
            } else if (
              typeof auth?.address === "string" &&
              typeof auth?.token === "string" &&
              typeof auth?.refreshToken === "string"
            ) {
              console.warn(
                `[${this.name}] Ignoring browser auth payload with non-matching address`,
                {
                  authAddress: auth.address,
                  connectedAccounts: validatedAccounts,
                }
              );
            }

            const accountToActivate = primaryConnectedAccount;
            if (typeof accountToActivate === "string") {
              const didSwitch = setActiveWalletAccount(accountToActivate);
              if (!didSwitch) {
                console.log(
                  `[${this.name}] Connected account is not active yet (likely awaiting auth):`,
                  accountToActivate
                );
              }
            }
            await window.store.set(
              connectionStoreKey,
              JSON.stringify(connectionObject)
            );

            if (opts?.withCapabilities) {
              const accountsWithCaps = validatedAccounts.map((address) => ({
                address,
                capabilities: {} as Record<string, unknown>,
              })) as unknown as readonly {
                address: `0x${string}`;
                capabilities: Record<string, unknown>;
              }[];

              resolve({
                accounts: accountsWithCaps as any,
                chainId: validatedChainId,
              } as any);
              return;
            }

            resolve({
              accounts: validatedAccounts as readonly `0x${string}`[],
              chainId: validatedChainId,
            } as any);
          }
        });

        parameters.openUrlFn(url);
      });
    },
    async disconnect() {
      deepLinkCallbacks.clear();
      pendingDeepLinkResponses.clear();
      connectionObject = {
        accounts: [],
        chainId: 1,
      };
      await window.store.remove(connectionStoreKey);
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
            const timeoutId = setTimeout(() => {
              console.log(
                `[${this.name}] Deep link callback timed out`,
                requestId
              );
              deepLinkCallbacks.delete(requestId);
              pendingDeepLinkResponses.delete(requestId);
              reject(new Error("Provider request timed out"));
            }, 60000);

            registerDeepLinkCallback(requestId, (response: any) => {
              clearTimeout(timeoutId);
              if (!response || response.error) {
                reject(new Error(response?.error));
              } else {
                resolve(response);
              }
            });

            parameters.openUrlFn(url);
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
