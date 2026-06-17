import {
  IPFS_PATH_GATEWAY_HOSTS,
  IPFS_SUBDOMAIN_GATEWAY_SUFFIXES,
  canonicalizeGatewayHostname,
} from "./decentralized-media";

export const IPFS_GATEWAY_CSP_SOURCES = [
  ...IPFS_PATH_GATEWAY_HOSTS.flatMap((hostname) => [
    `https://${hostname}`,
    `https://${hostname}/ipfs/*`,
    `https://${hostname}/ipns/*`,
  ]),
  ...IPFS_SUBDOMAIN_GATEWAY_SUFFIXES.map((suffix) => `https://*${suffix}`),
];

export const IPFS_GATEWAY_REMOTE_PATTERN_HOSTNAMES = [
  "media.6529.io",
  ...IPFS_PATH_GATEWAY_HOSTS,
  ...IPFS_SUBDOMAIN_GATEWAY_SUFFIXES.map((suffix) => `**${suffix}`),
];

function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = canonicalizeGatewayHostname(hostname);
  return (
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "localhost" ||
    normalizedHostname === "::1" ||
    normalizedHostname === "[::1]"
  );
}

export function getConfiguredIpfsGatewayHost(
  gatewayEndpoint?: string
): string | null {
  if (!gatewayEndpoint) {
    return null;
  }

  try {
    const parsedUrl = new URL(gatewayEndpoint);
    const isLoopbackHttp =
      parsedUrl.protocol === "http:" && isLoopbackHostname(parsedUrl.hostname);
    if (parsedUrl.protocol !== "https:" && !isLoopbackHttp) {
      return null;
    }

    return canonicalizeGatewayHostname(parsedUrl.hostname);
  } catch {
    return null;
  }
}
