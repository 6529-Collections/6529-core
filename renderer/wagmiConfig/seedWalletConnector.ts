import type { SeedWalletRequest } from "@/shared/types";
import { createConnector } from "wagmi";
import { UserRejectedRequestError } from "viem";
import { mainnet, sepolia } from "viem/chains";
import {
  createSeedWalletConnectionState,
  EMPTY_SEED_WALLET_CONNECTION,
  parseSeedWalletConnectionState,
  requireSupportedSeedWalletChainId,
  SEED_WALLET_CONNECTION_STORE,
  type SeedWalletConnectionState,
} from "./seedWalletConnectionState";

export const SEED_WALLET_CONNECTOR_TYPE = "seed-wallet";

interface ProviderRequest {
  method: string;
  params: any[];
}

export function seedWalletConnector(parameters: {
  address: string;
  name: string;
}) {
  let connectionObject: SeedWalletConnectionState = EMPTY_SEED_WALLET_CONNECTION;
  let initialized = false;

  async function readConnection() {
    const saved = await window.store.get(SEED_WALLET_CONNECTION_STORE);
    return parseSeedWalletConnectionState(saved, parameters.address);
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
      const requestedChainId =
        opts?.chainId === undefined
          ? undefined
          : requireSupportedSeedWalletChainId(opts.chainId);

      connectionObject = (await readConnection()) ?? EMPTY_SEED_WALLET_CONNECTION;
      initialized = true;

      // If we already have a connection, honor the requested chainId (if any) and return
      if (connectionObject.accounts.length > 0) {
        if (
          requestedChainId !== undefined &&
          requestedChainId !== connectionObject.chainId
        ) {
          connectionObject = {
            ...connectionObject,
            chainId: requestedChainId,
          };
          await window.store.set(
            SEED_WALLET_CONNECTION_STORE,
            JSON.stringify(connectionObject)
          );
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
        requestedChainId ?? mainnet.id
      );

      await window.store.set(
        SEED_WALLET_CONNECTION_STORE,
        JSON.stringify(connectionObject)
      );

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
      connectionObject = EMPTY_SEED_WALLET_CONNECTION;
      if (await readConnection()) {
        await window.seedConnector.disconnect();
      }
    },
    async getAccounts() {
      return connectionObject.accounts;
    },
    async getChainId() {
      return connectionObject.chainId;
    },
    async getProvider(): Promise<any> {
      if (!initialized) {
        connectionObject = (await readConnection()) ?? EMPTY_SEED_WALLET_CONNECTION;
        initialized = true;
      }
      return {
        request: async ({ method, params }: ProviderRequest): Promise<any> => {
          if (method === "eth_chainId") {
            return this.getChainId();
          }

          const request: SeedWalletRequest = {
            requestId: globalThis.crypto.randomUUID(),
            from: connectionObject.accounts[0] ?? "",
            chainId: connectionObject.chainId,
            method,
            params,
          };
          const result = await window.seedConnector.initRequest(request);
          if (!result.ok) {
            if (result.code === "rejected") {
              throw new UserRejectedRequestError(new Error(result.message));
            }
            window.seedConnector.showToast({ type: "error", message: result.message });
            throw new Error(result.message);
          }
          window.seedConnector.showToast({
            type: "success",
            message: method === "eth_sendTransaction" ? "Transaction sent!" : "Message Signed!",
          });
          return result.value;
        },
      };
    },
    async isAuthorized() {
      return !!connectionObject.accounts.length;
    },
    async switchChain(params: { chainId: number }) {
      console.log(`[${this.name}] Switch Chain method called`, params.chainId);
      const chainId = requireSupportedSeedWalletChainId(params.chainId);
      const myChain = chainId === sepolia.id ? sepolia : mainnet;
      connectionObject = {
        ...connectionObject,
        chainId: myChain.id,
      };
      await window.store.set(
        SEED_WALLET_CONNECTION_STORE,
        JSON.stringify(connectionObject)
      );
      console.log(`[${this.name}] Switched to chain`, myChain.name);
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
