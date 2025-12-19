import dotenv from "dotenv";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants.js";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function logOnce(label, message) {
  const k = `__LOG_${label}_ONCE__`;
  if (!process.env[k]) {
    process.env[k] = "1";
    console.log(`${label}: ${message}`);
  }
}

// Resolve where Next lives (root vs /renderer when used inside Electron repo)
const RENDERER_ROOT = fs.existsSync(path.join(__dirname, "renderer"))
  ? path.join(__dirname, "renderer")
  : __dirname;
const NEXT_DIR = path.join(RENDERER_ROOT, ".next");
logOnce("NEXT_DIR", NEXT_DIR);

// ─────────────────────────────────────────────────────────────
// Load runtime schema (permissive fallback if missing in packaged app)
// ─────────────────────────────────────────────────────────────
let publicEnvSchema;
try {
  ({ publicEnvSchema } = require("./renderer/config/env.schema.runtime.cjs"));
} catch {
  try {
    ({ publicEnvSchema } = require("./config/env.schema.runtime.cjs"));
  } catch {
    logOnce(
      "SCHEMA",
      "env.schema.runtime.cjs not found; using permissive schema"
    );
    publicEnvSchema = {
      safeParse: (obj) => ({ success: true, data: obj }),
      _def: { shape: () => ({}) },
    };
  }
}

function computeVersionFromPkg() {
  try {
    const pkg = require("./package.json");
    const VERSION = pkg.version || "0.0.0";
    logOnce("VERSION (from package.json)", VERSION);
    return VERSION;
  } catch {
    const fallback = "6529Core";
    logOnce("VERSION (default)", fallback);
    return fallback;
  }
}

function resolveAssetsFlagFromEnv() {
  return (
    ((process.env.ASSETS_FROM_S3 ?? "false") + "").toLowerCase() === "true"
  );
}

function persistBakedArtifacts(publicEnv, ASSETS_FROM_S3) {
  try {
    fs.mkdirSync(NEXT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(NEXT_DIR, "PUBLIC_RUNTIME.json"),
      JSON.stringify(publicEnv),
      "utf8"
    );
    fs.writeFileSync(
      path.join(NEXT_DIR, "ASSETS_FROM_S3"),
      ASSETS_FROM_S3 ? "true" : "false",
      "utf8"
    );
  } catch {}
}

function loadBakedRuntimeConfig(VERSION) {
  let baked = {};
  if (process.env.PUBLIC_RUNTIME) {
    baked = JSON.parse(process.env.PUBLIC_RUNTIME);
  } else {
    const p = path.join(NEXT_DIR, "PUBLIC_RUNTIME.json");
    if (fs.existsSync(p)) baked = JSON.parse(fs.readFileSync(p, "utf8"));
  }
  const parsed = publicEnvSchema.safeParse({ ...baked, VERSION });
  if (!parsed.success) throw parsed.error;
  return parsed.data;
}

function loadAssetsFlagAtRuntime() {
  let flag = (process.env.ASSETS_FROM_S3 ?? "").toString().toLowerCase();
  if (!flag) {
    const p = path.join(NEXT_DIR, "ASSETS_FROM_S3");
    if (fs.existsSync(p))
      flag = fs.readFileSync(p, "utf8").trim().toLowerCase();
  }
  return flag === "true";
}

function createSecurityHeaders(apiEndpoint = "") {
  return [
    {
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains; preload",
    },
    {
      key: "Content-Security-Policy",
      value: `default-src 'none'; script-src 'self' 'unsafe-inline' https://dnclu2fna0b2b.cloudfront.net https://www.google-analytics.com https://www.googletagmanager.com/ https://dataplane.rum.us-east-1.amazonaws.com 'unsafe-eval'; connect-src * 'self' blob: ${apiEndpoint} https://registry.walletconnect.com/api/v2/wallets wss://*.bridge.walletconnect.org wss://*.walletconnect.com wss://www.walletlink.org/rpc https://explorer-api.walletconnect.com/v3/wallets https://www.googletagmanager.com https://*.google-analytics.com https://cloudflare-eth.com/ https://arweave.net/* https://rpc.walletconnect.com/v1/ https://sts.us-east-1.amazonaws.com https://sts.us-west-2.amazonaws.com; font-src 'self' data: https://fonts.gstatic.com https://fonts.reown.com https://dnclu2fna0b2b.cloudfront.net https://cdnjs.cloudflare.com; img-src 'self' data: blob: ipfs: https://artblocks.io https://*.artblocks.io *; media-src 'self' blob: https://*.cloudfront.net https://videos.files.wordpress.com https://arweave.net https://*.arweave.net https://ipfs.io/ipfs/* https://cf-ipfs.com/ipfs/* https://*.twimg.com https://artblocks.io https://*.artblocks.io; frame-src 'self' https://media.generator.seize.io https://media.generator.6529.io https://generator.seize.io https://arweave.net https://*.arweave.net https://ipfs.io/ipfs/* https://cf-ipfs.com/ipfs/* https://nftstorage.link https://*.ipfs.nftstorage.link https://verify.walletconnect.com https://verify.walletconnect.org https://secure.walletconnect.com https://d3lqz0a4bldqgf.cloudfront.net https://www.youtube.com https://www.youtube-nocookie.com https://*.youtube.com https://artblocks.io https://*.artblocks.io https://docs.google.com https://drive.google.com https://*.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com/css2 https://dnclu2fna0b2b.cloudfront.net https://cdnjs.cloudflare.com http://cdnjs.cloudflare.com https://cdn.jsdelivr.net; object-src data:;`,
    },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: "geolocation=()" },
  ];
}

