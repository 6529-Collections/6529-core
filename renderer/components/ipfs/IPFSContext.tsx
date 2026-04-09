"use client";

import { publicEnv } from "@/config/env";
import { getConfiguredIpfsGatewayHost } from "@/lib/media/ipfs-gateways";
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
  apiEndpoint?: string | null;
  gatewayEndpoint?: string | null;
  mfsPath?: string | null;
  ipfsPort?: number | null;
  ipfsRpcPort?: number | null;
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

const readIpfsConfig = async () => {
  const bridge =
    typeof window !== "undefined"
      ? (window as Window & { api?: typeof window.api }).api
      : undefined;
  if (!bridge) {
    throw new Error("Electron bridge is unavailable");
  }

  try {
    const ipfsInfo = await bridge.getIpfsInfo();
    return buildIpfsConfig(ipfsInfo ?? {});
  } catch (error) {
    console.error(
      "Failed to resolve IPFS config from getIpfsInfo(), falling back to getInfo()/buildIpfsConfig()",
      error
    );
    const appInfo = await bridge.getInfo();
    return buildIpfsConfig(appInfo ?? {});
  }
};

const getEnv = async () => readIpfsConfig();

const getConfiguredGatewayBaseForSync = (): string | null => {
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

function joinUrlPaths(basePathname: string, pathName: string): string {
  const normalizedBase = basePathname.endsWith("/")
    ? basePathname.slice(0, -1)
    : basePathname;
  const normalizedPath = pathName.startsWith("/") ? pathName : `/${pathName}`;

  if (!normalizedBase) {
    return normalizedPath;
  }

  return `${normalizedBase}${normalizedPath}`;
}

function rewriteGatewayUrl(url: string, gatewayBase: string): string | null {
  const configuredGatewayHost = getConfiguredIpfsGatewayHost(gatewayBase);
  if (!configuredGatewayHost) {
    return null;
  }

  const parsedUrl = new URL(url);
  const normalizedHost = parsedUrl.hostname.toLowerCase();
  if (normalizedHost !== "ipfs.io" && normalizedHost !== "www.ipfs.io") {
    return null;
  }

  if (!parsedUrl.pathname.startsWith("/ipfs/")) {
    return null;
  }

  const configuredGatewayBase = new URL(gatewayBase);
  parsedUrl.protocol = configuredGatewayBase.protocol;
  parsedUrl.hostname = configuredGatewayBase.hostname;
  parsedUrl.port = configuredGatewayBase.port;
  parsedUrl.pathname = joinUrlPaths(
    configuredGatewayBase.pathname,
    parsedUrl.pathname
  );
  return parsedUrl.toString();
}

export const IpfsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [ipfsService, setIpfsService] = useState<IpfsService | null>(null);
  const [ipfsUrls, setIpfsUrls] = useState<IpfsUrls | undefined>(undefined);

  useEffect(() => {
    if (ipfsService) return;
    if (
      typeof window === "undefined" ||
      typeof window.api?.getInfo !== "function"
    ) {
      if (!isElectron()) return;
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
  const { ipfsService } = useIpfsContext();
  return ipfsService;
};

export const resolveIpfsUrlSync = (url: string) => {
  if (url.startsWith("ipfs://")) {
    const gatewayBase = getConfiguredGatewayBaseForSync();
    if (!gatewayBase) {
      console.warn("IPFS gateway not yet initialized, returning original URL");
      return url;
    }
    return `${gatewayBase}/ipfs/${url.slice(7)}`;
  }

  const gatewayBase = getConfiguredGatewayBaseForSync();
  if (!gatewayBase) {
    return url;
  }

  try {
    return rewriteGatewayUrl(url, gatewayBase) ?? url;
  } catch (error) {
    console.error("Error resolving IPFS URL", error);
    return url;
  }
};

export const resolveIpfsUrlAsync = async (url: string) => {
  if (!url.startsWith("ipfs://")) {
    return url;
  }

  try {
    const info = await readIpfsConfig();
    cachedGatewayBase = info.gatewayBase;
    return `${info.gatewayBase}/ipfs/${url.slice(7)}`;
  } catch (error) {
    console.error("Error resolving IPFS URL", error);
    return url;
  }
};

export const resolveIpfsUrl = (url: string) => {
  return resolveIpfsUrlSync(url);
};
