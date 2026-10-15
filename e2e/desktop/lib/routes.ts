// Every page route of the renderer, each with one concrete URL to visit.
// Dynamic segments are filled from the packaged build's prerender manifest,
// from public NFT ids, or from public API data looked up at run time; the
// suite never stores profile handles or addresses. A route with no sample
// value is reported as skipped, not passed.

import fs from "node:fs";
import path from "node:path";

export interface RoutePattern {
  pattern: string;
  segments: string[];
}

export interface DynamicSamples {
  /** A public profile handle, looked up at run time. */
  user?: string;
  /** A public wave id, looked up at run time. */
  wave?: string;
  /** A seed wallet address the suite created itself. */
  seedWallet?: string;
}

const PAGE_FILE = /^page\.(tsx|ts|jsx|js)$/;

export function listRoutePatterns(appDir: string): RoutePattern[] {
  const patterns: RoutePattern[] = [];
  const walk = (dir: string, segments: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && PAGE_FILE.test(entry.name)) {
        patterns.push({ pattern: "/" + segments.join("/"), segments: [...segments] });
      }
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (name === "api" && segments.length === 0) continue;
      if (name.startsWith("_") || name.startsWith("@")) continue;
      if (/^\(\.+\)/.test(name)) continue; // intercepting routes
      const next = /^\(.*\)$/.test(name) ? segments : [...segments, name];
      walk(path.join(dir, name), next);
    }
  };
  walk(appDir, []);
  const unique = new Map(patterns.map((route) => [route.pattern, route]));
  return [...unique.values()].sort((a, b) => a.pattern.localeCompare(b.pattern));
}

export function isDynamic(route: RoutePattern): boolean {
  return route.segments.some((segment) => segment.startsWith("["));
}

/** Prerendered concrete paths per route pattern, from the build's prerender manifest. */
export function prerenderedPaths(manifest: unknown): Map<string, string[]> {
  const byPattern = new Map<string, string[]>();
  if (!manifest || typeof manifest !== "object") return byPattern;
  const routes = (manifest as { routes?: Record<string, { srcRoute?: string | null }> }).routes ?? {};
  for (const [concrete, info] of Object.entries(routes)) {
    const source = info?.srcRoute ?? concrete;
    if (concrete.endsWith(".rsc") || concrete.includes("/_")) continue;
    const list = byPattern.get(source) ?? [];
    list.push(concrete);
    byPattern.set(source, list);
  }
  return byPattern;
}

// Public NFT and collection ids; not community data.
const STATIC_SAMPLES: Record<string, string> = {
  "/6529-gradient/[id]": "/6529-gradient/1",
  "/the-memes/[id]": "/the-memes/1",
  "/the-memes/[id]/distribution": "/the-memes/1/distribution",
  "/meme-lab/[id]": "/meme-lab/1",
  "/meme-lab/[id]/distribution": "/meme-lab/1/distribution",
  "/nextgen/collection/[collection]/[[...view]]": "/nextgen/collection/1",
  "/nextgen/collection/[collection]/art": "/nextgen/collection/1/art",
  "/nextgen/collection/[collection]/distribution-plan": "/nextgen/collection/1/distribution-plan",
  "/nextgen/collection/[collection]/mint": "/nextgen/collection/1/mint",
  "/nextgen/collection/[collection]/trait-sets": "/nextgen/collection/1/trait-sets",
  "/nextgen/token/[token]/[[...view]]": "/nextgen/token/10000000000",
  "/delegation/[...section]": "/delegation/delegation-center",
};

export function sampleUrl(
  route: RoutePattern,
  prerendered: Map<string, string[]>,
  samples: DynamicSamples,
): { url: string | null; reason?: string } {
  if (!isDynamic(route)) return { url: route.pattern || "/" };
  const fromManifest = prerendered.get(route.pattern);
  if (fromManifest && fromManifest.length > 0) {
    return { url: [...fromManifest].sort()[0] };
  }
  if (STATIC_SAMPLES[route.pattern]) return { url: STATIC_SAMPLES[route.pattern] };

  const parts: string[] = [];
  for (const segment of route.segments) {
    if (!segment.startsWith("[")) {
      parts.push(segment);
      continue;
    }
    if (segment.startsWith("[[...")) {
      continue; // optional catch-all: the bare path is a valid URL
    }
    if (segment === "[user]" && samples.user) {
      parts.push(encodeURIComponent(samples.user));
    } else if (segment === "[wave]" && samples.wave && route.pattern.startsWith("/waves/")) {
      parts.push(samples.wave);
    } else if (segment === "[address]" && route.pattern.startsWith("/core/") && samples.seedWallet) {
      parts.push(samples.seedWallet);
    } else {
      return { url: null, reason: `no sample value for ${segment}` };
    }
  }
  return { url: "/" + parts.join("/") };
}

/** A small set that covers the core screens, for quick runs. */
export const SMOKE_ROUTES = [
  "/",
  "/waves",
  "/messages",
  "/notifications",
  "/network",
  "/the-memes",
  "/the-memes/[id]",
  "/[user]",
  "/waves/[wave]",
  "/delegation/[...section]",
  "/nextgen/[[...view]]",
  "/museum",
  "/core/core-info",
  "/core/core-wallets",
  "/core/eth-transactions",
  "/core/tdh-calculation",
  "/tools",
  "/xtdh",
];
