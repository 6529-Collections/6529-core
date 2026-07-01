import {
  getConnectedWalletAccounts,
  getWalletAddress,
  hasActiveSessionV2Auth,
  markRecentBrowserConnectorSessionV2Auth,
  setActiveWalletAccount,
} from "@/services/auth/auth.utils";
import {
  getNativeRefreshToken,
  removeNativeRefreshToken,
} from "@/services/auth/native-refresh-token-storage";
import {
  persistSessionResponse,
  redeemConnectionShare,
  refreshSessionV2,
} from "@/services/auth/session-v2.utils";
import {
  browserConnector,
  clearBrowserConnectorConnectIntent,
  setBrowserConnectorConnectIntent,
} from "@/wagmiConfig/browserConnector";

jest.mock("wagmi", () => ({
  createConnector: (factory: (config: unknown) => unknown) => factory({}),
}));

jest.mock("@/services/auth/auth.utils", () => ({
  getConnectedWalletAccounts: jest.fn(() => []),
  getWalletAddress: jest.fn(() => null),
  hasActiveSessionV2Auth: jest.fn(() => false),
  markRecentBrowserConnectorSessionV2Auth: jest.fn(),
  setActiveWalletAccount: jest.fn(() => true),
  setAuthJwt: jest.fn(),
}));

jest.mock("@/services/auth/native-refresh-token-storage", () => ({
  getNativeRefreshToken: jest.fn(() => Promise.resolve(null)),
  removeNativeRefreshToken: jest.fn(() => Promise.resolve()),
}));

jest.mock("@/services/auth/session-v2.utils", () => ({
  persistSessionResponse: jest.fn(() => Promise.resolve(true)),
  redeemConnectionShare: jest.fn(),
  refreshSessionV2: jest.fn(),
}));

const ADDRESS = "0x00000000000000000000000000000000000000aa";
const OTHER_ADDRESS = "0x00000000000000000000000000000000000000bb";

const desktopSessionAuth = {
  sessionVersion: "v2",
  client_type: "desktop",
  address: ADDRESS,
  role: null,
  access_token: "access-token",
  access_token_expires_at: "2026-06-10T00:00:00.000Z",
  native_refresh_token: "desktop-refresh-token",
  refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
};

const connectionShareAuth = {
  sessionVersion: "v2",
  transferType: "connection-share",
  connection_share_code: "share-code",
  address: ADDRESS,
  target_client_type: "desktop",
  expires_at: "2026-06-10T00:00:00.000Z",
};

const signedNativeChallengeAuth = {
  sessionVersion: "v2",
  transferType: "signed-native-challenge",
  server_signature: "server-signature",
  client_signature: "client-signature",
  address: ADDRESS,
  target_client_type: "desktop",
};

const existingNativeSessionAuth = {
  sessionVersion: "v2",
  transferType: "existing-native-session",
  address: ADDRESS,
  target_client_type: "desktop",
};

