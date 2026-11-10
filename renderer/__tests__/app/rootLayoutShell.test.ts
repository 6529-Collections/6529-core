/** @jest-environment node */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const layout = readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8");

// The shell HTML is the same for every visitor: the browser decides native
// iOS, the EULA gate and NFT purchasing.
it("reads no request data in the root layout", () => {
  expect(layout).not.toMatch(/from\s+["']next\/headers["']/);
  expect(layout).not.toMatch(/\bcookies\(/);
  expect(layout).not.toMatch(/\bheaders\(/);
});

// The Desktop shell uses its layout bootstraps after the legacy-browser checks.
// All of these scripts run before hydration.
it("starts Desktop layout synchronously after the legacy-browser checks", () => {
  const head = layout.slice(layout.indexOf("<head>"), layout.indexOf("</head>"));
  const startupScripts = head.match(/<script\b[^>]*>/gi) ?? [];
  expect(startupScripts).toEqual([
    expect.stringContaining("LEGACY_BROWSER_FLAG_SCRIPT"),
    expect.stringContaining("LEGACY_BROWSER_SYNTAX_SCRIPT"),
    expect.stringContaining("LEGACY_BROWSER_NOTICE_SCRIPT"),
    expect.stringContaining("SMALL_WEB_STARTUP_SCRIPT"),
    expect.stringContaining("SIDEBAR_STARTUP_SCRIPT"),
  ]);
  for (const script of startupScripts) {
    expect(script).toMatch(/^<script\b/);
    expect(script).not.toMatch(/\s(?:async|defer|strategy)\b/);
  }
});

// Browser bundles carry no VERSION, so the chunk holding the baked public env
// keeps its name across deploys. config/env.browser.ts reads it from <html>.
it("renders VERSION on the <html> start tag for the browser", () => {
  const htmlStart = layout.slice(
    layout.indexOf("<html"),
    layout.indexOf(">", layout.indexOf("<html"))
  );
  expect(htmlStart).toContain("data-version={publicEnv.VERSION}");
  const browserEnv = readFileSync(
    path.join(process.cwd(), "config/env.browser.ts"),
    "utf8"
  );
  expect(browserEnv).toContain('documentElement.dataset["version"]');
});

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(entryPath));
    else if (/\.(ts|tsx|js|cjs|mjs)$/.test(entry.name)) files.push(entryPath);
  }
  return files;
}

// The former `native-ios` cookie only let the server see the app. Nothing may
// gate on it again: the platform comes from Capacitor's runtime bridge.
it("keeps no reader of a native-ios cookie", () => {
  const roots = ["app", "components", "hooks", "lib", "services", "helpers"];
  const readers = roots
    .flatMap((root) => sourceFiles(path.join(process.cwd(), root)))
    .concat(path.join(process.cwd(), "proxy.ts"))
    .filter((file) => /["'`]native-ios["'`=]/.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(process.cwd(), file));
  expect(readers).toEqual([]);
});
