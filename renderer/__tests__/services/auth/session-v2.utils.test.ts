import { Capacitor } from "@capacitor/core";
import * as Sentry from "@sentry/nextjs";
import { TokenRefreshCancelledError } from "@/errors/authentication";
import { commonApiFetch, commonApiPost } from "@/services/api/common-api";
import {
  getAuthJwt,
  getWalletAddress,
  setAuthJwt,
} from "@/services/auth/auth.utils";
import {
  getNativeRefreshToken,
  isNativeSecureStorageAvailable,
  removeNativeRefreshToken,
  setNativeRefreshToken,
} from "@/services/auth/native-refresh-token-storage";
import {
  __resetSessionRefreshStateForTests,
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
  getWalletAddress: jest.fn(),
  setAuthJwt: jest.fn(),
}));

jest.mock("@/services/auth/native-refresh-token-storage", () => ({
  getNativeRefreshToken: jest.fn(),
  isNativeSecureStorageAvailable: jest.fn(),
  removeNativeRefreshToken: jest.fn(),
  setNativeRefreshToken: jest.fn(),
}));

jest.mock("@sentry/nextjs", () => ({
  __esModule: true,
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

type SessionRefreshTelemetryAttrs = {
  readonly source?: unknown;
  readonly refresh_source?: unknown;
  readonly client_type?: unknown;
  readonly refresh_client_type?: unknown;
  readonly refresh_result?: unknown;
  readonly auth_refresh_outcome?: unknown;
  readonly outcome?: unknown;
  readonly refresh_status_bucket?: unknown;
  readonly refresh_status_code?: unknown;
  readonly status_code?: unknown;
  readonly refresh_duration_bucket_ms?: unknown;
  readonly duration_bucket_ms?: unknown;
};

const getSessionRefreshTelemetry = (
  loggerMock: jest.Mock
): SessionRefreshTelemetryAttrs[] =>
  loggerMock.mock.calls
    .filter(([message]) => message === "auth_session_refresh")
    .map(([, attrs]) => attrs as SessionRefreshTelemetryAttrs);

const getSessionRefreshInfoTelemetry = (): SessionRefreshTelemetryAttrs[] =>
  getSessionRefreshTelemetry(Sentry.logger.info as jest.Mock);

const getSessionRefreshWarnTelemetry = (): SessionRefreshTelemetryAttrs[] =>
  getSessionRefreshTelemetry(Sentry.logger.warn as jest.Mock);

const getTelemetryOutcomes = (
  attrs: SessionRefreshTelemetryAttrs[]
): unknown[] => attrs.map((attr) => attr.auth_refresh_outcome);

const allowedRefreshTelemetryAttrNames = new Set([
  "source",
  "refresh_source",
  "client_type",
  "refresh_client_type",
  "refresh_result",
  "auth_refresh_outcome",
  "outcome",
  "refresh_status_bucket",
  "refresh_status_code",
  "status_code",
  "refresh_duration_bucket_ms",
  "duration_bucket_ms",
]);

const expectNoSensitiveRefreshTelemetry = (
  attrs: SessionRefreshTelemetryAttrs[]
): void => {
  for (const attr of attrs) {
    const unexpectedAttrNames = Object.keys(attr).filter(
      (key) => !allowedRefreshTelemetryAttrNames.has(key)
    );
    expect(unexpectedAttrNames).toEqual([]);
    expect(attr).toHaveProperty("refresh_source", attr.source);
    expect(attr).toHaveProperty("refresh_client_type", attr.client_type);
    expect(attr).toHaveProperty("refresh_result", attr.auth_refresh_outcome);
    expect(attr).toHaveProperty("auth_refresh_outcome", attr.outcome);
    expect(attr).toHaveProperty("refresh_status_bucket");
    if (attr.status_code !== undefined) {
      expect(attr).toHaveProperty("refresh_status_code", attr.status_code);
    }
    if (attr.duration_bucket_ms !== undefined) {
      expect(attr).toHaveProperty(
        "refresh_duration_bucket_ms",
        attr.duration_bucket_ms
      );
    }
    expect(attr).not.toHaveProperty("address");
    expect(attr).not.toHaveProperty("client_address");
    expect(attr).not.toHaveProperty("access_token");
    expect(attr).not.toHaveProperty("auth_jwt");
    expect(attr).not.toHaveProperty("jwt");
    expect(attr).not.toHaveProperty("cookie");
    expect(attr).not.toHaveProperty("cookies");
    expect(attr).not.toHaveProperty("refresh_token");
    expect(attr).not.toHaveProperty("native_refresh_token");
    expect(attr).not.toHaveProperty("profile_id");
    expect(attr).not.toHaveProperty("request_body");
    expect(attr).not.toHaveProperty("body");
    expect(attr).not.toHaveProperty("error");
    expect(attr).not.toHaveProperty("raw_error");
    expect(attr).not.toHaveProperty("raw_error_message");
    expect(attr).not.toHaveProperty("error_message");
    expect(attr).not.toHaveProperty("message");
  }
};

const setNavigatorLocks = (lockManager: LockManager | undefined): void => {
  Object.defineProperty(globalThis.navigator, "locks", {
    configurable: true,
    value: lockManager,
  });
};

describe("session-v2.utils", () => {
  beforeEach(() => {
    __resetSessionRefreshStateForTests();
    jest.resetAllMocks();
    (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(false);
    (commonApiFetch as jest.Mock).mockResolvedValue(undefined);
    (commonApiPost as jest.Mock).mockResolvedValue(undefined);
    (getNativeRefreshToken as jest.Mock).mockResolvedValue(null);
    (isNativeSecureStorageAvailable as jest.Mock).mockReturnValue(true);
    (getAuthJwt as jest.Mock).mockReturnValue(null);
    (getWalletAddress as jest.Mock).mockReturnValue(null);
    (setAuthJwt as jest.Mock).mockReturnValue(true);
    Object.defineProperty(window, "api", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: undefined,
    });
    setNavigatorLocks(undefined);
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
      includeWalletAuth: true,
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

  it("persists desktop refresh-token session responses", async () => {
    await expect(
      persistSessionResponse({
        client_type: "desktop",
        address: "0xabc",
        role: null,
        access_token: "access-token",
        access_token_expires_at: "2026-06-10T00:00:00.000Z",
        native_refresh_token: "desktop-refresh-token",
        refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
      })
    ).resolves.toBe(true);

    expect(setNativeRefreshToken).toHaveBeenCalledWith({
      address: "0xabc",
      refreshToken: "desktop-refresh-token",
      clientType: "desktop",
    });
    expect(setAuthJwt).toHaveBeenCalledWith(
      "0xabc",
      "access-token",
      null,
      undefined,
      { authSessionVersion: "v2" }
    );
  });

  it("keeps Electron refresh tokens in the main process", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });

    await expect(
      persistSessionResponse({
        client_type: "desktop",
        address: "0xabc",
        role: null,
        access_token: "access-token",
        access_token_expires_at: "2026-06-10T00:00:00.000Z",
        native_refresh_token: "",
        refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
      })
    ).resolves.toBe(true);

    expect(setNativeRefreshToken).not.toHaveBeenCalled();
    expect(setAuthJwt).toHaveBeenCalledWith(
      "0xabc",
      "access-token",
      null,
      undefined,
      { authSessionVersion: "v2" }
    );
  });

  it("does not activate a native session after auth changes during secure storage persistence", async () => {
    let finishSecureStorageWrite!: () => void;
    const secureStorageWrite = new Promise<void>((resolve) => {
      finishSecureStorageWrite = resolve;
    });
    let isCurrentAuthState = true;
    (setNativeRefreshToken as jest.Mock).mockReturnValueOnce(
      secureStorageWrite
    );

    const persistence = persistSessionResponse(
      {
        client_type: "native",
        address: "0xabc",
        role: null,
        access_token: "stale-access-token",
        access_token_expires_at: "2026-06-10T00:00:00.000Z",
        native_refresh_token: "stale-native-refresh-token",
        refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
      },
      { shouldPersist: () => isCurrentAuthState }
    );

    expect(setNativeRefreshToken).toHaveBeenCalledWith({
      address: "0xabc",
      refreshToken: "stale-native-refresh-token",
      clientType: "native",
    });
    isCurrentAuthState = false;
    finishSecureStorageWrite();

    await expect(persistence).rejects.toBeInstanceOf(
      TokenRefreshCancelledError
    );
    expect(setAuthJwt).not.toHaveBeenCalled();
    expect(removeNativeRefreshToken).toHaveBeenCalledWith("0xabc");
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

  it("uses the Electron bridge and desktop client type for session-login", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    const sessionResponse = {
      client_type: "desktop" as const,
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "",
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
      client_type: "desktop",
      server_signature: "server-signature",
      client_signature: "client-signature",
      client_address: "0xabc",
    });
    expect(commonApiPost).not.toHaveBeenCalled();
  });

  it("fails closed when the Electron session-login bridge is unavailable", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });

    await expect(
      loginWithSessionV2({
        serverSignature: "server-signature",
        clientSignature: "client-signature",
        signerAddress: "0xabc",
        role: null,
      })
    ).rejects.toThrow("Desktop session login bridge is unavailable");

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
      includeWalletAuth: false,
    });
    expect(getSessionRefreshInfoTelemetry()).toEqual([
      expect.objectContaining({
        source: "refreshSessionV2",
        client_type: "web",
        auth_refresh_outcome: "started",
        outcome: "started",
        refresh_status_bucket: "not_applicable",
      }),
      expect.objectContaining({
        source: "refreshSessionV2",
        client_type: "web",
        auth_refresh_outcome: "success",
        outcome: "success",
        refresh_status_bucket: "not_applicable",
        duration_bucket_ms: expect.any(String),
      }),
    ]);
    expect(getSessionRefreshWarnTelemetry()).toEqual([]);
    expectNoSensitiveRefreshTelemetry(getSessionRefreshInfoTelemetry());
  });

  it("serializes web refreshes through an address-scoped cross-tab lock", async () => {
    const sessionResponse = {
      client_type: "web",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
    };
    const requestLock = jest.fn(
      async <T>(
        _name: string,
        _options: LockOptions,
        callback: (lock: Lock | null) => Promise<T>
      ): Promise<T> => await callback(null)
    );
    setNavigatorLocks({ request: requestLock } as unknown as LockManager);
    (commonApiPost as jest.Mock).mockResolvedValueOnce(sessionResponse);

    await expect(refreshSessionV2({ address: "0xAbC" })).resolves.toBe(
      sessionResponse
    );

    expect(requestLock).toHaveBeenCalledWith(
      "6529:auth-session-refresh:web:0xabc",
      { mode: "exclusive" },
      expect.any(Function)
    );
    expect(commonApiPost).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "auth/session-refresh",
        body: {
          client_type: "web",
          client_address: "0xAbC",
        },
      })
    );
  });

  it("falls back when lock acquisition fails before the refresh starts", async () => {
    const sessionResponse = {
      client_type: "web",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
    };
    const requestLock = jest.fn().mockRejectedValue(new Error("locks broken"));
    setNavigatorLocks({ request: requestLock } as unknown as LockManager);
    (commonApiPost as jest.Mock).mockResolvedValueOnce(sessionResponse);

    await expect(refreshSessionV2({ address: "0xabc" })).resolves.toBe(
      sessionResponse
    );

    expect(requestLock).toHaveBeenCalledTimes(1);
    expect(commonApiPost).toHaveBeenCalledTimes(1);
    expect(getTelemetryOutcomes(getSessionRefreshInfoTelemetry())).toEqual([
      "started",
      "success",
    ]);
  });

  it("does not retry when the refresh task fails after acquiring the lock", async () => {
    const refreshError = new TypeError("Failed to fetch");
    const requestLock = jest.fn(
      async <T>(
        _name: string,
        _options: LockOptions,
        callback: (lock: Lock | null) => Promise<T>
      ): Promise<T> => await callback(null)
    );
    setNavigatorLocks({ request: requestLock } as unknown as LockManager);
    (commonApiPost as jest.Mock).mockRejectedValueOnce(refreshError);

    await expect(refreshSessionV2({ address: "0xabc" })).rejects.toBe(
      refreshError
    );

    expect(requestLock).toHaveBeenCalledTimes(1);
    expect(commonApiPost).toHaveBeenCalledTimes(1);
  });

  it("records an abort while waiting for the cross-tab lock", async () => {
    const abortController = new AbortController();
    const sessionResponse = {
      client_type: "web",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
    };
    const requestLock = jest.fn(
      async <T>(
        _name: string,
        options: LockOptions,
        _callback: (lock: Lock | null) => Promise<T>
      ): Promise<T> =>
        await new Promise<T>((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true }
          );
        })
    );
    setNavigatorLocks({ request: requestLock } as unknown as LockManager);

    const abortedRefresh = refreshSessionV2({
      address: "0xabc",
      abortSignal: abortController.signal,
    });
    abortController.abort();

    await expect(abortedRefresh).rejects.toMatchObject({ name: "AbortError" });
    expect(commonApiPost).not.toHaveBeenCalled();
    expect(getTelemetryOutcomes(getSessionRefreshInfoTelemetry())).toEqual([
      "aborted",
    ]);

    setNavigatorLocks(undefined);
    (commonApiPost as jest.Mock).mockResolvedValueOnce(sessionResponse);
    await expect(refreshSessionV2({ address: "0xABC" })).resolves.toBe(
      sessionResponse
    );
    expect(commonApiPost).toHaveBeenCalledTimes(1);
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
      includeWalletAuth: false,
    });
    expect(getSessionRefreshInfoTelemetry()).toEqual([
      expect.objectContaining({
        client_type: "web",
        auth_refresh_outcome: "started",
        outcome: "started",
        refresh_status_bucket: "not_applicable",
      }),
      expect.objectContaining({
        client_type: "web",
        auth_refresh_outcome: "unauthorized",
        outcome: "unauthorized",
        refresh_status_bucket: "http_401",
        status_code: 401,
        duration_bucket_ms: expect.any(String),
      }),
    ]);
    expect(getSessionRefreshWarnTelemetry()).toEqual([]);
    expectNoSensitiveRefreshTelemetry(getSessionRefreshInfoTelemetry());
  });

  it("shares concurrent refreshes for the same web session context", async () => {
    const sessionResponse = {
      client_type: "web",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
    };
    let resolveRefresh:
      | ((response: typeof sessionResponse) => void)
      | undefined = undefined;
    const refreshPromise = new Promise<typeof sessionResponse>((resolve) => {
      resolveRefresh = resolve;
    });
    (commonApiPost as jest.Mock).mockReturnValueOnce(refreshPromise);

    const firstRefresh = refreshSessionV2({ address: "0xabc" });
    const secondRefresh = refreshSessionV2({ address: "0xABC" });

    expect(commonApiPost).toHaveBeenCalledTimes(1);
    expect(resolveRefresh).toBeDefined();
    resolveRefresh?.(sessionResponse);

    await expect(firstRefresh).resolves.toBe(sessionResponse);
    await expect(secondRefresh).resolves.toBe(sessionResponse);
    expect(getTelemetryOutcomes(getSessionRefreshInfoTelemetry())).toEqual([
      "started",
      "deduped_in_flight",
      "success",
    ]);
    expectNoSensitiveRefreshTelemetry(getSessionRefreshInfoTelemetry());
  });

  it("keeps a shared refresh alive when one consumer aborts", async () => {
    const abortController = new AbortController();
    const sessionResponse = {
      client_type: "web",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
    };
    let resolveRefresh:
      | ((response: typeof sessionResponse) => void)
      | undefined = undefined;
    let internalSignal: AbortSignal | undefined = undefined;
    const refreshPromise = new Promise<typeof sessionResponse>((resolve) => {
      resolveRefresh = resolve;
    });
    (commonApiPost as jest.Mock).mockImplementationOnce(
      ({ signal }: { readonly signal?: AbortSignal | undefined }) => {
        internalSignal = signal;
        return refreshPromise;
      }
    );

    const abortingRefresh = refreshSessionV2({
      address: "0xabc",
      abortSignal: abortController.signal,
    });
    const waitingRefresh = refreshSessionV2({ address: "0xABC" });

    expect(commonApiPost).toHaveBeenCalledTimes(1);
    abortController.abort();

    await expect(abortingRefresh).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(internalSignal?.aborted).toBe(false);

    expect(resolveRefresh).toBeDefined();
    resolveRefresh?.(sessionResponse);
    await expect(waitingRefresh).resolves.toBe(sessionResponse);
    expect(commonApiPost).toHaveBeenCalledTimes(1);
    expect(getTelemetryOutcomes(getSessionRefreshInfoTelemetry())).toEqual([
      "started",
      "deduped_in_flight",
      "aborted",
      "success",
    ]);
    expectNoSensitiveRefreshTelemetry(getSessionRefreshInfoTelemetry());
  });

  it("blocks invalid web session refreshes until persisted auth clears the block", async () => {
    jest.useFakeTimers();
    const unauthorizedError = Object.assign(new Error("Unauthorized"), {
      status: 401,
      response: { status: 401 },
    });
    const sessionResponse = {
      client_type: "web",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
    };
    (commonApiPost as jest.Mock)
      .mockRejectedValueOnce(unauthorizedError)
      .mockResolvedValueOnce(sessionResponse);

    try {
      await expect(refreshSessionV2({ address: "0xabc" })).resolves.toBeNull();
      await expect(refreshSessionV2({ address: "0xABC" })).resolves.toBeNull();

      await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
      await expect(refreshSessionV2({ address: "0xABC" })).resolves.toBeNull();
      expect(commonApiPost).toHaveBeenCalledTimes(1);

      await expect(persistSessionResponse(sessionResponse)).resolves.toBe(true);
      await expect(refreshSessionV2({ address: "0xABC" })).resolves.toBe(
        sessionResponse
      );
      expect(commonApiPost).toHaveBeenCalledTimes(2);

      expect(getTelemetryOutcomes(getSessionRefreshInfoTelemetry())).toEqual([
        "started",
        "unauthorized",
        "cooldown_used_empty",
        "cooldown_used_empty",
        "started",
        "success",
      ]);
      expectNoSensitiveRefreshTelemetry(getSessionRefreshInfoTelemetry());
    } finally {
      jest.useRealTimers();
    }
  });

  it("clears a failed refresh cooldown after successful auth persistence", async () => {
    const unauthorizedError = Object.assign(new Error("Unauthorized"), {
      status: 401,
      response: { status: 401 },
    });
    const sessionResponse = {
      client_type: "web",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
    };
    (commonApiPost as jest.Mock)
      .mockRejectedValueOnce(unauthorizedError)
      .mockResolvedValueOnce(sessionResponse);

    await expect(refreshSessionV2({ address: "0xabc" })).resolves.toBeNull();
    await expect(persistSessionResponse(sessionResponse)).resolves.toBe(true);
    await expect(refreshSessionV2({ address: "0xABC" })).resolves.toBe(
      sessionResponse
    );

    expect(commonApiPost).toHaveBeenCalledTimes(2);
    expectNoSensitiveRefreshTelemetry(getSessionRefreshInfoTelemetry());
  });

  it("delays transport failure retries without replaying a stale error", async () => {
    jest.useFakeTimers();
    const networkError = new Error("Failed to fetch");
    const sessionResponse = {
      client_type: "web",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
    };
    (commonApiPost as jest.Mock)
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(sessionResponse);

    try {
      await expect(refreshSessionV2({ address: "0xabc" })).rejects.toThrow(
        "Failed to fetch"
      );

      const retriedRefresh = refreshSessionV2({ address: "0xABC" });
      expect(commonApiPost).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(250);
      await expect(retriedRefresh).resolves.toBe(sessionResponse);
      expect(commonApiPost).toHaveBeenCalledTimes(2);
      expect(getTelemetryOutcomes(getSessionRefreshInfoTelemetry())).toEqual([
        "started",
        "cooldown_used_retry",
        "started",
        "success",
      ]);
      expectNoSensitiveRefreshTelemetry(getSessionRefreshInfoTelemetry());
      expect(getSessionRefreshWarnTelemetry()).toEqual([
        expect.objectContaining({
          client_type: "web",
          auth_refresh_outcome: "network_error",
          outcome: "network_error",
          refresh_status_bucket: "network_error",
          duration_bucket_ms: expect.any(String),
        }),
      ]);
      expectNoSensitiveRefreshTelemetry(getSessionRefreshWarnTelemetry());
    } finally {
      jest.useRealTimers();
    }
  });

  it("short-circuits refresh retries for sixty seconds while rate limited", async () => {
    jest.useFakeTimers();
    const rateLimitError = Object.assign(new Error("Rate limit exceeded"), {
      status: 429,
      response: {
        status: 429,
        headers: new Headers({
          "Retry-After": "1",
        }),
      },
    });
    const sessionResponse = {
      client_type: "web",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
    };
    (commonApiPost as jest.Mock)
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce(sessionResponse);

    try {
      await expect(refreshSessionV2({ address: "0xabc" })).rejects.toBe(
        rateLimitError
      );
      await expect(refreshSessionV2({ address: "0xABC" })).resolves.toBeNull();

      await jest.advanceTimersByTimeAsync(59_000);
      await expect(refreshSessionV2({ address: "0xABC" })).resolves.toBeNull();
      expect(commonApiPost).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1_000);
      await expect(refreshSessionV2({ address: "0xABC" })).resolves.toBe(
        sessionResponse
      );

      expect(commonApiPost).toHaveBeenCalledTimes(2);
      expect(getTelemetryOutcomes(getSessionRefreshInfoTelemetry())).toEqual([
        "started",
        "cooldown_used_rate_limit",
        "cooldown_used_rate_limit",
        "started",
        "success",
      ]);
      expect(getSessionRefreshWarnTelemetry()).toEqual([
        expect.objectContaining({
          client_type: "web",
          auth_refresh_outcome: "backend_error",
          outcome: "backend_error",
          status_code: 429,
          duration_bucket_ms: expect.any(String),
        }),
      ]);
      expectNoSensitiveRefreshTelemetry(getSessionRefreshInfoTelemetry());
      expectNoSensitiveRefreshTelemetry(getSessionRefreshWarnTelemetry());
    } finally {
      jest.useRealTimers();
    }
  });

  it("counts aborted refreshes without logging them as failures", async () => {
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      refreshSessionV2({
        address: "0xabc",
        abortSignal: abortController.signal,
      })
    ).rejects.toMatchObject({
      name: "AbortError",
    });

    expect(commonApiPost).not.toHaveBeenCalled();
    expect(getSessionRefreshInfoTelemetry()).toEqual([
      expect.objectContaining({
        client_type: "web",
        auth_refresh_outcome: "aborted",
        outcome: "aborted",
        refresh_status_bucket: "aborted",
      }),
    ]);
    expect(getSessionRefreshWarnTelemetry()).toEqual([]);
    expectNoSensitiveRefreshTelemetry(getSessionRefreshInfoTelemetry());
  });

  it("logs non-401 backend refresh errors with status only", async () => {
    const backendError = Object.assign(
      new Error("server leaked secret-token"),
      {
        status: 500,
        response: { status: 500 },
      }
    );
    (commonApiPost as jest.Mock).mockRejectedValueOnce(backendError);

    await expect(refreshSessionV2({ address: "0xabc" })).rejects.toBe(
      backendError
    );

    expect(getSessionRefreshWarnTelemetry()).toEqual([
      expect.objectContaining({
        client_type: "web",
        auth_refresh_outcome: "backend_error",
        outcome: "backend_error",
        refresh_status_bucket: "http_5xx",
        status_code: 500,
        duration_bucket_ms: expect.any(String),
      }),
    ]);
    expect(JSON.stringify(getSessionRefreshWarnTelemetry())).not.toContain(
      "secret-token"
    );
    expectNoSensitiveRefreshTelemetry(getSessionRefreshWarnTelemetry());
  });

  it("buckets non-401 4xx refresh errors separately from 401s", async () => {
    const forbiddenError = Object.assign(new Error("Forbidden"), {
      status: 403,
      response: { status: 403 },
    });
    (commonApiPost as jest.Mock).mockRejectedValueOnce(forbiddenError);

    await expect(refreshSessionV2({ address: "0xabc" })).rejects.toBe(
      forbiddenError
    );

    expect(getSessionRefreshWarnTelemetry()).toEqual([
      expect.objectContaining({
        client_type: "web",
        auth_refresh_outcome: "backend_error",
        outcome: "backend_error",
        refresh_status_bucket: "http_4xx",
        status_code: 403,
        duration_bucket_ms: expect.any(String),
      }),
    ]);
    expectNoSensitiveRefreshTelemetry(getSessionRefreshWarnTelemetry());
  });

  it("starts a new refresh immediately after the previous caller aborts", async () => {
    const abortController = new AbortController();
    const sessionResponse = {
      client_type: "web",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
    };

    (commonApiPost as jest.Mock)
      .mockImplementationOnce(
        ({ signal }: { readonly signal?: AbortSignal | undefined }) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener(
              "abort",
              () => reject(new DOMException("aborted", "AbortError")),
              { once: true }
            );
          })
      )
      .mockResolvedValueOnce(sessionResponse);

    const abortedRefresh = refreshSessionV2({
      address: "0xabc",
      abortSignal: abortController.signal,
    });

    expect(commonApiPost).toHaveBeenCalledTimes(1);
    abortController.abort();

    await expect(abortedRefresh).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(refreshSessionV2({ address: "0xABC" })).resolves.toBe(
      sessionResponse
    );

    expect(commonApiPost).toHaveBeenCalledTimes(2);
    expect(getTelemetryOutcomes(getSessionRefreshInfoTelemetry())).toEqual([
      "started",
      "aborted",
      "started",
      "success",
    ]);
    expectNoSensitiveRefreshTelemetry(getSessionRefreshInfoTelemetry());
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
      includeWalletAuth: false,
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

  it("logs native session refresh success telemetry", async () => {
    (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(true);
    (getNativeRefreshToken as jest.Mock).mockResolvedValue(
      "native-refresh-token"
    );
    const sessionResponse = {
      client_type: "native",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "rotated-native-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    };
    (commonApiPost as jest.Mock).mockResolvedValueOnce(sessionResponse);

    await expect(refreshSessionV2({ address: "0xabc" })).resolves.toBe(
      sessionResponse
    );

    expect(getSessionRefreshInfoTelemetry()).toEqual([
      expect.objectContaining({
        client_type: "native",
        auth_refresh_outcome: "started",
        outcome: "started",
        refresh_status_bucket: "not_applicable",
      }),
      expect.objectContaining({
        client_type: "native",
        auth_refresh_outcome: "success",
        outcome: "success",
        refresh_status_bucket: "not_applicable",
        duration_bucket_ms: expect.any(String),
      }),
    ]);
    expectNoSensitiveRefreshTelemetry(getSessionRefreshInfoTelemetry());
  });

  it("refreshes desktop sessions through the Electron bridge", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    const sessionResponse = {
      client_type: "desktop" as const,
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "",
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

    expect(sessionRefresh).toHaveBeenCalledWith({
      client_type: "desktop",
      client_address: "0xabc",
    });
    expect(getNativeRefreshToken).not.toHaveBeenCalled();
    expect(commonApiPost).not.toHaveBeenCalled();
    expect(getSessionRefreshInfoTelemetry()).toEqual([
      expect.objectContaining({
        client_type: "desktop",
        auth_refresh_outcome: "started",
      }),
      expect.objectContaining({
        client_type: "desktop",
        auth_refresh_outcome: "success",
      }),
    ]);
  });

  it("fails closed when the Electron session-refresh bridge is unavailable", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });

    await expect(refreshSessionV2({ address: "0xabc" })).rejects.toThrow(
      "Desktop session refresh bridge is unavailable"
    );

    expect(commonApiPost).not.toHaveBeenCalled();
  });

  it("rejects an aborted Electron session refresh without returning its late response", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    const sessionResponse = {
      client_type: "desktop" as const,
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    };
    let resolveSessionRefresh!: (response: typeof sessionResponse) => void;
    const sessionRefresh = jest.fn(
      () =>
        new Promise<typeof sessionResponse>((resolve) => {
          resolveSessionRefresh = resolve;
        })
    );
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: { sessionRefresh },
    });
    const abortController = new AbortController();

    const refreshPromise = refreshSessionV2({
      address: "0xabc",
      abortSignal: abortController.signal,
    });
    expect(sessionRefresh).toHaveBeenCalledTimes(1);
    abortController.abort();

    await expect(refreshPromise).rejects.toMatchObject({ name: "AbortError" });
    resolveSessionRefresh(sessionResponse);
    await Promise.resolve();

    expect(commonApiPost).not.toHaveBeenCalled();
  });

  it("counts missing native refresh tokens as unauthorized without a backend request", async () => {
    (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(true);
    (getNativeRefreshToken as jest.Mock).mockResolvedValue(null);

    await expect(refreshSessionV2({ address: "0xabc" })).resolves.toBeNull();

    expect(commonApiPost).not.toHaveBeenCalled();
    expect(getSessionRefreshInfoTelemetry()).toEqual([
      expect.objectContaining({
        client_type: "native",
        auth_refresh_outcome: "unauthorized",
        outcome: "unauthorized",
        refresh_status_bucket: "unauthorized",
      }),
    ]);
    expect(getSessionRefreshWarnTelemetry()).toEqual([]);
    expectNoSensitiveRefreshTelemetry(getSessionRefreshInfoTelemetry());
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
      includeWalletAuth: false,
    });
    expect(getSessionRefreshInfoTelemetry()).toEqual([
      expect.objectContaining({
        client_type: "native",
        auth_refresh_outcome: "started",
        outcome: "started",
        refresh_status_bucket: "not_applicable",
      }),
      expect.objectContaining({
        client_type: "native",
        auth_refresh_outcome: "unauthorized",
        outcome: "unauthorized",
        refresh_status_bucket: "http_401",
        status_code: 401,
        duration_bucket_ms: expect.any(String),
      }),
    ]);
    expectNoSensitiveRefreshTelemetry(getSessionRefreshInfoTelemetry());
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

  it("fails closed when the Electron session-logout bridge is unavailable", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });

    await expect(logoutSessionV2({ address: "0xabc" })).rejects.toThrow(
      "Desktop session logout bridge is unavailable"
    );

    expect(commonApiPost).not.toHaveBeenCalled();
  });

  it("revokes desktop sessions through the Electron bridge", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    const sessionLogout = jest.fn().mockResolvedValueOnce(undefined);
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: { sessionLogout },
    });
    (getAuthJwt as jest.Mock).mockReturnValue("wallet-access-token");

    await logoutSessionV2({ address: "0xabc", allSessions: true });

    expect(sessionLogout).toHaveBeenCalledWith({
      access_token: "wallet-access-token",
      client_type: "desktop",
      client_address: "0xabc",
      all_sessions: true,
    });
    expect(getNativeRefreshToken).not.toHaveBeenCalled();
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

  it("creates a desktop connection share when requested", async () => {
    const shareResponse = {
      connection_share_code: "share-code",
      expires_at: "2026-06-10T00:00:00.000Z",
      address: "0xabc",
      role: null,
      target_client_type: "desktop",
      deep_link_path:
        "/accept-connection-sharing?connection_share_code=share-code",
    };
    (commonApiPost as jest.Mock).mockResolvedValueOnce(shareResponse);

    await expect(
      createConnectionShare({ targetClientType: "desktop" })
    ).resolves.toBe(shareResponse);

    expect(commonApiPost).toHaveBeenCalledWith({
      endpoint: "auth/connection-share",
      body: {
        target_client_type: "desktop",
      },
      credentials: "include",
      signal: undefined,
    });
  });

  it("creates desktop connection shares through the Electron bridge", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    const shareResponse = {
      connection_share_code: "share-code",
      expires_at: "2026-06-10T00:00:00.000Z",
      address: "0xabc",
      role: null,
      target_client_type: "desktop" as const,
      deep_link_path:
        "/accept-connection-sharing?connection_share_code=share-code",
    };
    const createConnectionShareNative = jest
      .fn()
      .mockResolvedValueOnce(shareResponse);
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: { createConnectionShare: createConnectionShareNative },
    });
    (getAuthJwt as jest.Mock).mockReturnValue("wallet-access-token");
    (getWalletAddress as jest.Mock).mockReturnValue("0xabc");

    await expect(
      createConnectionShare({ targetClientType: "desktop" })
    ).resolves.toBe(shareResponse);

    expect(createConnectionShareNative).toHaveBeenCalledWith({
      access_token: "wallet-access-token",
      target_client_type: "desktop",
      client_type: "desktop",
      client_address: "0xabc",
    });
    expect(getNativeRefreshToken).not.toHaveBeenCalled();
    expect(commonApiPost).not.toHaveBeenCalled();
  });

  it("fails closed when the Electron connection-share bridge is unavailable", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    (getWalletAddress as jest.Mock).mockReturnValue("0xabc");

    await expect(createConnectionShare({})).rejects.toThrow(
      "Desktop connection-share bridge is unavailable"
    );

    expect(commonApiPost).not.toHaveBeenCalled();
  });

  it("rejects an aborted Electron connection share without returning its late code", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    const shareResponse = {
      connection_share_code: "share-code",
      expires_at: "2026-06-10T00:00:00.000Z",
      address: "0xabc",
      role: null,
      target_client_type: "native" as const,
      deep_link_path:
        "/accept-connection-sharing?connection_share_code=share-code",
    };
    let resolveConnectionShare!: (response: typeof shareResponse) => void;
    const createConnectionShareNative = jest.fn(
      () =>
        new Promise<typeof shareResponse>((resolve) => {
          resolveConnectionShare = resolve;
        })
    );
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: { createConnectionShare: createConnectionShareNative },
    });
    (getWalletAddress as jest.Mock).mockReturnValue("0xabc");
    const abortController = new AbortController();

    const sharePromise = createConnectionShare({
      signal: abortController.signal,
    });
    await Promise.resolve();
    expect(createConnectionShareNative).toHaveBeenCalledTimes(1);
    abortController.abort();

    await expect(sharePromise).rejects.toMatchObject({ name: "AbortError" });
    resolveConnectionShare(shareResponse);
    await Promise.resolve();

    expect(commonApiPost).not.toHaveBeenCalled();
  });

  it("creates a native connection share with native source-session proof", async () => {
    (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(true);
    (getWalletAddress as jest.Mock).mockReturnValue("0xabc");
    (getNativeRefreshToken as jest.Mock).mockResolvedValue(
      "native-refresh-token"
    );
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
        client_type: "native",
        client_address: "0xabc",
        native_refresh_token: "native-refresh-token",
      },
      credentials: "include",
      signal: undefined,
    });
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

  it("creates legacy desktop shares through the Electron bridge", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
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
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: {
        createLegacyDesktopConnectionShare:
          createLegacyDesktopConnectionShareNative,
      },
    });
    (getAuthJwt as jest.Mock).mockReturnValue("wallet-access-token");
    (getWalletAddress as jest.Mock).mockReturnValue("0xabc");

    await expect(createLegacyDesktopConnectionShare({})).resolves.toBe(
      shareResponse
    );

    expect(createLegacyDesktopConnectionShareNative).toHaveBeenCalledWith({
      access_token: "wallet-access-token",
      client_type: "desktop",
      client_address: "0xabc",
    });
    expect(getNativeRefreshToken).not.toHaveBeenCalled();
    expect(commonApiPost).not.toHaveBeenCalled();
  });

  it("fails closed when the Electron legacy-share bridge is unavailable", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    (getWalletAddress as jest.Mock).mockReturnValue("0xabc");

    await expect(createLegacyDesktopConnectionShare({})).rejects.toThrow(
      "Desktop legacy connection-share bridge is unavailable"
    );

    expect(commonApiPost).not.toHaveBeenCalled();
  });

  it("rejects an aborted Electron legacy share without returning its late token", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    const shareResponse = {
      refresh_token: "legacy-refresh-token",
      address: "0xabc",
      role: null,
      deep_link_path:
        "/accept-connection-sharing?token=legacy-refresh-token&address=0xabc",
    };
    let resolveLegacyShare!: (response: typeof shareResponse) => void;
    const createLegacyDesktopConnectionShareNative = jest.fn(
      () =>
        new Promise<typeof shareResponse>((resolve) => {
          resolveLegacyShare = resolve;
        })
    );
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: {
        createLegacyDesktopConnectionShare:
          createLegacyDesktopConnectionShareNative,
      },
    });
    (getWalletAddress as jest.Mock).mockReturnValue("0xabc");
    const abortController = new AbortController();

    const sharePromise = createLegacyDesktopConnectionShare({
      signal: abortController.signal,
    });
    await Promise.resolve();
    expect(createLegacyDesktopConnectionShareNative).toHaveBeenCalledTimes(1);
    abortController.abort();

    await expect(sharePromise).rejects.toMatchObject({ name: "AbortError" });
    resolveLegacyShare(shareResponse);
    await Promise.resolve();

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

  it("redeems a connection share as a desktop session when requested", async () => {
    (commonApiPost as jest.Mock).mockResolvedValueOnce({
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "desktop-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });

    await expect(
      redeemConnectionShare("share-code", "desktop")
    ).resolves.toEqual({
      client_type: "desktop",
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "desktop-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    });

    expect(commonApiPost).toHaveBeenCalledWith({
      endpoint: "auth/connection-share/redeem",
      body: {
        connection_share_code: "share-code",
        target_client_type: "desktop",
      },
      credentials: "include",
    });
  });

  it("redeems desktop connection shares through the Electron bridge", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });
    const redeemedResponse = {
      client_type: "desktop" as const,
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    };
    const redeemConnectionShareNative = jest
      .fn()
      .mockResolvedValueOnce(redeemedResponse);
    Object.defineProperty(window, "nativeAuth", {
      configurable: true,
      value: { redeemConnectionShare: redeemConnectionShareNative },
    });
    (getAuthJwt as jest.Mock).mockReturnValue("wallet-access-token");

    await expect(redeemConnectionShare("share-code")).resolves.toBe(
      redeemedResponse
    );

    expect(redeemConnectionShareNative).toHaveBeenCalledWith({
      access_token: "wallet-access-token",
      connection_share_code: "share-code",
      target_client_type: "desktop",
    });
    expect(commonApiPost).not.toHaveBeenCalled();
  });

  it("fails closed when the Electron connection-redeem bridge is unavailable", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {},
    });

    await expect(redeemConnectionShare("share-code")).rejects.toThrow(
      "Desktop connection redeem bridge is unavailable"
    );

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
