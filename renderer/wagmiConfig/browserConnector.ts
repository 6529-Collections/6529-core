import {
  getConnectedWalletAccounts,
  getWalletAddress,
  hasActiveSessionV2Auth,
  markRecentBrowserConnectorSessionV2Auth,
  setActiveWalletAccount,
  setAuthJwt,
} from "@/services/auth/auth.utils";
import {
  getNativeRefreshToken,
  removeNativeRefreshToken,
} from "@/services/auth/native-refresh-token-storage";
import { getNativeAuthSessionLogin } from "@/services/auth/electron-native-auth-bridge";
import {
  persistSessionResponse,
  redeemConnectionShare,
  refreshSessionV2,
  type RefreshTokenSessionClientType,
  type SessionNativeResponse,
} from "@/services/auth/session-v2.utils";
import {
  BROWSER_CONNECTOR_REQUEST_TIMEOUT_MS,
  normalizeBrowserConnectorAddress,
} from "@/components/browser-connector/browserConnector.helpers";
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

interface BrowserConnectResponseRecord {
  readonly accounts?: unknown;
  readonly chainId?: unknown;
  readonly activeAddress?: unknown;
  readonly auth?: unknown;
  readonly error?: unknown;
}

interface BrowserConnectResult {
  readonly accounts: readonly `0x${string}`[];
  readonly chainId: number;
  readonly accountToActivate: `0x${string}`;
}

type BrowserConnectorConnectResponse = {
  readonly accounts:
    | readonly `0x${string}`[]
    | readonly {
        readonly address: `0x${string}`;
        readonly capabilities: Record<string, unknown>;
      }[];
  readonly chainId: number;
};

const LEGACY_CONNECTION_STORE = "seize-app-connection";
const getConnectionStoreKey = (connectorId: string) =>
  `seize-app-connection-${connectorId}`;
const HEX_ADDRESS_REGEX = /^0x[0-9a-f]{40}$/;
const PENDING_DEEP_LINK_RESPONSE_TTL_MS = BROWSER_CONNECTOR_REQUEST_TIMEOUT_MS;
const PENDING_CONNECT_INTENT_TTL_MS = 120_000;
const DESKTOP_SESSION_AUTH_MODE = "session-v2-desktop";
const LEGACY_NATIVE_SESSION_AUTH_MODE = "session-v2-native";
const INVALID_CONNECTION_PAYLOAD_ERROR =
  "Invalid connection payload: accounts must be array of 0x-prefixed 40-hex strings and chainId must be a positive integer.";
const MISSING_NATIVE_SESSION_AUTH_ERROR =
  "Desktop session-v2 authentication is required for this browser connection.";

export interface BrowserConnectorConnectIntent {
  readonly intendedWalletAddress?: string | null | undefined;
  readonly originWalletAddress?: string | null | undefined;
}

interface NormalizedBrowserConnectorConnectIntent {
  readonly intendedWalletAddress?: `0x${string}` | undefined;
  readonly originWalletAddress?: `0x${string}` | undefined;
}

let pendingConnectIntent: {
  readonly createdAt: number;
  readonly intent: NormalizedBrowserConnectorConnectIntent;
} | null = null;

export const BROWSER_CONNECTOR_CONNECTION_CHANGED_EVENT =
  "6529-browser-connector-connection-changed";

const normalizeIntentAddress = (
  address: string | null | undefined
): `0x${string}` | null => {
  if (typeof address !== "string") {
    return null;
  }
  const normalizedAddress = address.toLowerCase();
  return HEX_ADDRESS_REGEX.test(normalizedAddress)
    ? (normalizedAddress as `0x${string}`)
    : null;
};

const getProviderRequesterAddress = ({
  method,
  params,
}: ProviderRequest): `0x${string}` | null => {
  const requester =
    method === "personal_sign"
      ? params?.[1]
      : method === "eth_sendTransaction"
        ? params?.[0]?.from
        : null;
  const normalizedRequester = normalizeBrowserConnectorAddress(requester);
  return normalizedRequester as `0x${string}` | null;
};

