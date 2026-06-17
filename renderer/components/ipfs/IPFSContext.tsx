"use client";

import { publicEnv } from "@/config/env";
import {
  normalizeDecentralizedMediaUrl,
  parseDecentralizedMediaRef,
  to6529ResolverUrl,
} from "@/lib/media/decentralized-media";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { isElectron } from "../../helpers";
import IpfsService from "./IPFSService";

interface IpfsUrls {
  webui: string;
  api: string;
  gateway: string;
}

interface IpfsContextType {
  ipfsService: IpfsService | null;
  ipfsUrls: IpfsUrls | undefined;
}

const IpfsContext = createContext<IpfsContextType | undefined>(undefined);

let cachedGatewayBase: string | null = null;

const normalizeGatewayBase = (gatewayEndpoint: string): string => {
  let trimmed = gatewayEndpoint;
  while (trimmed.endsWith("/")) {
    trimmed = trimmed.slice(0, -1);
  }

  return trimmed.endsWith("/ipfs") ? trimmed.slice(0, -5) : trimmed;
};

const buildIpfsConfig = (input: {
  apiEndpoint?: string | null | undefined;
  gatewayEndpoint?: string | null | undefined;
  mfsPath?: string | null | undefined;
  ipfsPort?: number | null | undefined;
  ipfsRpcPort?: number | null | undefined;
}) => {
  const apiEndpoint =
    input.apiEndpoint?.trim() ||
    (input.ipfsRpcPort ? `http://127.0.0.1:${input.ipfsRpcPort}` : "");
  const gatewayEndpoint =
    input.gatewayEndpoint?.trim() ||
    (input.ipfsPort ? `http://127.0.0.1:${input.ipfsPort}` : "");

  if (!apiEndpoint || !gatewayEndpoint) {
    throw new Error("Missing IPFS_API_ENDPOINT or IPFS_GATEWAY_ENDPOINT");
  }

  const trimmedGatewayEndpoint = gatewayEndpoint.replace(/\/+$/, "");
  const gatewayBase = normalizeGatewayBase(trimmedGatewayEndpoint);

  return {
    apiEndpoint,
    gatewayEndpoint: trimmedGatewayEndpoint,
    gatewayBase,
    mfsPath: input.mfsPath ?? undefined,
  } as const;
};

type IpfsConfigInput = Parameters<typeof buildIpfsConfig>[0];

const isOptionalStringField = (
  value: unknown
): value is string | null | undefined =>
  value === undefined || value === null || typeof value === "string";

const isOptionalPortField = (
  value: unknown
): value is number | null | undefined =>
  value === undefined ||
  value === null ||
  (typeof value === "number" && Number.isInteger(value) && value > 0);

const isIpfsConfigInput = (value: unknown): value is IpfsConfigInput => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (
    !isOptionalStringField(candidate["apiEndpoint"]) ||
    !isOptionalStringField(candidate["gatewayEndpoint"]) ||
    !isOptionalStringField(candidate["mfsPath"]) ||
    !isOptionalPortField(candidate["ipfsPort"]) ||
    !isOptionalPortField(candidate["ipfsRpcPort"])
  ) {
    return false;
  }

  const hasApiConfig =
    (typeof candidate["apiEndpoint"] === "string" &&
      candidate["apiEndpoint"].trim() !== "") ||
    typeof candidate["ipfsRpcPort"] === "number";
  const hasGatewayConfig =
    (typeof candidate["gatewayEndpoint"] === "string" &&
      candidate["gatewayEndpoint"].trim() !== "") ||
    typeof candidate["ipfsPort"] === "number";

  return hasApiConfig && hasGatewayConfig;
};

