import { setActiveWalletAccount } from "@/services/auth/auth.utils";
import {
  persistSessionResponse,
  redeemConnectionShare,
} from "@/services/auth/session-v2.utils";
import { browserConnector } from "@/wagmiConfig/browserConnector";

jest.mock("wagmi", () => ({
  createConnector: (factory: (config: unknown) => unknown) => factory({}),
}));

jest.mock("@/services/auth/auth.utils", () => ({
  setActiveWalletAccount: jest.fn(() => true),
  setAuthJwt: jest.fn(),
}));

jest.mock("@/services/auth/session-v2.utils", () => ({
  persistSessionResponse: jest.fn(() => Promise.resolve(true)),
  redeemConnectionShare: jest.fn(),
}));

const ADDRESS = "0x00000000000000000000000000000000000000aa";

const nativeSessionAuth = {
  sessionVersion: "v2",
  client_type: "native",
  address: ADDRESS,
  role: null,
  access_token: "access-token",
  access_token_expires_at: "2026-06-10T00:00:00.000Z",
  native_refresh_token: "native-refresh-token",
  refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
};

const connectionShareAuth = {
  sessionVersion: "v2",
  transferType: "connection-share",
  connection_share_code: "share-code",
  address: ADDRESS,
  target_client_type: "native",
  expires_at: "2026-06-10T00:00:00.000Z",
};

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("browserConnector", () => {
  let walletConnectionListener:
    | ((event: unknown, data: unknown) => void)
    | null;
  let openUrl: jest.Mock;
  let store: {
    get: jest.Mock;
    set: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    walletConnectionListener = null;
    openUrl = jest.fn();
    store = {
      get: jest.fn(() => Promise.resolve(null)),
      set: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve()),
    };

    Object.defineProperty(window, "store", {
      configurable: true,
      value: store,
    });
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {
        onWalletConnection: jest.fn(
          (listener: (event: unknown, data: unknown) => void) => {
            walletConnectionListener = listener;
          }
        ),
        getInfo: jest.fn(() =>
          Promise.resolve({ scheme: "core6529", port: 6529 })
        ),
      },
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const createBrowserConnector = () =>
    browserConnector({
      openUrlFn: openUrl,
      name: "Browser",
      icon: "browser.png",
      id: "browser",
    }) as {
      connect: () => Promise<{ accounts: readonly `0x${string}`[]; chainId: number }>;
    };

  const startConnect = async () => {
    const connector = createBrowserConnector();
    const connectPromise = connector.connect();
    await flushPromises();

    expect(openUrl).toHaveBeenCalledTimes(1);
    const url = new URL(openUrl.mock.calls[0][0]);
    const requestId = url.searchParams.get("requestId");
    expect(requestId).toBeTruthy();

    return {
      connectPromise,
      requestId: requestId as string,
      url,
    };
  };

  it("requires native session-v2 auth when opening the browser connect page", async () => {
    const { connectPromise, requestId, url } = await startConnect();

    expect(url.searchParams.get("authMode")).toBe("session-v2-native");

    walletConnectionListener?.(null, {
      requestId,
      data: {
        accounts: [ADDRESS],
        chainId: 1,
        activeAddress: ADDRESS,
        auth: nativeSessionAuth,
      },
    });

    await expect(connectPromise).resolves.toEqual({
      accounts: [ADDRESS],
      chainId: 1,
    });
    expect(persistSessionResponse).toHaveBeenCalledWith({
      client_type: "native",
      address: ADDRESS,
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "native-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });
    expect(setActiveWalletAccount).toHaveBeenCalledWith(ADDRESS);
    expect(store.set).toHaveBeenCalledWith(
      "seize-app-connection-browser",
      JSON.stringify({ accounts: [ADDRESS], chainId: 1 })
    );
  });

  it("redeems a browser connection-share payload before accepting the connection", async () => {
    (redeemConnectionShare as jest.Mock).mockResolvedValueOnce({
      client_type: "native",
      address: ADDRESS,
      role: null,
      access_token: "redeemed-access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "redeemed-native-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });
    const { connectPromise, requestId } = await startConnect();

    walletConnectionListener?.(null, {
      requestId,
      data: {
        accounts: [ADDRESS],
        chainId: 1,
        activeAddress: ADDRESS,
        auth: connectionShareAuth,
      },
    });

    await expect(connectPromise).resolves.toEqual({
      accounts: [ADDRESS],
      chainId: 1,
    });
    expect(redeemConnectionShare).toHaveBeenCalledWith("share-code");
    expect(persistSessionResponse).toHaveBeenCalledWith({
      client_type: "native",
      address: ADDRESS,
      role: null,
      access_token: "redeemed-access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "redeemed-native-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });
    expect(setActiveWalletAccount).toHaveBeenCalledWith(ADDRESS);
  });

  it("rejects a browser connect callback without matching native session-v2 auth", async () => {
    const { connectPromise, requestId } = await startConnect();

    walletConnectionListener?.(null, {
      requestId,
      data: {
        accounts: [ADDRESS],
        chainId: 1,
        activeAddress: ADDRESS,
      },
    });

    await expect(connectPromise).rejects.toThrow(
      "Native session-v2 authentication is required"
    );
    expect(persistSessionResponse).not.toHaveBeenCalled();
    expect(setActiveWalletAccount).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });
});
