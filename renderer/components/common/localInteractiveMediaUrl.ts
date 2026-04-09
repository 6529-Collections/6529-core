import { getConfiguredGatewayBaseForSync } from "@/components/ipfs/IPFSContext";
import {
  canonicalizeInteractiveMediaHostname,
  isInteractiveMediaContentIdentifier,
} from "@/components/waves/memes/submission/constants/security";
import { isElectron } from "@/helpers";

const LOCAL_RUNTIME_IPFS_HOSTS = new Set(["127.0.0.1", "localhost"]);
const LOCAL_RUNTIME_IPFS_PATH_PATTERN = /^\/ipfs\/([^/]+)(?:\/.*)?$/;

const getNormalizedPort = (url: URL): string => {
  if (url.port) {
    return url.port;
  }

  if (url.protocol === "https:") {
    return "443";
  }

  if (url.protocol === "http:") {
    return "80";
  }

  return "";
};

export const canonicalizeLocalInteractiveMediaUrl = (
  src: string
): string | null => {
  if (!isElectron()) {
    return null;
  }

  const configuredGatewayBase = getConfiguredGatewayBaseForSync();
  if (!configuredGatewayBase) {
    return null;
  }

  let parsedUrl: URL;
  let parsedGatewayBase: URL;
  try {
    parsedUrl = new URL(src);
    parsedGatewayBase = new URL(configuredGatewayBase);
  } catch {
    return null;
  }

  if (parsedUrl.username || parsedUrl.password) {
    return null;
  }

  if (parsedUrl.search || parsedUrl.hash) {
    return null;
  }

  const normalizedHostname = canonicalizeInteractiveMediaHostname(
    parsedUrl.hostname
  );
  const normalizedGatewayHostname = canonicalizeInteractiveMediaHostname(
    parsedGatewayBase.hostname
  );

  if (!normalizedHostname || !normalizedGatewayHostname) {
    return null;
  }

  if (
    !LOCAL_RUNTIME_IPFS_HOSTS.has(normalizedHostname) ||
    !LOCAL_RUNTIME_IPFS_HOSTS.has(normalizedGatewayHostname)
  ) {
    return null;
  }

  if (parsedUrl.protocol !== parsedGatewayBase.protocol) {
    return null;
  }

  if (normalizedHostname !== normalizedGatewayHostname) {
    return null;
  }

  if (getNormalizedPort(parsedUrl) !== getNormalizedPort(parsedGatewayBase)) {
    return null;
  }

  const gatewayPathPrefix = parsedGatewayBase.pathname.replace(/\/+$/, "");
  if (
    gatewayPathPrefix &&
    !parsedUrl.pathname.startsWith(gatewayPathPrefix)
  ) {
    return null;
  }

  const relativePath =
    gatewayPathPrefix && gatewayPathPrefix !== "/"
      ? parsedUrl.pathname.slice(gatewayPathPrefix.length) || "/"
      : parsedUrl.pathname;
  const match = LOCAL_RUNTIME_IPFS_PATH_PATTERN.exec(relativePath);
  if (!match) {
    return null;
  }

  if (!isInteractiveMediaContentIdentifier("ipfs", match[1]!)) {
    return null;
  }

  if (normalizedHostname !== parsedUrl.hostname) {
    parsedUrl.hostname = normalizedHostname;
  }

  return parsedUrl.toString();
};