function sharedConfig(publicEnv, assetPrefix) {
  return {
    reactCompiler: true,
    reactStrictMode: false,
    basePath: "",
    distDir: "out",
    compress: true,
    productionBrowserSourceMaps: true,
    sassOptions: { quietDeps: true },
    experimental: {
      webpackMemoryOptimizations: true,
      webpackBuildWorker: true,
    },
    images: {
      loader: "default",
      remotePatterns: [
        { protocol: "https", hostname: "6529.io" },
        { protocol: "http", hostname: "6529.io" },
        { protocol: "https", hostname: "staging.6529.io" },
        { protocol: "http", hostname: "staging.6529.io" },
        { protocol: "https", hostname: "arweave.net" },
        { protocol: "http", hostname: "arweave.net" },
        { protocol: "https", hostname: "localhost" },
        { protocol: "http", hostname: "localhost" },
        { protocol: "https", hostname: "media.generator.seize.io" },
        { protocol: "http", hostname: "media.generator.seize.io" },
        { protocol: "https", hostname: "d3lqz0a4bldqgf.cloudfront.net" },
        { protocol: "http", hostname: "d3lqz0a4bldqgf.cloudfront.net" },
        { protocol: "https", hostname: "robohash.org" },
        { protocol: "http", hostname: "robohash.org" },
        { protocol: "https", hostname: "ipfs.6529.io" },
        { protocol: "http", hostname: "ipfs.6529.io" },
        { protocol: "https", hostname: "127.0.0.1" },
        { protocol: "http", hostname: "127.0.0.1" },
      ],
      minimumCacheTTL: 86400,
      formats: ["image/avif", "image/webp"],
      qualities: [100, 75],
      unoptimized: true,
    },
    transpilePackages: ["react-tweet"],
    poweredByHeader: false,
    async headers() {
      return [
        {
          source: "/:path*",
          headers: createSecurityHeaders(publicEnv.API_ENDPOINT),
        },
      ];
    },
    webpack: (config, { dev, isServer }) => {
      config.resolve.alias.canvas = false;
      config.resolve.alias.encoding = false;
      config.resolve.alias["@react-native-async-storage/async-storage"] = false;
      config.resolve.alias["react-native"] = false;
      config.resolve.alias["pino"] = "./stubs/empty.js";
      config.resolve.alias["thread-stream"] = "./stubs/empty.js";
      config.resolve.alias["idb-keyval"] = path.resolve(
        process.cwd(),
        "lib/storage/idb-keyval.ts"
      );
      if (!dev && !isServer) config.devtool = "source-map";
      config.optimization.minimize = false;
      return config;
    },
    turbopack: {
      resolveAlias: {
        canvas: "./stubs/empty.js",
        encoding: "./stubs/empty.js",
        "@react-native-async-storage/async-storage": "./stubs/empty.js",
        "react-native": "./stubs/empty.js",
        pino: "./stubs/empty.js",
        "thread-stream": "./stubs/empty.js",
      },
    },
    serverExternalPackages: ["@reown/appkit", "@reown/appkit-adapter-wagmi"],
    assetPrefix,
  };
}

