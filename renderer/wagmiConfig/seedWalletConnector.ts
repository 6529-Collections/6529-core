import { hexToString } from "@/helpers";
import { SeedWalletRequest } from "@/shared/types";
import { ethers } from "ethers";
import { createConnector } from "wagmi";
import { UserRejectedRequestError } from "viem";
import { mainnet, sepolia } from "viem/chains";
import {
  createSeedWalletConnectionState,
  EMPTY_SEED_WALLET_CONNECTION,
  parseSeedWalletConnectionState,
  type SeedWalletConnectionState,
} from "./seedWalletConnectionState";

export const SEED_WALLET_CONNECTOR_TYPE = "seed-wallet";

interface ProviderRequest {
  method: string;
  params: any[];
}

const CONNECTION_STORE = "seize-app-connection-seed-wallet";

interface PendingCallback {
  readonly callback: (request: SeedWalletRequest | Error) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

export function seedWalletConnector(parameters: {
  address: string;
  name: string;
}) {
  const pendingCallbacks = new Map<string, PendingCallback>();

  let provider: ethers.Provider;
  let initialized = false;

  let connectionObject: SeedWalletConnectionState =
    EMPTY_SEED_WALLET_CONNECTION;

  function settlePendingRequest(
    requestId: string,
    result: SeedWalletRequest | Error
  ): boolean {
    const pending = pendingCallbacks.get(requestId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timeoutId);
    pendingCallbacks.delete(requestId);
    pending.callback(result);
    return true;
  }

  function rejectAllPendingRequests(): void {
    for (const requestId of pendingCallbacks.keys()) {
      settlePendingRequest(
        requestId,
        new UserRejectedRequestError(new Error("Wallet disconnected"))
      );
    }
  }

  async function handlePendingRequest(name: string, data: SeedWalletRequest) {
    const { method, privateKey, params } = data;

    if (!connectionObject.accounts.length) {
      throw new Error("No accounts found in connection object");
    }

    if (!privateKey) {
      throw new Error("No privateKey found in request");
    }

    const wallet = new ethers.Wallet(privateKey);

    switch (method) {
      case "personal_sign": {
        const message = hexToString(params?.[0]);
        const signature = await wallet.signMessage(message);
        window.seedConnector.showToast({
          type: "success",
          message: "Message Signed!",
        });
        return signature;
      }
      case "eth_sendTransaction":
        console.log(`[${name}] Sending transaction`, params);

        const walletConnection = wallet.connect(provider);

        const txResponse = await walletConnection.sendTransaction(params[0]);
        console.log(`[${name}] Transaction response`, txResponse);
        window.seedConnector.showToast({
          type: "success",
          message: "Transaction sent!",
        });
        return txResponse.hash;
    }

    throw new Error(`[${name}] Unsupported method: ${method}`);
  }

  function updateProvider() {
    if (connectionObject.chainId === sepolia.id) {
      provider = new ethers.JsonRpcProvider(sepolia.rpcUrls.default.http[0]);
    } else {
      provider = new ethers.JsonRpcProvider("https://rpc1.6529.io");
    }
  }

  async function init(name: string) {
    if (!window || initialized) return;

    const storedConnection = await window.store.get(CONNECTION_STORE);
    connectionObject =
      parseSeedWalletConnectionState(storedConnection, parameters.address) ??
      EMPTY_SEED_WALLET_CONNECTION;

    window.seedConnector.onConfirm((_event: any, data: SeedWalletRequest) => {
      if (!settlePendingRequest(data.requestId, data)) {
        console.log(
          `[${name}] No callback found for requestId (confirmed)`,
          data.requestId
        );
      }
    });

    window.seedConnector.onReject((_event: any, data: SeedWalletRequest) => {
      if (
        settlePendingRequest(
          data.requestId,
          new UserRejectedRequestError(new Error("Request rejected"))
        )
      ) {
        console.log(`[${name}] Request rejected`, data);
      } else {
        console.log(
          `[${name}] No callback found for requestId (rejected)`,
          data.requestId
        );
      }
    });

    updateProvider();

    initialized = true;
  }

  function generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  return createConnector(({ emitter }) => ({
    get icon() {
      return `https://robohash.org/${parameters.address}.png`;
    },
    get id() {
      return parameters.address;
    },
    get name() {
      return parameters.name;
    },
    get supportsSimulation() {
      return false;
    },
    type: SEED_WALLET_CONNECTOR_TYPE,
    async setup() {
      //do nothing
    },
    async connect(opts?: {
      chainId?: number;
      isReconnecting?: boolean;
      withCapabilities?: boolean;
    }) {
      console.log(`[${this.name}] Seed Wallet Connect method called`, opts);
      await init(this.name);

      const storedConnection = await window.store.get(CONNECTION_STORE);
      connectionObject =
        parseSeedWalletConnectionState(storedConnection, parameters.address) ??
        EMPTY_SEED_WALLET_CONNECTION;

      // If we already have a connection, honor the requested chainId (if any) and return
      if (connectionObject.accounts.length > 0) {
        if (opts?.chainId && opts.chainId !== connectionObject.chainId) {
          connectionObject = {
            ...connectionObject,
            chainId: opts.chainId,
          };
          await window.store.set(
            CONNECTION_STORE,
            JSON.stringify(connectionObject)
          );
          updateProvider();
        }

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

      // Establish new connection
      connectionObject = createSeedWalletConnectionState(
        parameters.address,
        opts?.chainId ?? 1
      );

      await window.store.set(
        CONNECTION_STORE,
        JSON.stringify(connectionObject)
      );
      updateProvider();

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
    },
    async disconnect() {
      rejectAllPendingRequests();
      connectionObject = EMPTY_SEED_WALLET_CONNECTION;
      const storedConnection = await window.store.get(CONNECTION_STORE);
      if (
        parseSeedWalletConnectionState(storedConnection, parameters.address)
      ) {
        await window.store.remove(CONNECTION_STORE);
      }
      window.seedConnector.disconnect();
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
              from: connectionObject.accounts[0] ?? "",
              method,
              params,
            };

            const timeoutId = setTimeout(() => {
              console.log(
                `[${this.name}] Pending callback timed out`,
                requestId
              );
              settlePendingRequest(
                requestId,
                new Error("Provider request timed out")
              );
            }, 60000);
            pendingCallbacks.set(requestId, {
              timeoutId,
              callback: (request: SeedWalletRequest | Error) => {
                if (request instanceof Error) {
                  reject(request);
                  return;
                }
                void handlePendingRequest(this.name, request)
                  .then(resolve)
                  .catch((error: unknown) => {
                    const message =
                      error instanceof Error
                        ? error.message
                        : "Wallet request failed";
                    window.seedConnector.showToast({
                      type: "error",
                      message,
                    });
                    reject(new Error(message));
                  });
              },
            });

            try {
              window.seedConnector.initRequest(request);
            } catch (error: unknown) {
              settlePendingRequest(
                requestId,
                error instanceof Error
                  ? error
                  : new Error("Unable to open wallet request")
              );
            }
          });
        },
      };
    },
    async isAuthorized() {
      return !!connectionObject.accounts.length;
    },
    async switchChain(params: { chainId: number }) {
      console.log(`[${this.name}] Switch Chain method called`, params.chainId);
      const myChain = params.chainId === sepolia.id ? sepolia : mainnet;
      connectionObject = {
        ...connectionObject,
        chainId: myChain.id,
      };
      await window.store.set(
        CONNECTION_STORE,
        JSON.stringify(connectionObject)
      );
      console.log(`[${this.name}] Switched to chain`, myChain.name);
      updateProvider();
      emitter.emit("change", { chainId: myChain.id });
      return myChain;
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
