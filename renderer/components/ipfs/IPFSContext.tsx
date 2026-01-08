"use client";

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

const readIpfsConfig = async () => {
  const ipfsInfo = await window.api.getIpfsInfo();
  const apiEndpoint = ipfsInfo.apiEndpoint;
  const gatewayEndpoint = ipfsInfo.gatewayEndpoint;

  if (!apiEndpoint || !gatewayEndpoint) {
    throw new Error("Missing IPFS_API_ENDPOINT or IPFS_GATEWAY_ENDPOINT");
  }

  let trimmed = gatewayEndpoint;
  while (trimmed.endsWith("/")) {
    trimmed = trimmed.slice(0, -1);
  }

  const gatewayBase = trimmed.endsWith("/ipfs")
    ? trimmed.slice(0, -5)
    : trimmed;

  const mfsPath = ipfsInfo.mfsPath;

  return {
    apiEndpoint,
    gatewayEndpoint: trimmed,
    gatewayBase,
    mfsPath,
  } as const;
};

const getEnv = async () => readIpfsConfig();

export const IpfsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [ipfsService, setIpfsService] = useState<IpfsService | null>(null);
  const [ipfsUrls, setIpfsUrls] = useState<IpfsUrls | undefined>(undefined);

  useEffect(() => {
    if (ipfsService) return;
    if (!isElectron()) return;

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
      .catch((error) => {
        console.error("Error initializing IPFS service", error);
      });
  }, []);

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

export const resolveIpfsUrlSync = (url: string) => {
  if (!url.startsWith("ipfs://")) {
    return url;
  }

  if (!cachedGatewayBase) {
    console.warn("IPFS gateway not yet initialized, returning original URL");
    return url;
  }

  return `${cachedGatewayBase}/ipfs/${url.slice(7)}`;
};

export const resolveIpfsUrl = async (url: string) => {
  if (!url.startsWith("ipfs://")) {
    return url;
  }

  try {
    const info = await readIpfsConfig();
    if (!cachedGatewayBase) {
      cachedGatewayBase = info.gatewayBase;
    }
    return `${info.gatewayBase}/ipfs/${url.slice(7)}`;
  } catch (error) {
    console.error("Error resolving IPFS URL", error);
    return url;
  }
};