const readIpfsConfig = async () => {
  const bridge =
    typeof window !== "undefined"
      ? (window as Window & { api?: typeof window.api }).api
      : undefined;
  if (
    typeof bridge?.getIpfsInfo !== "function" ||
    typeof bridge?.getInfo !== "function"
  ) {
    return buildIpfsConfig({
      apiEndpoint: publicEnv.IPFS_API_ENDPOINT,
      gatewayEndpoint: publicEnv.IPFS_GATEWAY_ENDPOINT,
      mfsPath: publicEnv.IPFS_MFS_PATH,
    });
  }

  const fallbackToAppInfo = async (reason: string, details?: unknown) => {
    console.error(
      `Failed to resolve IPFS config from getIpfsInfo(), falling back to getInfo()/buildIpfsConfig(): ${reason}`,
      details
    );
    const appInfo = await bridge.getInfo();
    return buildIpfsConfig(appInfo ?? {});
  };

  let ipfsInfo: unknown;
  try {
    ipfsInfo = await bridge.getIpfsInfo();
  } catch (error) {
    return fallbackToAppInfo("bridge call failed", error);
  }

  if (!isIpfsConfigInput(ipfsInfo)) {
    return fallbackToAppInfo("invalid getIpfsInfo() payload shape", ipfsInfo);
  }

  try {
    return buildIpfsConfig(ipfsInfo);
  } catch (error) {
    return fallbackToAppInfo("invalid getIpfsInfo() payload", {
      ipfsInfo,
      error,
    });
  }
};

const getEnv = async () => readIpfsConfig();

export const getConfiguredGatewayBaseForSync = (): string | null => {
  const runtimeGatewayEndpoint = (
    publicEnv as typeof publicEnv & {
      IPFS_GATEWAY_ENDPOINT?: string;
    }
  ).IPFS_GATEWAY_ENDPOINT;
  const configuredGatewayEndpoint = runtimeGatewayEndpoint ?? cachedGatewayBase;
  if (!configuredGatewayEndpoint) {
    return null;
  }
  return normalizeGatewayBase(configuredGatewayEndpoint);
};

export const IpfsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [ipfsService, setIpfsService] = useState<IpfsService | null>(null);
  const [ipfsUrls, setIpfsUrls] = useState<IpfsUrls | undefined>(undefined);

  useEffect(() => {
    if (ipfsService) return;
    if (typeof window === "undefined") {
      return;
    }
    if (!isElectron() && !publicEnv.IPFS_API_ENDPOINT) {
      return;
    }

    getEnv()
      .then((info) => {
        cachedGatewayBase = info.gatewayBase;
        const service = new IpfsService({
          apiEndpoint: info.apiEndpoint,
          mfsPath: info.mfsPath,
        });
        setIpfsUrls({
          webui: `${info.apiEndpoint}/webui`,
          api: info.apiEndpoint,
          gateway: info.gatewayEndpoint,
        });
        service.init();
        setIpfsService(service);
      })
      .catch((error: unknown) => {
        console.error("Error initializing IPFS service", error);
      });
  }, [ipfsService]);

  const value = useMemo(
    () => ({ ipfsService, ipfsUrls }),
    [ipfsService, ipfsUrls]
  );

  return <IpfsContext.Provider value={value}>{children}</IpfsContext.Provider>;
};

export const useIpfsContext = (): IpfsContextType => {
  const context = useContext(IpfsContext);
  if (!context) {
    throw new Error("useIpfsContext must be used within an IpfsProvider");
  }
  return context;
};

export const useIpfsService = (): IpfsService | null => {
  const context = useContext(IpfsContext);
  if (!context) {
    throw new Error("useIpfsService must be used within an IpfsProvider");
  }
  return context.ipfsService;
};

export const resolveIpfsUrlSync = (url: string) => {
  try {
    const parsed = parseDecentralizedMediaRef(url);
    if (!parsed) {
      return url;
    }

    return to6529ResolverUrl(parsed, publicEnv.MEDIA_RESOLVER_ENDPOINT);
  } catch (error) {
    console.error("Error resolving IPFS URL", error);
    return url;
  }
};

export const resolveIpfsUrlAsync = async (url: string) =>
  resolveIpfsUrlSync(url);

export const resolveIpfsUrl = (url: string) => {
  return resolveIpfsUrlSync(url);
};

export const resolveDecentralizedMediaUrlSync = (url: string) =>
  normalizeDecentralizedMediaUrl(url, publicEnv.MEDIA_RESOLVER_ENDPOINT) ?? url;
