import { canonicalizeArweaveGatewayHostname } from "@/lib/media/arweave-gateways";

function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = canonicalizeArweaveGatewayHostname(hostname);
  return (
    normalizedHostname === "127.0.0.1" || normalizedHostname === "localhost"
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

    return canonicalizeArweaveGatewayHostname(parsedUrl.hostname);
  } catch {
    return null;
  }
}