const getKnownDesktopAccountAddresses = (): readonly `0x${string}`[] => {
  const knownAddresses: `0x${string}`[] = [];
  const seen = new Set<string>();

  for (const account of getConnectedWalletAccounts()) {
    const normalizedAddress = normalizeIntentAddress(account.address);
    if (!normalizedAddress || seen.has(normalizedAddress)) {
      continue;
    }

    seen.add(normalizedAddress);
    knownAddresses.push(normalizedAddress);
  }

  return knownAddresses;
};

export const clearBrowserConnectorConnectIntent = (): void => {
  pendingConnectIntent = null;
};

export const setBrowserConnectorConnectIntent = (
  intent: BrowserConnectorConnectIntent
): void => {
  const intendedWalletAddress = normalizeIntentAddress(
    intent.intendedWalletAddress
  );
  const originWalletAddress = normalizeIntentAddress(
    intent.originWalletAddress
  );
  if (!intendedWalletAddress && !originWalletAddress) {
    clearBrowserConnectorConnectIntent();
    return;
  }

  pendingConnectIntent = {
    createdAt: Date.now(),
    intent: {
      ...(intendedWalletAddress ? { intendedWalletAddress } : {}),
      ...(originWalletAddress ? { originWalletAddress } : {}),
    },
  };
};

