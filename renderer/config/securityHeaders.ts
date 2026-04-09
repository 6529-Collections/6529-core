import { ARWEAVE_GATEWAY_CSP_SOURCES } from "../lib/media/arweave-gateways";

function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = hostname.trim().toLowerCase();
  return (
    normalizedHostname === "127.0.0.1" || normalizedHostname === "localhost"
  );
}

function getConfiguredIpfsGatewaySource(
  ipfsGatewayEndpoint: string | undefined
): string {
  if (!ipfsGatewayEndpoint) {
    return "";
  }

  try {
    const parsedUrl = new URL(ipfsGatewayEndpoint);
    const isLoopbackHttp =
      parsedUrl.protocol === "http:" && isLoopbackHostname(parsedUrl.hostname);
    if (parsedUrl.protocol !== "https:" && !isLoopbackHttp) {
      return "";
    }

    return parsedUrl.origin;
  } catch {
    return "";
  }
}

function joinSources(sources: Array<string | undefined>): string {
  return sources.filter(Boolean).join(" ");
}

const IPFS_FALLBACK_GATEWAY_ENTRIES = [
  "ipfs.6529.io",
  "ipfs.io",
  "cf-ipfs.com",
  "nftstorage.link",
  "*.ipfs.nftstorage.link",
] as const;
const IPFS_FALLBACK_MEDIA_SOURCES = IPFS_FALLBACK_GATEWAY_ENTRIES.flatMap(
  (entry) =>
    entry.startsWith("*.")
      ? [`https://${entry}`]
      : [`https://${entry}`, `https://${entry}/ipfs/*`]
);
const IPFS_FALLBACK_FRAME_SOURCES = IPFS_FALLBACK_GATEWAY_ENTRIES.flatMap(
  (entry) =>
    entry.startsWith("*.")
      ? [`https://${entry}`]
      : [`https://${entry}`, `https://${entry}/ipfs/*`]
);

export function createSecurityHeaders(
  apiEndpoint: string | undefined = "",
  ipfsGatewayEndpoint: string | undefined = ""
) {
  const arweaveGatewaySources = ARWEAVE_GATEWAY_CSP_SOURCES.join(" ");
  const configuredIpfsGatewaySource =
    getConfiguredIpfsGatewaySource(ipfsGatewayEndpoint);
  const localGatewaySources = [
    "http://127.0.0.1:*",
    "http://localhost:*",
    "https://127.0.0.1:*",
    "https://localhost:*",
  ];
  const connectSrc = joinSources([
    "*",
    "'self'",
    "blob:",
    apiEndpoint,
    "https://registry.walletconnect.com/api/v2/wallets",
    "wss://*.bridge.walletconnect.org",
    "wss://*.walletconnect.com",
    "wss://www.walletlink.org/rpc",
    "https://explorer-api.walletconnect.com/v3/wallets",
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
    "https://cloudflare-eth.com/",
    arweaveGatewaySources,
    "https://rpc.walletconnect.com/v1/",
    "https://sts.us-east-1.amazonaws.com",
    "https://sts.us-west-2.amazonaws.com",
  ]);
  const imgSrc = joinSources([
    "'self'",
    "data:",
    "blob:",
    "ipfs:",
    "https://artblocks.io",
    "https://*.artblocks.io",
    "*",
  ]);
  const mediaSrc = joinSources([
    "'self'",
    "blob:",
    ...localGatewaySources,
    "https://*.cloudfront.net",
    "https://videos.files.wordpress.com",
    arweaveGatewaySources,
    configuredIpfsGatewaySource,
    ...IPFS_FALLBACK_MEDIA_SOURCES,
    "https://*.twimg.com",
    "https://artblocks.io",
    "https://*.artblocks.io",
  ]);
  const frameSrc = joinSources([
    "'self'",
    ...localGatewaySources,
    ...IPFS_FALLBACK_FRAME_SOURCES,
    configuredIpfsGatewaySource,
    "https://media.generator.seize.io",
    "https://media.generator.6529.io",
    "https://generator.seize.io",
    arweaveGatewaySources,
    "https://verify.walletconnect.com",
    "https://verify.walletconnect.org",
    "https://secure.walletconnect.com",
    "https://d3lqz0a4bldqgf.cloudfront.net",
    "https://www.youtube.com",
    "https://www.youtube-nocookie.com",
    "https://*.youtube.com",
    "https://artblocks.io",
    "https://*.artblocks.io",
    "https://docs.google.com",
    "https://drive.google.com",
    "https://*.google.com",
  ]);

  return [
    {
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains; preload",
    },
    {
      key: "Content-Security-Policy",
      value: `default-src 'none'; script-src 'self' 'unsafe-inline' https://dnclu2fna0b2b.cloudfront.net https://www.google-analytics.com https://www.googletagmanager.com/ https://dataplane.rum.us-east-1.amazonaws.com 'unsafe-eval'; connect-src ${connectSrc}; font-src 'self' data: https://fonts.gstatic.com https://fonts.reown.com https://dnclu2fna0b2b.cloudfront.net https://cdnjs.cloudflare.com; img-src ${imgSrc}; media-src ${mediaSrc}; frame-src ${frameSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com/css2 https://dnclu2fna0b2b.cloudfront.net https://cdnjs.cloudflare.com http://cdnjs.cloudflare.com https://cdn.jsdelivr.net; object-src data:;`,
    },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value: [
        "accelerometer=()",
        "ambient-light-sensor=()",
        "autoplay=()",
        "battery=()",
        "camera=()",
        "cross-origin-isolated=()",
        "display-capture=()",
        "document-domain=()",
        "encrypted-media=()",
        "execution-while-not-rendered=()",
        "execution-while-out-of-viewport=()",
        "fullscreen=(self)",
        "geolocation=()",
        "gyroscope=()",
        "keyboard-map=()",
        "magnetometer=()",
        "microphone=()",
        "midi=()",
        "payment=()",
        "picture-in-picture=()",
        "publickey-credentials-get=()",
        "screen-wake-lock=()",
        "sync-xhr=()",
        "usb=()",
        "web-share=()",
        "xr-spatial-tracking=()",
      ].join(", "),
    },
  ];
}