const nextConfigFactory = (phase) => {
  const mode = process.env.NODE_ENV;
  logOnce("NODE_ENV", mode);

  // Build & Dev phases
  if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_BUILD) {
    if (mode) dotenv.config({ path: `.env.${mode}` });
    dotenv.config({ path: `.env` });

    // Optional fallback: hydrate envs from baked/static JSON so Electron builds don't need .env
    try {
      const bakedMainPath = path.join(
        __dirname,
        "main/config/__PUBLIC_RUNTIME.json"
      );
      const sourceJsonPath = path.join(__dirname, "config/public-runtime.json");
      let bakedSource = null;
      if (fs.existsSync(bakedMainPath)) {
        bakedSource = fs.readFileSync(bakedMainPath, "utf8");
        logOnce("ENV fallback", `Loaded from ${bakedMainPath}`);
      } else if (fs.existsSync(sourceJsonPath)) {
        bakedSource = fs.readFileSync(sourceJsonPath, "utf8");
        logOnce("ENV fallback", `Loaded from ${sourceJsonPath}`);
      }
      if (bakedSource) {
        const bakedObj = JSON.parse(bakedSource);
        const shape = publicEnvSchema._def.shape();
        for (const key of Object.keys(shape)) {
          if (process.env[key] === undefined && bakedObj[key] !== undefined) {
            process.env[key] = String(bakedObj[key]);
          }
        }
      }
    } catch {}

    const VERSION = computeVersionFromPkg();
    const ASSETS_FROM_S3 = resolveAssetsFlagFromEnv();
    logOnce("ASSETS_FROM_S3", ASSETS_FROM_S3);

    // Validate with your Zod schema
    const shape = publicEnvSchema._def.shape();
    const publicRuntime = {};
    for (const key of Object.keys(shape)) publicRuntime[key] = process.env[key];
    publicRuntime.VERSION = VERSION;
    publicRuntime.ASSETS_FROM_S3 = String(ASSETS_FROM_S3);

    const parsed = publicEnvSchema.safeParse(publicRuntime);
    if (!parsed.success) throw parsed.error;
    const publicEnv = parsed.data;

    // Bake for runtime (even though you ship /out, this is useful for parity/logging)
    persistBakedArtifacts(publicEnv, ASSETS_FROM_S3);

    // No CDN asset prefix for static export by default
    const assetPrefix = ASSETS_FROM_S3
      ? `https://dnclu2fna0b2b.cloudfront.net/web_build/${VERSION}`
      : "";

    return {
      ...sharedConfig(publicEnv, assetPrefix),
      env: {
        PUBLIC_RUNTIME: JSON.stringify(publicEnv),
        API_ENDPOINT: publicEnv.API_ENDPOINT,
        ALLOWLIST_API_ENDPOINT: publicEnv.ALLOWLIST_API_ENDPOINT,
        BASE_ENDPOINT: publicEnv.BASE_ENDPOINT,
        ALCHEMY_API_KEY: publicEnv.ALCHEMY_API_KEY,
        VERSION,
        ASSETS_FROM_S3: String(ASSETS_FROM_S3),
        NEXTGEN_CHAIN_ID:
          publicEnv.NEXTGEN_CHAIN_ID === undefined
            ? undefined
            : String(publicEnv.NEXTGEN_CHAIN_ID),
        MOBILE_APP_SCHEME: publicEnv.MOBILE_APP_SCHEME,
        CORE_SCHEME: publicEnv.CORE_SCHEME,
        // IPFS_* intentionally omitted (Electron provides them)
        TENOR_API_KEY: publicEnv.TENOR_API_KEY,
        WS_ENDPOINT: publicEnv.WS_ENDPOINT,
        DEV_MODE_MEMES_WAVE_ID: publicEnv.DEV_MODE_MEMES_WAVE_ID,
        DEV_MODE_WALLET_ADDRESS: publicEnv.DEV_MODE_WALLET_ADDRESS,
        DEV_MODE_AUTH_JWT: publicEnv.DEV_MODE_AUTH_JWT,
        USE_DEV_AUTH: publicEnv.USE_DEV_AUTH,
        STAGING_API_KEY: publicEnv.STAGING_API_KEY,
        AWS_RUM_APP_ID: publicEnv.AWS_RUM_APP_ID,
        AWS_RUM_REGION: publicEnv.AWS_RUM_REGION,
        AWS_RUM_SAMPLE_RATE: publicEnv.AWS_RUM_SAMPLE_RATE,
        ENABLE_SECURITY_LOGGING: publicEnv.ENABLE_SECURITY_LOGGING,
        VITE_FEATURE_AB_CARD: publicEnv.VITE_FEATURE_AB_CARD,
        FEATURE_AB_CARD: publicEnv.FEATURE_AB_CARD,
        PEPE_CACHE_TTL_MINUTES: publicEnv.PEPE_CACHE_TTL_MINUTES,
        PEPE_CACHE_MAX_ITEMS: publicEnv.PEPE_CACHE_MAX_ITEMS,
        FARCASTER_WARPCAST_API_BASE: publicEnv.FARCASTER_WARPCAST_API_BASE,
        FARCASTER_WARPCAST_API_KEY: publicEnv.FARCASTER_WARPCAST_API_KEY,
      },
      async generateBuildId() {
        return VERSION;
      },
    };
  }

  // You don’t run a Next server in prod (static export), but keep this harmless.
  if (phase === PHASE_PRODUCTION_SERVER) {
    const VERSION = computeVersionFromPkg();
    const publicEnv = loadBakedRuntimeConfig(VERSION);
    const ASSETS_FROM_S3 = loadAssetsFlagAtRuntime();
    const assetPrefix = ASSETS_FROM_S3
      ? `https://dnclu2fna0b2b.cloudfront.net/web_build/${VERSION}`
      : "";
    return sharedConfig(publicEnv, assetPrefix);
  }

  return {
    reactStrictMode: false,
    compress: true,
    poweredByHeader: false,
    distDir: "out",
  };
};

export default nextConfigFactory;
