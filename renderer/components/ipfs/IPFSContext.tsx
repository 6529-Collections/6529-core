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
  ipfsUrls?: IpfsUrls;
}

const IpfsContext = createContext<IpfsContextType | undefined>(undefined);

const getEnv = async () => {
  const ipfsInfo = await window.api.getIpfsInfo();
  const apiEndpoint = ipfsInfo.apiEndpoint;
  const gatewayEndpoint = ipfsInfo.gatewayEndpoint;

  if (!apiEndpoint || !gatewayEndpoint) {
    throw new Error("Missing IPFS_API_ENDPOINT or IPFS_GATEWAY_ENDPOINT");
  }

  const mfsPath = ipfsInfo.mfsPath;

  return { apiEndpoint, gatewayEndpoint, mfsPath };
};

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

export const resolveIpfsUrl = async (url: string) => {
  try {
    if (url.startsWith("ipfs://")) {
      const { gatewayEndpoint } = await getEnv();
      return `${gatewayEndpoint}/ipfs/${url.slice(7)}`;
    }
  } catch (error) {
    console.error("Error resolving IPFS URL", error);
  }
  return url;
};