const flushPromises = async () => {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
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
  let nativeAuth: {
    sessionLogin: jest.Mock;
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
    nativeAuth = {
      sessionLogin: jest.fn(),
    };

    Object.defineProperty(window, "store", {
      configurable: true,
      value: store,
    });
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: nativeAuth,
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
    clearBrowserConnectorConnectIntent();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const createBrowserConnector = () =>
    browserConnector({
      openUrlFn: openUrl,
      name: "Browser",
      icon: "browser.png",
      id: "browser",
    }) as {
      connect: () => Promise<{
        accounts: readonly `0x${string}`[];
        chainId: number;
      }>;
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

  it("requires desktop session-v2 auth when opening the browser connect page", async () => {
    const { connectPromise, requestId, url } = await startConnect();

    expect(url.searchParams.get("authMode")).toBe("session-v2-desktop");

    walletConnectionListener?.(null, {
      requestId,
      data: {
        accounts: [ADDRESS],
        chainId: 1,
        activeAddress: ADDRESS,
        auth: desktopSessionAuth,
      },
    });

    await expect(connectPromise).resolves.toEqual({
      accounts: [ADDRESS],
      chainId: 1,
    });
    expect(persistSessionResponse).toHaveBeenCalledWith({
      client_type: "desktop",
      address: ADDRESS,
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "desktop-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });
    expect(markRecentBrowserConnectorSessionV2Auth).toHaveBeenCalledWith(
      ADDRESS
    );
    expect(setActiveWalletAccount).toHaveBeenCalledWith(ADDRESS);
    expect(store.set).toHaveBeenCalledWith(
      "seize-app-connection-browser",
      JSON.stringify({ accounts: [ADDRESS], chainId: 1 })
    );
  });

  it("includes an existing desktop auth address when the active account has session-v2 auth", async () => {
    (getWalletAddress as jest.Mock).mockReturnValueOnce(ADDRESS);
    (hasActiveSessionV2Auth as jest.Mock).mockReturnValueOnce(true);
    (getNativeRefreshToken as jest.Mock).mockResolvedValueOnce(
      "desktop-refresh-token"
    );
    (refreshSessionV2 as jest.Mock).mockResolvedValueOnce({
      client_type: "desktop",
      address: ADDRESS,
      role: null,
      access_token: "refreshed-access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "refreshed-desktop-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });

    const { connectPromise, requestId, url } = await startConnect();

    expect(url.searchParams.get("existingAuthAddress")).toBe(ADDRESS);
    expect(hasActiveSessionV2Auth).toHaveBeenCalledWith({ address: ADDRESS });
    expect(getNativeRefreshToken).toHaveBeenCalledWith(ADDRESS, "desktop");
    expect(refreshSessionV2).toHaveBeenCalledWith({ address: ADDRESS });
    expect(persistSessionResponse).toHaveBeenCalledWith({
      client_type: "desktop",
      address: ADDRESS,
      role: null,
      access_token: "refreshed-access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "refreshed-desktop-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });
    expect(removeNativeRefreshToken).not.toHaveBeenCalled();

    walletConnectionListener?.(null, {
      requestId,
      data: {
        accounts: [ADDRESS],
        chainId: 1,
        activeAddress: ADDRESS,
        auth: desktopSessionAuth,
      },
    });

    await expect(connectPromise).resolves.toEqual({
      accounts: [ADDRESS],
      chainId: 1,
    });
  });

  it("does not advertise an existing desktop auth address when the stored session is stale", async () => {
    (getWalletAddress as jest.Mock).mockReturnValueOnce(ADDRESS);
    (hasActiveSessionV2Auth as jest.Mock).mockReturnValueOnce(true);
    (getNativeRefreshToken as jest.Mock).mockResolvedValueOnce(
      "stale-desktop-refresh-token"
    );
    (refreshSessionV2 as jest.Mock).mockResolvedValueOnce(null);

    const { connectPromise, requestId, url } = await startConnect();

    expect(url.searchParams.get("existingAuthAddress")).toBeNull();
    expect(removeNativeRefreshToken).toHaveBeenCalledWith(ADDRESS, "desktop");

    walletConnectionListener?.(null, {
      requestId,
      data: {
        accounts: [ADDRESS],
        chainId: 1,
        activeAddress: ADDRESS,
        auth: desktopSessionAuth,
      },
    });

    await expect(connectPromise).resolves.toEqual({
      accounts: [ADDRESS],
      chainId: 1,
    });
  });

  it("includes pending wallet intent when opening the browser connect page", async () => {
    (getConnectedWalletAccounts as jest.Mock).mockReturnValueOnce([
      {
        address: OTHER_ADDRESS,
        refreshToken: null,
        role: null,
        jwt: "existing-jwt",
        profileId: null,
        profileHandle: null,
        authSessionVersion: "v2",
      },
    ]);
    setBrowserConnectorConnectIntent({
      intendedWalletAddress: ADDRESS,
      originWalletAddress: OTHER_ADDRESS,
    });

    const { connectPromise, requestId, url } = await startConnect();

    expect(url.searchParams.get("intendedWalletAddress")).toBe(ADDRESS);
    expect(url.searchParams.get("originWalletAddress")).toBe(OTHER_ADDRESS);
    expect(url.searchParams.get("knownWalletAddresses")).toBe(OTHER_ADDRESS);

    walletConnectionListener?.(null, {
      requestId,
      data: {
        accounts: [ADDRESS],
        chainId: 1,
        activeAddress: ADDRESS,
        auth: desktopSessionAuth,
      },
    });

    await expect(connectPromise).resolves.toEqual({
      accounts: [ADDRESS],
      chainId: 1,
    });
  });

  it("accepts an existing desktop session payload when a desktop refresh token is stored", async () => {
    (getNativeRefreshToken as jest.Mock).mockResolvedValueOnce(
      "desktop-refresh-token"
    );
    (refreshSessionV2 as jest.Mock).mockResolvedValueOnce({
      client_type: "desktop",
      address: ADDRESS,
      role: null,
      access_token: "refreshed-access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "refreshed-desktop-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });
    const { connectPromise, requestId } = await startConnect();

    walletConnectionListener?.(null, {
      requestId,
      data: {
        accounts: [ADDRESS],
        chainId: 1,
        activeAddress: ADDRESS,
        auth: existingNativeSessionAuth,
      },
    });

    await expect(connectPromise).resolves.toEqual({
      accounts: [ADDRESS],
      chainId: 1,
    });
    expect(getNativeRefreshToken).toHaveBeenCalledWith(ADDRESS, "desktop");
    expect(refreshSessionV2).toHaveBeenCalledWith({ address: ADDRESS });
    expect(persistSessionResponse).toHaveBeenCalledWith({
      client_type: "desktop",
      address: ADDRESS,
      role: null,
      access_token: "refreshed-access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "refreshed-desktop-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });
    expect(setActiveWalletAccount).toHaveBeenCalledWith(ADDRESS);
  });

  it("rejects an existing desktop session payload when no desktop refresh token is stored", async () => {
    (getNativeRefreshToken as jest.Mock).mockResolvedValueOnce(null);
    const { connectPromise, requestId } = await startConnect();

    walletConnectionListener?.(null, {
      requestId,
      data: {
        accounts: [ADDRESS],
        chainId: 1,
        activeAddress: ADDRESS,
        auth: existingNativeSessionAuth,
      },
    });

    await expect(connectPromise).rejects.toThrow(
      "Desktop session-v2 authentication is required"
    );
    expect(getNativeRefreshToken).toHaveBeenCalledWith(ADDRESS, "desktop");
    expect(refreshSessionV2).not.toHaveBeenCalled();
    expect(persistSessionResponse).not.toHaveBeenCalled();
    expect(setActiveWalletAccount).not.toHaveBeenCalled();
  });

  it("redeems a browser connection-share payload before accepting the connection", async () => {
    (redeemConnectionShare as jest.Mock).mockResolvedValueOnce({
      client_type: "desktop",
      address: ADDRESS,
      role: null,
      access_token: "redeemed-access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "redeemed-desktop-refresh-token",
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
    expect(redeemConnectionShare).toHaveBeenCalledWith("share-code", "desktop");
    expect(persistSessionResponse).toHaveBeenCalledWith({
      client_type: "desktop",
      address: ADDRESS,
      role: null,
      access_token: "redeemed-access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "redeemed-desktop-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });
    expect(setActiveWalletAccount).toHaveBeenCalledWith(ADDRESS);
  });

  it("logs in with a signed desktop challenge before accepting the connection", async () => {
    nativeAuth.sessionLogin.mockResolvedValueOnce({
      client_type: "desktop",
      address: ADDRESS,
      role: null,
      access_token: "challenge-access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "challenge-desktop-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });
    const { connectPromise, requestId } = await startConnect();

    walletConnectionListener?.(null, {
      requestId,
      data: {
        accounts: [ADDRESS],
        chainId: 1,
        activeAddress: ADDRESS,
        auth: signedNativeChallengeAuth,
      },
    });

    await expect(connectPromise).resolves.toEqual({
      accounts: [ADDRESS],
      chainId: 1,
    });
    expect(nativeAuth.sessionLogin).toHaveBeenCalledWith({
      client_type: "desktop",
      server_signature: "server-signature",
      client_signature: "client-signature",
      client_address: ADDRESS,
    });
    expect(persistSessionResponse).toHaveBeenCalledWith({
      client_type: "desktop",
      address: ADDRESS,
      role: null,
      access_token: "challenge-access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "challenge-desktop-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });
    expect(setActiveWalletAccount).toHaveBeenCalledWith(ADDRESS);
  });

  it("rejects a signed native challenge when session-login returns another address", async () => {
    nativeAuth.sessionLogin.mockResolvedValueOnce({
      client_type: "desktop",
      address: OTHER_ADDRESS,
      role: null,
      access_token: "challenge-access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "challenge-desktop-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });
    const { connectPromise, requestId } = await startConnect();

    walletConnectionListener?.(null, {
      requestId,
      data: {
        accounts: [ADDRESS],
        chainId: 1,
        activeAddress: ADDRESS,
        auth: signedNativeChallengeAuth,
      },
    });

    await expect(connectPromise).rejects.toThrow(
      "Desktop session-v2 authentication is required"
    );
    expect(nativeAuth.sessionLogin).toHaveBeenCalledWith({
      client_type: "desktop",
      server_signature: "server-signature",
      client_signature: "client-signature",
      client_address: ADDRESS,
    });
    expect(persistSessionResponse).not.toHaveBeenCalled();
    expect(setActiveWalletAccount).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
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
      "Desktop session-v2 authentication is required"
    );
    expect(persistSessionResponse).not.toHaveBeenCalled();
    expect(setActiveWalletAccount).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });
});