const consumeBrowserConnectorConnectIntent =
  (): NormalizedBrowserConnectorConnectIntent | null => {
    if (!pendingConnectIntent) {
      return null;
    }
    const { createdAt, intent } = pendingConnectIntent;
    pendingConnectIntent = null;
    if (Date.now() - createdAt > PENDING_CONNECT_INTENT_TTL_MS) {
      return null;
    }
    return intent;
  };

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
  if (accountsInput.length === 0) {
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

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isRefreshTokenClientType = (
  value: unknown
): value is RefreshTokenSessionClientType =>
  value === "native" || value === "desktop";

const getRefreshTokenClientTypeForAuthMode = (
  authMode: string | null
): RefreshTokenSessionClientType | null => {
  if (authMode === DESKTOP_SESSION_AUTH_MODE) {
    return "desktop";
  }
  if (authMode === LEGACY_NATIVE_SESSION_AUTH_MODE) {
    return "native";
  }
  return null;
};

const parseNativeSessionAuthPayload = (
  auth: unknown
): SessionNativeResponse | null => {
  if (typeof auth !== "object" || auth === null) {
    return null;
  }

  const record = auth as {
    readonly sessionVersion?: unknown;
    readonly client_type?: unknown;
    readonly address?: unknown;
    readonly role?: unknown;
    readonly access_token?: unknown;
    readonly access_token_expires_at?: unknown;
    readonly native_refresh_token?: unknown;
    readonly refresh_token_expires_at?: unknown;
  };

  if (
    record.sessionVersion !== "v2" ||
    !isRefreshTokenClientType(record.client_type) ||
    !isNonEmptyString(record.address) ||
    !isNonEmptyString(record.access_token) ||
    !isNonEmptyString(record.access_token_expires_at) ||
    !isNonEmptyString(record.native_refresh_token) ||
    !isNonEmptyString(record.refresh_token_expires_at)
  ) {
    return null;
  }

  const normalizedAddress = record.address.toLowerCase();
  if (!HEX_ADDRESS_REGEX.test(normalizedAddress)) {
    return null;
  }

  return {
    client_type: record.client_type,
    address: normalizedAddress,
    role: typeof record.role === "string" ? record.role : null,
    access_token: record.access_token,
    access_token_expires_at: record.access_token_expires_at,
    native_refresh_token: record.native_refresh_token,
    refresh_token_expires_at: record.refresh_token_expires_at,
  };
};

const parseConnectionShareAuthPayload = (
  auth: unknown
): {
  readonly connectionShareCode: string;
  readonly address: `0x${string}`;
  readonly targetClientType: RefreshTokenSessionClientType;
} | null => {
  if (typeof auth !== "object" || auth === null) {
    return null;
  }

  const record = auth as {
    readonly sessionVersion?: unknown;
    readonly transferType?: unknown;
    readonly connection_share_code?: unknown;
    readonly address?: unknown;
    readonly target_client_type?: unknown;
  };

  if (
    record.sessionVersion !== "v2" ||
    record.transferType !== "connection-share" ||
    !isRefreshTokenClientType(record.target_client_type) ||
    !isNonEmptyString(record.connection_share_code) ||
    !isNonEmptyString(record.address)
  ) {
    return null;
  }

  const normalizedAddress = record.address.toLowerCase();
  if (!HEX_ADDRESS_REGEX.test(normalizedAddress)) {
    return null;
  }

  return {
    connectionShareCode: record.connection_share_code,
    address: normalizedAddress as `0x${string}`,
    targetClientType: record.target_client_type,
  };
};

const parseSignedNativeChallengeAuthPayload = (
  auth: unknown
): {
  readonly serverSignature: string;
  readonly clientSignature: string;
  readonly address: `0x${string}`;
  readonly targetClientType: RefreshTokenSessionClientType;
} | null => {
  if (typeof auth !== "object" || auth === null) {
    return null;
  }

  const record = auth as {
    readonly sessionVersion?: unknown;
    readonly transferType?: unknown;
    readonly server_signature?: unknown;
    readonly client_signature?: unknown;
    readonly address?: unknown;
    readonly target_client_type?: unknown;
  };

  if (
    record.sessionVersion !== "v2" ||
    record.transferType !== "signed-native-challenge" ||
    !isRefreshTokenClientType(record.target_client_type) ||
    !isNonEmptyString(record.server_signature) ||
    !isNonEmptyString(record.client_signature) ||
    !isNonEmptyString(record.address)
  ) {
    return null;
  }

  const normalizedAddress = record.address.toLowerCase();
  if (!HEX_ADDRESS_REGEX.test(normalizedAddress)) {
    return null;
  }

  return {
    serverSignature: record.server_signature,
    clientSignature: record.client_signature,
    address: normalizedAddress as `0x${string}`,
    targetClientType: record.target_client_type,
  };
};

const parseExistingNativeSessionAuthPayload = (
  auth: unknown
): {
  readonly address: `0x${string}`;
  readonly targetClientType: RefreshTokenSessionClientType;
} | null => {
  if (typeof auth !== "object" || auth === null) {
    return null;
  }

  const record = auth as {
    readonly sessionVersion?: unknown;
    readonly transferType?: unknown;
    readonly address?: unknown;
    readonly target_client_type?: unknown;
  };

  if (
    record.sessionVersion !== "v2" ||
    record.transferType !== "existing-native-session" ||
    !isRefreshTokenClientType(record.target_client_type) ||
    !isNonEmptyString(record.address)
  ) {
    return null;
  }

  const normalizedAddress = record.address.toLowerCase();
  if (!HEX_ADDRESS_REGEX.test(normalizedAddress)) {
    return null;
  }

  return {
    address: normalizedAddress as `0x${string}`,
    targetClientType: record.target_client_type,
  };
};

const tryPersistLegacyAuthPayload = ({
  auth,
  primaryConnectedAccount,
  validatedAccounts,
  connectorName,
}: {
  readonly auth: unknown;
  readonly primaryConnectedAccount: `0x${string}`;
  readonly validatedAccounts: readonly `0x${string}`[];
  readonly connectorName: string;
}): void => {
  if (typeof auth !== "object" || auth === null) {
    return;
  }

  const record = auth as {
    readonly address?: unknown;
    readonly token?: unknown;
    readonly refreshToken?: unknown;
    readonly role?: unknown;
  };
  const authAddressLower =
    typeof record.address === "string" ? record.address.toLowerCase() : null;
  const matchingAuthAccount =
    authAddressLower &&
    validatedAccounts.find((account) => account === authAddressLower);
  const shouldPersistAuthForConnectedAccount =
    typeof matchingAuthAccount === "string" &&
    matchingAuthAccount === primaryConnectedAccount;

  if (
    shouldPersistAuthForConnectedAccount &&
    typeof record.token === "string" &&
    typeof record.refreshToken === "string"
  ) {
    setAuthJwt(
      matchingAuthAccount,
      record.token,
      record.refreshToken,
      typeof record.role === "string" ? record.role : undefined
    );
    return;
  }

  if (
    typeof record.address === "string" &&
    typeof record.token === "string" &&
    typeof record.refreshToken === "string"
  ) {
    console.warn(
      `[${connectorName}] Ignoring browser auth payload with non-matching address`,
      {
        authAddress: record.address,
        connectedAccounts: validatedAccounts,
      }
    );
  }
};

const toBrowserConnectorErrorMessage = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "number" || typeof error === "boolean") {
    return String(error);
  }
  return "Browser connector returned an error.";
};

