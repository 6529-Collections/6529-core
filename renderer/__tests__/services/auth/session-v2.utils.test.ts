import { Capacitor } from "@capacitor/core";
import { commonApiFetch, commonApiPost } from "@/services/api/common-api";
import { getAuthJwt, setAuthJwt } from "@/services/auth/auth.utils";
import {
  getNativeRefreshToken,
  isNativeSecureStorageAvailable,
  removeNativeRefreshToken,
  setNativeRefreshToken,
} from "@/services/auth/native-refresh-token-storage";
import {
  createConnectionShare,
  createLegacyDesktopConnectionShare,
  getSessionNonce,
  loginWithSessionV2,
  logoutSessionV2,
  persistSessionResponse,
  redeemConnectionShare,
  refreshSessionV2,
  verifyActiveSessionV2WebSession,
} from "@/services/auth/session-v2.utils";

jest.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: jest.fn(() => false),
  },
  WebPlugin: class {
    readonly pluginName = "mock";
  },
  registerPlugin: jest.fn(),
}));

jest.mock("@/services/api/common-api", () => ({
  commonApiFetch: jest.fn(),
  commonApiPost: jest.fn(),
}));

jest.mock("@/services/auth/auth.utils", () => ({
  getAuthJwt: jest.fn(),
  setAuthJwt: jest.fn(),
}));

jest.mock("@/services/auth/native-refresh-token-storage", () => ({
  getNativeRefreshToken: jest.fn(),
  isNativeSecureStorageAvailable: jest.fn(),
  removeNativeRefreshToken: jest.fn(),
  setNativeRefreshToken: jest.fn(),
}));

