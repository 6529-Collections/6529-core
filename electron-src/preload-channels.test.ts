import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import * as constants from "../electron-constants";

const root = process.cwd();

/** The channel names listed in the preload's GENERIC_IPC_CHANNELS set. */
function allowlist(): string[] {
  const source = fs.readFileSync(path.join(root, "electron-src", "preload.ts"), "utf8");
  const body = source.match(/GENERIC_IPC_CHANNELS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/)?.[1];
  assert.ok(body, "GENERIC_IPC_CHANNELS not found in preload.ts");
  return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort();
}

function rendererFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return ["node_modules", "out", ".next", "public"].includes(entry.name) ? [] : rendererFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Channels the renderer passes to window.api.send, sendSync, invoke or on.
 * Every call must name its channel with a constant or a plain string; any
 * other form fails, so no call can slip past the list unseen.
 */
function rendererChannels(): string[] {
  const channels = new Set<string>();
  for (const file of rendererFiles(path.join(root, "renderer"))) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/window\.api\??\.(?:send|sendSync|invoke|on)\(\s*([^,)]*)/g)) {
      const argument = match[1].trim();
      const literal = argument.match(/^(["'`])([^"'`$]*)\1$/);
      if (literal) {
        channels.add(literal[2]);
        continue;
      }
      assert.match(
        argument,
        /^[A-Za-z_]\w*$/,
        `${path.relative(root, file)} names a channel as ${argument}; use a constant from electron-constants.ts`,
      );
      const value = (constants as Record<string, unknown>)[argument];
      assert.equal(typeof value, "string", `${path.relative(root, file)} passes ${argument}, which is not a channel in electron-constants.ts`);
      channels.add(value as string);
    }
  }
  return [...channels].sort();
}

describe("preload generic IPC channels", () => {
  it("lists exactly the channels the renderer uses", () => {
    const used = rendererChannels();
    assert.ok(used.length > 0, "found no generic IPC calls in the renderer");
    assert.deepEqual(allowlist(), used);
  });
});