const getBrowserConnectResponseRecord = (
  response: unknown
): BrowserConnectResponseRecord => {
  if (typeof response !== "object" || response === null) {
    throw new Error("Invalid browser connector response");
  }

  const responseRecord = response as BrowserConnectResponseRecord;
  if (responseRecord.error !== undefined && responseRecord.error !== null) {
    throw new Error(toBrowserConnectorErrorMessage(responseRecord.error));
  }

  return responseRecord;
};

const getPrimaryConnectedAccount = ({
  activeAddress,
  validatedAccounts,
}: {
  readonly activeAddress: unknown;
  readonly validatedAccounts: readonly `0x${string}`[];
}): `0x${string}` => {
  const firstValidatedAccount = validatedAccounts[0];
  if (!firstValidatedAccount) {
    throw new Error(INVALID_CONNECTION_PAYLOAD_ERROR);
  }

  const responseActiveAddressLower =
    typeof activeAddress === "string" ? activeAddress.toLowerCase() : null;
  return responseActiveAddressLower !== null &&
    validatedAccounts.includes(responseActiveAddressLower as `0x${string}`)
    ? (responseActiveAddressLower as `0x${string}`)
    : firstValidatedAccount;
};

const processBrowserConnectResponse = async ({
  response,
  requiredAuthClientType,
  connectorName,
}: {
  readonly response: unknown;
  readonly requiredAuthClientType: RefreshTokenSessionClientType | null;
  readonly connectorName: string;
}): Promise<BrowserConnectResult> => {
  const responseRecord = getBrowserConnectResponseRecord(response);
  const validatedConnection = parseConnectionPayload(
    responseRecord.accounts,
    responseRecord.chainId
  );
  if (!validatedConnection) {
    throw new Error(INVALID_CONNECTION_PAYLOAD_ERROR);
  }

  const primaryConnectedAccount = getPrimaryConnectedAccount({
    activeAddress: responseRecord.activeAddress,
    validatedAccounts: validatedConnection.accounts,
  });

  if (requiredAuthClientType) {
    const nativeSessionAuth = parseNativeSessionAuthPayload(
      responseRecord.auth
    );
    const connectionShareAuth = parseConnectionShareAuthPayload(
      responseRecord.auth
    );
    const signedNativeChallengeAuth = parseSignedNativeChallengeAuthPayload(
      responseRecord.auth
    );
    const existingNativeSessionAuth = parseExistingNativeSessionAuthPayload(
      responseRecord.auth
    );
    let nativeSessionToPersist = nativeSessionAuth;

    if (
      nativeSessionToPersist &&
      nativeSessionToPersist.client_type !== requiredAuthClientType
    ) {
      throw new Error(MISSING_NATIVE_SESSION_AUTH_ERROR);
    }

    if (!nativeSessionToPersist && connectionShareAuth) {
      if (connectionShareAuth.targetClientType !== requiredAuthClientType) {
        throw new Error(MISSING_NATIVE_SESSION_AUTH_ERROR);
      }
      if (connectionShareAuth.address !== primaryConnectedAccount) {
        throw new Error(MISSING_NATIVE_SESSION_AUTH_ERROR);
      }
      nativeSessionToPersist = await redeemConnectionShare(
        connectionShareAuth.connectionShareCode,
        connectionShareAuth.targetClientType
      );
    }

    if (!nativeSessionToPersist && signedNativeChallengeAuth) {
      if (
        signedNativeChallengeAuth.targetClientType !== requiredAuthClientType
      ) {
        throw new Error(MISSING_NATIVE_SESSION_AUTH_ERROR);
      }
      if (signedNativeChallengeAuth.address !== primaryConnectedAccount) {
        throw new Error(MISSING_NATIVE_SESSION_AUTH_ERROR);
      }

      const guardedNativeSessionLogin = getNativeAuthSessionLogin();
      if (typeof guardedNativeSessionLogin !== "function") {
        throw new Error(MISSING_NATIVE_SESSION_AUTH_ERROR);
      }

      const sessionResponse = await guardedNativeSessionLogin({
        client_type: signedNativeChallengeAuth.targetClientType,
        server_signature: signedNativeChallengeAuth.serverSignature,
        client_signature: signedNativeChallengeAuth.clientSignature,
        client_address: signedNativeChallengeAuth.address,
      });

      nativeSessionToPersist = sessionResponse;
    }

    if (!nativeSessionToPersist && existingNativeSessionAuth) {
      if (
        existingNativeSessionAuth.targetClientType !== requiredAuthClientType
      ) {
        throw new Error(MISSING_NATIVE_SESSION_AUTH_ERROR);
      }
      if (existingNativeSessionAuth.address !== primaryConnectedAccount) {
        throw new Error(MISSING_NATIVE_SESSION_AUTH_ERROR);
      }

      const nativeRefreshToken = await getNativeRefreshToken(
        existingNativeSessionAuth.address,
        existingNativeSessionAuth.targetClientType
      );
      if (!nativeRefreshToken) {
        throw new Error(MISSING_NATIVE_SESSION_AUTH_ERROR);
      }

      const refreshedNativeSession = await refreshSessionV2({
        address: existingNativeSessionAuth.address,
      });
      if (
        !refreshedNativeSession ||
        refreshedNativeSession.client_type !==
          existingNativeSessionAuth.targetClientType
      ) {
        throw new Error(MISSING_NATIVE_SESSION_AUTH_ERROR);
      }
      nativeSessionToPersist = refreshedNativeSession as SessionNativeResponse;
    }

    if (!nativeSessionToPersist) {
      throw new Error(MISSING_NATIVE_SESSION_AUTH_ERROR);
    }

    if (
      nativeSessionToPersist &&
      nativeSessionToPersist.client_type !== requiredAuthClientType
    ) {
      throw new Error(MISSING_NATIVE_SESSION_AUTH_ERROR);
    }

    if (
      nativeSessionToPersist &&
      nativeSessionToPersist.address.toLowerCase() !== primaryConnectedAccount
    ) {
      throw new Error(MISSING_NATIVE_SESSION_AUTH_ERROR);
    }

    if (nativeSessionToPersist) {
      const isPersisted = await persistSessionResponse(nativeSessionToPersist);
      if (!isPersisted) {
        throw new Error(
          "Couldn't save this browser connection. Please try again."
        );
      }
      markRecentBrowserConnectorSessionV2Auth(nativeSessionToPersist.address);
    }
  } else {
    tryPersistLegacyAuthPayload({
      auth: responseRecord.auth,
      primaryConnectedAccount,
      validatedAccounts: validatedConnection.accounts,
      connectorName,
    });
  }

  return {
    accounts: validatedConnection.accounts,
    chainId: validatedConnection.chainId,
    accountToActivate: primaryConnectedAccount,
  };
};