describe("session-v2.utils", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(false);
    (commonApiFetch as jest.Mock).mockResolvedValue(undefined);
    (commonApiPost as jest.Mock).mockResolvedValue(undefined);
    (getNativeRefreshToken as jest.Mock).mockResolvedValue(null);
    (isNativeSecureStorageAvailable as jest.Mock).mockReturnValue(true);
    (getAuthJwt as jest.Mock).mockReturnValue(null);
    (setAuthJwt as jest.Mock).mockReturnValue(true);
    Object.defineProperty(window, "api", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: undefined,
    });
  });

  it("requests web session nonce with only session-v2 query params", async () => {
    const nonceResponse = {
      signable_message: "6529 Authentication\nDomain: example.com",
      server_signature: "server-signature",
    };
    (commonApiFetch as jest.Mock).mockResolvedValueOnce(nonceResponse);

    await expect(getSessionNonce({ signerAddress: "0xabc" })).resolves.toBe(
      nonceResponse
    );

    expect(commonApiFetch).toHaveBeenCalledWith({
      endpoint: "auth/session-nonce",
      params: {
        signer_address: "0xabc",
        client_type: "web",
        chain_id: "1",
      },
    });
  });

  it("requests native session nonce with client_type native", async () => {
    (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(true);
    const nonceResponse = {
      signable_message: "6529 Authentication\nDomain: native",
      server_signature: "server-signature",
    };
    (commonApiFetch as jest.Mock).mockResolvedValueOnce(nonceResponse);

    await expect(getSessionNonce({ signerAddress: "0xabc" })).resolves.toBe(
      nonceResponse
    );

    expect(commonApiFetch).toHaveBeenCalledWith({
      endpoint: "auth/session-nonce",
      params: {
        signer_address: "0xabc",
        client_type: "native",
        chain_id: "1",
      },
    });
  });

  it("requests desktop session nonce from Electron", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    const nonceResponse = {
      signable_message: "6529 Authentication\nDomain: desktop",
      server_signature: "server-signature",
    };
    (commonApiFetch as jest.Mock).mockResolvedValueOnce(nonceResponse);

    await expect(getSessionNonce({ signerAddress: "0xabc" })).resolves.toBe(
      nonceResponse
    );

    expect(commonApiFetch).toHaveBeenCalledWith({
      endpoint: "auth/session-nonce",
      params: {
        signer_address: "0xabc",
        client_type: "desktop",
        chain_id: "1",
      },
    });
  });

  it("allows browser connector pages to request native session nonces without wallet auth", async () => {
    const nonceResponse = {
      signable_message: "6529 Authentication\nDomain: native",
      server_signature: "server-signature",
    };
    (commonApiFetch as jest.Mock).mockResolvedValueOnce(nonceResponse);

    await expect(
      getSessionNonce({
        signerAddress: "0xabc",
        clientType: "native",
        includeWalletAuthHeaders: false,
      })
    ).resolves.toBe(nonceResponse);

    expect(commonApiFetch).toHaveBeenCalledWith({
      endpoint: "auth/session-nonce",
      params: {
        signer_address: "0xabc",
        client_type: "native",
        chain_id: "1",
      },
      includeWalletAuthHeaders: false,
    });
  });

  it("revokes a native session when auth persistence fails", async () => {
    (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(true);
    (getNativeRefreshToken as jest.Mock).mockResolvedValue(
      "native-refresh-token"
    );
    (setAuthJwt as jest.Mock).mockReturnValue(false);

    await expect(
      persistSessionResponse({
        client_type: "native",
        address: "0xabc",
        role: null,
        access_token: "access-token",
        access_token_expires_at: "2026-06-10T00:00:00.000Z",
        native_refresh_token: "native-refresh-token",
        refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
      })
    ).resolves.toBe(false);

    expect(setNativeRefreshToken).toHaveBeenCalledWith({
      address: "0xabc",
      refreshToken: "native-refresh-token",
      clientType: "native",
    });
    expect(commonApiPost).toHaveBeenCalledWith({
      endpoint: "auth/session-logout",
      body: {
        client_type: "native",
        client_address: "0xabc",
        native_refresh_token: "native-refresh-token",
        all_sessions: false,
      },
      credentials: "include",
      parseJson: false,
    });
    expect(removeNativeRefreshToken).toHaveBeenCalledWith("0xabc", "native");
  });

  it("marks persisted web auth as session v2", async () => {
    await expect(
      persistSessionResponse({
        client_type: "web",
        address: "0xabc",
        role: null,
        access_token: "access-token",
        access_token_expires_at: "2026-06-10T00:00:00.000Z",
      })
    ).resolves.toBe(true);

    expect(setAuthJwt).toHaveBeenCalledWith(
      "0xabc",
      "access-token",
      null,
      undefined,
      { authSessionVersion: "v2" }
    );
  });

  it("posts the strict session-login request contract with credentials for web login", async () => {
    const sessionResponse = {
      client_type: "web",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
    };
    (commonApiPost as jest.Mock).mockResolvedValueOnce(sessionResponse);

    await expect(
      loginWithSessionV2({
        serverSignature: "server-signature",
        clientSignature: "client-signature",
        signerAddress: "0xabc",
        role: null,
      })
    ).resolves.toBe(sessionResponse);

    expect(commonApiPost).toHaveBeenCalledWith({
      endpoint: "auth/session-login",
      body: {
        client_type: "web",
        server_signature: "server-signature",
        client_signature: "client-signature",
        client_address: "0xabc",
      },
      credentials: "include",
    });
  });

  it("includes credentials for native session-login", async () => {
    (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(true);
    const sessionResponse = {
      client_type: "native",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "native-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    };
    (commonApiPost as jest.Mock).mockResolvedValueOnce(sessionResponse);

    await expect(
      loginWithSessionV2({
        serverSignature: "server-signature",
        clientSignature: "client-signature",
        signerAddress: "0xabc",
        role: null,
      })
    ).resolves.toBe(sessionResponse);

    expect(commonApiPost).toHaveBeenCalledWith({
      endpoint: "auth/session-login",
      body: {
        client_type: "native",
        server_signature: "server-signature",
        client_signature: "client-signature",
        client_address: "0xabc",
      },
      credentials: "include",
    });
  });

  it("uses the Electron native auth bridge for native session-login", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    const sessionResponse = {
      client_type: "native",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "native-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    };
    const sessionLogin = jest.fn().mockResolvedValueOnce(sessionResponse);
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: { sessionLogin },
    });

    await expect(
      loginWithSessionV2({
        serverSignature: "server-signature",
        clientSignature: "client-signature",
        signerAddress: "0xabc",
        role: null,
        clientType: "native",
      })
    ).resolves.toBe(sessionResponse);

    expect(sessionLogin).toHaveBeenCalledWith({
      server_signature: "server-signature",
      client_signature: "client-signature",
      client_address: "0xabc",
      client_type: "native",
    });
    expect(commonApiPost).not.toHaveBeenCalled();
  });

  it("uses desktop client type for Electron session-login by default", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    const sessionResponse = {
      client_type: "desktop",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "desktop-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    };
    const sessionLogin = jest.fn().mockResolvedValueOnce(sessionResponse);
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: { sessionLogin },
    });

    await expect(
      loginWithSessionV2({
        serverSignature: "server-signature",
        clientSignature: "client-signature",
        signerAddress: "0xabc",
        role: null,
      })
    ).resolves.toBe(sessionResponse);

    expect(sessionLogin).toHaveBeenCalledWith({
      server_signature: "server-signature",
      client_signature: "client-signature",
      client_address: "0xabc",
      client_type: "desktop",
    });
    expect(commonApiPost).not.toHaveBeenCalled();
  });

  it("revokes a web session cookie when auth persistence fails", async () => {
    (setAuthJwt as jest.Mock).mockReturnValue(false);

    await expect(
      persistSessionResponse({
        client_type: "web",
        address: "0xabc",
        role: null,
        access_token: "access-token",
        access_token_expires_at: "2026-06-10T00:00:00.000Z",
      })
    ).resolves.toBe(false);

    expect(commonApiPost).toHaveBeenCalledWith({
      endpoint: "auth/session-logout",
      body: {
        client_type: "web",
        client_address: "0xabc",
        all_sessions: false,
      },
      credentials: "include",
      parseJson: false,
    });
  });

  it("attempts web session refresh with credentials", async () => {
    const sessionResponse = {
      client_type: "web",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
    };
    (commonApiPost as jest.Mock).mockResolvedValueOnce(sessionResponse);

    await expect(refreshSessionV2({ address: "0xabc" })).resolves.toBe(
      sessionResponse
    );

    expect(commonApiPost).toHaveBeenCalledWith({
      endpoint: "auth/session-refresh",
      body: {
        client_type: "web",
        client_address: "0xabc",
      },
      signal: undefined,
      credentials: "include",
      errorMode: "structured",
    });
  });

  it("treats unauthorized web refresh as an invalid session", async () => {
    const unauthorizedError = Object.assign(new Error("Unauthorized"), {
      status: 401,
      response: { status: 401 },
    });
    (commonApiPost as jest.Mock).mockRejectedValueOnce(unauthorizedError);

    await expect(refreshSessionV2({ address: "0xabc" })).resolves.toBeNull();

    expect(commonApiPost).toHaveBeenCalledWith({
      endpoint: "auth/session-refresh",
      body: {
        client_type: "web",
        client_address: "0xabc",
      },
      signal: undefined,
      credentials: "include",
      errorMode: "structured",
    });
  });

  it("verifies an active web session and persists the refreshed auth", async () => {
    const sessionResponse = {
      client_type: "web",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
    };
    (commonApiPost as jest.Mock).mockResolvedValueOnce(sessionResponse);

    await expect(
      verifyActiveSessionV2WebSession({ address: "0xabc" })
    ).resolves.toBe(true);

    expect(commonApiPost).toHaveBeenCalledWith({
      endpoint: "auth/session-refresh",
      body: {
        client_type: "web",
        client_address: "0xabc",
      },
      signal: undefined,
      credentials: "include",
      errorMode: "structured",
    });
    expect(setAuthJwt).toHaveBeenCalledWith(
      "0xabc",
      "access-token",
      null,
      undefined,
      { authSessionVersion: "v2" }
    );
  });

  it("returns false when refreshed web session auth cannot be persisted", async () => {
    const sessionResponse = {
      client_type: "web",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
    };
    (setAuthJwt as jest.Mock).mockReturnValue(false);
    (commonApiPost as jest.Mock)
      .mockResolvedValueOnce(sessionResponse)
      .mockResolvedValueOnce(undefined);

    await expect(
      verifyActiveSessionV2WebSession({ address: "0xabc" })
    ).resolves.toBe(false);

    expect(commonApiPost).toHaveBeenNthCalledWith(2, {
      endpoint: "auth/session-logout",
      body: {
        client_type: "web",
        client_address: "0xabc",
        all_sessions: false,
      },
      credentials: "include",
      parseJson: false,
    });
  });

  it("returns false when the active web session cannot be refreshed", async () => {
    const unauthorizedError = Object.assign(new Error("Unauthorized"), {
      status: 401,
      response: { status: 401 },
    });
    (commonApiPost as jest.Mock).mockRejectedValueOnce(unauthorizedError);

    await expect(
      verifyActiveSessionV2WebSession({ address: "0xabc" })
    ).resolves.toBe(false);
  });

  it("treats unauthorized native refresh as an invalid session", async () => {
    const unauthorizedError = Object.assign(new Error("Unauthorized"), {
      status: 401,
      response: { status: 401 },
    });
    (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(true);
    (getNativeRefreshToken as jest.Mock).mockResolvedValue(
      "native-refresh-token"
    );
    (commonApiPost as jest.Mock).mockRejectedValueOnce(unauthorizedError);

    await expect(refreshSessionV2({ address: "0xabc" })).resolves.toBeNull();

    expect(commonApiPost).toHaveBeenCalledWith({
      endpoint: "auth/session-refresh",
      body: {
        client_type: "native",
        client_address: "0xabc",
        native_refresh_token: "native-refresh-token",
      },
      signal: undefined,
      credentials: "include",
      errorMode: "structured",
    });
    expect(getNativeRefreshToken).toHaveBeenCalledWith("0xabc", "native");
  });

  it("refreshes desktop sessions with the desktop refresh token", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    (getNativeRefreshToken as jest.Mock).mockResolvedValue(
      "desktop-refresh-token"
    );
    const sessionResponse = {
      client_type: "desktop",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "rotated-desktop-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    };
    const sessionRefresh = jest.fn().mockResolvedValueOnce(sessionResponse);
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: { sessionRefresh },
    });

    await expect(refreshSessionV2({ address: "0xabc" })).resolves.toBe(
      sessionResponse
    );

    expect(getNativeRefreshToken).toHaveBeenCalledWith("0xabc", "desktop");
    expect(sessionRefresh).toHaveBeenCalledWith({
      client_type: "desktop",
      client_address: "0xabc",
      native_refresh_token: "desktop-refresh-token",
    });
    expect(commonApiPost).not.toHaveBeenCalled();
  });

  it("revokes an existing native session", async () => {
    (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(true);
    (getNativeRefreshToken as jest.Mock).mockResolvedValue(
      "native-refresh-token"
    );

    await logoutSessionV2({ address: "0xabc", allSessions: true });

    expect(commonApiPost).toHaveBeenCalledWith({
      endpoint: "auth/session-logout",
      body: {
        client_type: "native",
        client_address: "0xabc",
        native_refresh_token: "native-refresh-token",
        all_sessions: true,
      },
      credentials: "include",
      parseJson: false,
    });
    expect(removeNativeRefreshToken).toHaveBeenCalledWith("0xabc", "native");
  });

  it("removes the native refresh token when native logout fails", async () => {
    const logoutError = new Error("logout failed");
    (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(true);
    (getNativeRefreshToken as jest.Mock).mockResolvedValue(
      "native-refresh-token"
    );
    (commonApiPost as jest.Mock).mockRejectedValueOnce(logoutError);

    await expect(
      logoutSessionV2({ address: "0xabc", allSessions: true })
    ).rejects.toBe(logoutError);

    expect(removeNativeRefreshToken).toHaveBeenCalledWith("0xabc", "native");
  });

  it("revokes an existing desktop session", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    (getNativeRefreshToken as jest.Mock).mockResolvedValue(
      "desktop-refresh-token"
    );

    await logoutSessionV2({ address: "0xabc", allSessions: true });

    expect(commonApiPost).toHaveBeenCalledWith({
      endpoint: "auth/session-logout",
      body: {
        client_type: "desktop",
        client_address: "0xabc",
        native_refresh_token: "desktop-refresh-token",
        all_sessions: true,
      },
      credentials: "include",
      parseJson: false,
    });
    expect(removeNativeRefreshToken).toHaveBeenCalledWith("0xabc", "desktop");
  });

  it("revokes an existing desktop session through the Electron bridge", async () => {
    const sessionLogout = jest.fn(() => Promise.resolve());
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: { sessionLogout },
    });
    (getAuthJwt as jest.Mock).mockReturnValue("wallet-access-token");
    (getNativeRefreshToken as jest.Mock).mockResolvedValue(
      "desktop-refresh-token"
    );

    await logoutSessionV2({ address: "0xabc", allSessions: true });

    expect(sessionLogout).toHaveBeenCalledWith({
      access_token: "wallet-access-token",
      client_type: "desktop",
      client_address: "0xabc",
      native_refresh_token: "desktop-refresh-token",
      all_sessions: true,
    });
    expect(commonApiPost).not.toHaveBeenCalled();
    expect(removeNativeRefreshToken).toHaveBeenCalledWith("0xabc", "desktop");
  });

  it("attempts web session logout with credentials", async () => {
    await logoutSessionV2({ address: "0xabc", allSessions: true });

    expect(commonApiPost).toHaveBeenCalledWith({
      endpoint: "auth/session-logout",
      body: {
        client_type: "web",
        client_address: "0xabc",
        all_sessions: true,
      },
      credentials: "include",
      parseJson: false,
    });
  });

  it("creates a native connection share with bearer auth and session credentials", async () => {
    const shareResponse = {
      connection_share_code: "share-code",
      expires_at: "2026-06-10T00:00:00.000Z",
      address: "0xabc",
      role: null,
      target_client_type: "native",
      deep_link_path:
        "/accept-connection-sharing?connection_share_code=share-code",
    };
    (commonApiPost as jest.Mock).mockResolvedValueOnce(shareResponse);

    await expect(createConnectionShare({})).resolves.toBe(shareResponse);

    expect(commonApiPost).toHaveBeenCalledWith({
      endpoint: "auth/connection-share",
      body: {
        target_client_type: "native",
      },
      credentials: "include",
      signal: undefined,
    });
  });

  it("creates a desktop connection share through the Electron bridge", async () => {
    const shareResponse = {
      connection_share_code: "share-code",
      expires_at: "2026-06-10T00:00:00.000Z",
      address: "0xabc",
      role: null,
      target_client_type: "desktop",
      deep_link_path:
        "/accept-connection-sharing?connection_share_code=share-code",
    };
    const createConnectionShareNative = jest
      .fn()
      .mockResolvedValueOnce(shareResponse);
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: { createConnectionShare: createConnectionShareNative },
    });
    (getAuthJwt as jest.Mock).mockReturnValue("wallet-access-token");

    await expect(
      createConnectionShare({ targetClientType: "desktop" })
    ).resolves.toBe(shareResponse);

    expect(createConnectionShareNative).toHaveBeenCalledWith({
      access_token: "wallet-access-token",
      target_client_type: "desktop",
    });
    expect(commonApiPost).not.toHaveBeenCalled();
  });

  it("creates a legacy desktop connection share with bearer auth and session credentials", async () => {
    const shareResponse = {
      refresh_token: "legacy-refresh-token",
      address: "0xabc",
      role: null,
      deep_link_path:
        "/accept-connection-sharing?token=legacy-refresh-token&address=0xabc",
    };
    const abortController = new AbortController();
    (commonApiPost as jest.Mock).mockResolvedValueOnce(shareResponse);

    await expect(
      createLegacyDesktopConnectionShare({ signal: abortController.signal })
    ).resolves.toBe(shareResponse);

    expect(commonApiPost).toHaveBeenCalledWith({
      endpoint: "auth/connection-share/legacy-desktop",
      body: {},
      credentials: "include",
      signal: abortController.signal,
    });
  });

  it("creates a legacy desktop connection share through the Electron bridge", async () => {
    const shareResponse = {
      refresh_token: "legacy-refresh-token",
      address: "0xabc",
      role: null,
      deep_link_path:
        "/accept-connection-sharing?token=legacy-refresh-token&address=0xabc",
    };
    const createLegacyDesktopConnectionShareNative = jest
      .fn()
      .mockResolvedValueOnce(shareResponse);
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: {
        createLegacyDesktopConnectionShare:
          createLegacyDesktopConnectionShareNative,
      },
    });
    (getAuthJwt as jest.Mock).mockReturnValue("wallet-access-token");

    await expect(createLegacyDesktopConnectionShare({})).resolves.toBe(
      shareResponse
    );

    expect(createLegacyDesktopConnectionShareNative).toHaveBeenCalledWith({
      access_token: "wallet-access-token",
    });
    expect(commonApiPost).not.toHaveBeenCalled();
  });

  it("redeems a connection share as a native session", async () => {
    (commonApiPost as jest.Mock).mockResolvedValueOnce({
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "native-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });

    await expect(redeemConnectionShare("share-code")).resolves.toEqual({
      client_type: "native",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "native-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });

    expect(commonApiPost).toHaveBeenCalledWith({
      endpoint: "auth/connection-share/redeem",
      body: {
        connection_share_code: "share-code",
        target_client_type: "native",
      },
      credentials: "include",
    });
  });

  it("redeems a connection share through the Electron bridge", async () => {
    const redeemedResponse = {
      client_type: "desktop",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "desktop-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    };
    const redeemConnectionShareNative = jest
      .fn()
      .mockResolvedValueOnce(redeemedResponse);
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: { redeemConnectionShare: redeemConnectionShareNative },
    });
    (getAuthJwt as jest.Mock).mockReturnValue("wallet-access-token");

    await expect(redeemConnectionShare("share-code", "desktop")).resolves.toBe(
      redeemedResponse
    );

    expect(redeemConnectionShareNative).toHaveBeenCalledWith({
      access_token: "wallet-access-token",
      connection_share_code: "share-code",
      target_client_type: "desktop",
    });
    expect(commonApiPost).not.toHaveBeenCalled();
  });

  it("preserves a redeemed connection share client type returned by the backend", async () => {
    (commonApiPost as jest.Mock).mockResolvedValueOnce({
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      client_type: "desktop",
      native_refresh_token: "desktop-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });

    await expect(redeemConnectionShare("share-code")).resolves.toEqual({
      client_type: "desktop",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "desktop-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });
  });
});