export function browserConnector(parameters: {
  openUrlFn: (url: string) => void;
  name: string;
  icon: string;
  id: string;
}) {
  const dispatchBrowserConnectorConnectionChanged = (
    address: `0x${string}` | null
  ) => {
    if (globalThis.window === undefined) {
      return;
    }

    globalThis.window.dispatchEvent(
      new CustomEvent(BROWSER_CONNECTOR_CONNECTION_CHANGED_EVENT, {
        detail: { address },
      })
    );
  };

  type PendingDeepLinkResponse = {
    response: ProviderResponse;
    receivedAt: number;
    cleanupTimeout: ReturnType<typeof setTimeout>;
  };

  const connectionStoreKey = getConnectionStoreKey(parameters.id);
  const deepLinkCallbacks: Map<string, (response: ProviderResponse) => void> =
    new Map();
  const pendingDeepLinkResponses: Map<string, PendingDeepLinkResponse> =
    new Map();

  let initialized = false;
  let scheme = "core6529";
  let port = 6529;

  let connectionObject: ConnectionObject = {
    accounts: [],
    chainId: 1,
  };

  const clearPendingDeepLinkResponse = (requestId: string) => {
    const pendingResponse = pendingDeepLinkResponses.get(requestId);
    if (pendingResponse) {
      clearTimeout(pendingResponse.cleanupTimeout);
      pendingDeepLinkResponses.delete(requestId);
    }
  };

  const storePendingDeepLinkResponse = (
    requestId: string,
    response: ProviderResponse
  ) => {
    clearPendingDeepLinkResponse(requestId);
    const cleanupTimeout = setTimeout(() => {
      pendingDeepLinkResponses.delete(requestId);
    }, PENDING_DEEP_LINK_RESPONSE_TTL_MS);
    pendingDeepLinkResponses.set(requestId, {
      response,
      receivedAt: Date.now(),
      cleanupTimeout,
    });
  };

  const clearAllPendingDeepLinkResponses = () => {
    for (const pendingResponse of pendingDeepLinkResponses.values()) {
      clearTimeout(pendingResponse.cleanupTimeout);
    }
    pendingDeepLinkResponses.clear();
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
        clearPendingDeepLinkResponse(requestId);
        callback(data.data);
        deepLinkCallbacks.delete(requestId);
      } else {
        storePendingDeepLinkResponse(requestId, data.data ?? {});
        console.log(`[${name}] No callback found for requestId`, requestId);
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
      clearPendingDeepLinkResponse(requestId);
      callback(pendingResponse.response);
      deepLinkCallbacks.delete(requestId);
    }
  };

  const getExistingNativeSessionAddressForRequest = async (): Promise<
    string | null
  > => {
    const walletAddress = getWalletAddress();
    const normalizedWalletAddress =
      typeof walletAddress === "string" ? walletAddress.toLowerCase() : null;

    if (
      !normalizedWalletAddress ||
      !HEX_ADDRESS_REGEX.test(normalizedWalletAddress) ||
      !hasActiveSessionV2Auth({ address: normalizedWalletAddress })
    ) {
      return null;
    }

    const desktopRefreshToken = await getNativeRefreshToken(
      normalizedWalletAddress,
      "desktop"
    );
    if (!desktopRefreshToken) {
      return null;
    }

    try {
      const refreshedNativeSession = await refreshSessionV2({
        address: normalizedWalletAddress,
      });
      if (
        !refreshedNativeSession ||
        refreshedNativeSession.client_type !== "desktop" ||
        refreshedNativeSession.address.toLowerCase() !==
          normalizedWalletAddress
      ) {
        await removeNativeRefreshToken(normalizedWalletAddress, "desktop");
        return null;
      }

      const isPersisted = await persistSessionResponse(
        refreshedNativeSession as SessionNativeResponse
      );
      if (!isPersisted) {
        await removeNativeRefreshToken(normalizedWalletAddress, "desktop");
        return null;
      }
    } catch (error) {
      await removeNativeRefreshToken(normalizedWalletAddress, "desktop");
      console.warn(
        "[Browser] Ignoring stale desktop session before browser connect",
        error
      );
      return null;
    }

    return normalizedWalletAddress;
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

      const existingNativeSessionAddress =
        await getExistingNativeSessionAddressForRequest();

      return new Promise<BrowserConnectorConnectResponse>((resolve, reject) => {
        const requestId = generateRequestId();
        const t = Date.now();
        const chainId = opts?.chainId || connectionObject.chainId;
        const connectIntent = consumeBrowserConnectorConnectIntent();
        const connectSearchParams = new URLSearchParams({
          task: "connect",
          scheme,
          requestId,
          t: String(t),
          chainId: String(chainId),
          authMode: DESKTOP_SESSION_AUTH_MODE,
        });
        if (existingNativeSessionAddress) {
          connectSearchParams.set(
            "existingAuthAddress",
            existingNativeSessionAddress
          );
        }
        if (connectIntent?.intendedWalletAddress) {
          connectSearchParams.set(
            "intendedWalletAddress",
            connectIntent.intendedWalletAddress
          );
        }
        if (connectIntent?.originWalletAddress) {
          connectSearchParams.set(
            "originWalletAddress",
            connectIntent.originWalletAddress
          );
        }
        const knownWalletAddresses = getKnownDesktopAccountAddresses();
        if (knownWalletAddresses.length > 0) {
          connectSearchParams.set(
            "knownWalletAddresses",
            knownWalletAddresses.join(",")
          );
        }
        const requiredAuthClientType = getRefreshTokenClientTypeForAuthMode(
          connectSearchParams.get("authMode")
        );
        const url = `http://localhost:${port}/browser-connector?${connectSearchParams.toString()}`;
        const timeoutId = setTimeout(() => {
          console.log(`[${this.name}] Deep link callback timed out`, requestId);
          deepLinkCallbacks.delete(requestId);
          clearPendingDeepLinkResponse(requestId);
          reject(new Error("Connection request timed out"));
        }, BROWSER_CONNECTOR_REQUEST_TIMEOUT_MS);

        registerDeepLinkCallback(requestId, (response: unknown) => {
          clearTimeout(timeoutId);
          void (async () => {
            try {
              const {
                accounts: validatedAccounts,
                chainId: validatedChainId,
                accountToActivate,
              } = await processBrowserConnectResponse({
                response,
                requiredAuthClientType,
                connectorName: this.name,
              });
              connectionObject = {
                accounts: [...validatedAccounts],
                chainId: validatedChainId,
              };

              const didSwitch = setActiveWalletAccount(accountToActivate);
              if (!didSwitch && requiredAuthClientType) {
                throw new Error(
                  "Couldn't activate this authenticated browser wallet. Please try again."
                );
              }
              if (!didSwitch) {
                console.log(
                  `[${this.name}] Connected account is not active yet (likely awaiting auth):`,
                  accountToActivate
                );
              }
              await window.store.set(
                connectionStoreKey,
                JSON.stringify(connectionObject)
              );
              dispatchBrowserConnectorConnectionChanged(accountToActivate);

              if (opts?.withCapabilities) {
                const accountsWithCaps = validatedAccounts.map((address) => ({
                  address,
                  capabilities: {} as Record<string, unknown>,
                }));

                resolve({
                  accounts: accountsWithCaps,
                  chainId: validatedChainId,
                });
                return;
              }

              resolve({
                accounts: validatedAccounts,
                chainId: validatedChainId,
              });
            } catch (error) {
              reject(error);
            }
          })();
        });

        parameters.openUrlFn(url);
      });
    },
    async disconnect() {
      deepLinkCallbacks.clear();
      clearAllPendingDeepLinkResponses();
      connectionObject = {
        accounts: [],
        chainId: 1,
      };
      await window.store.remove(connectionStoreKey);
      dispatchBrowserConnectorConnectionChanged(null);
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
            const providerSearchParams = new URLSearchParams({
              task: "provider",
              scheme,
              requestId,
              t: String(t),
              method,
              params: encodedParams,
            });
            const requesterAddress = getProviderRequesterAddress({
              method,
              params: params ?? [],
            });
            if (requesterAddress) {
              providerSearchParams.set("intendedWalletAddress", requesterAddress);
            }
            const url = `http://localhost:${port}/browser-connector?${providerSearchParams.toString()}`;
            const timeoutId = setTimeout(() => {
              console.log(
                `[${this.name}] Deep link callback timed out`,
                requestId
              );
              deepLinkCallbacks.delete(requestId);
              clearPendingDeepLinkResponse(requestId);
              reject(new Error("Provider request timed out"));
            }, BROWSER_CONNECTOR_REQUEST_TIMEOUT_MS);

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
