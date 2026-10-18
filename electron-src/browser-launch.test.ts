import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import { openInBrowser, type BrowserLaunchDeps } from "./browser-launch";

function harness(platform: NodeJS.Platform, launch: "ok" | "reject" = "ok") {
  const child = new EventEmitter() as unknown as ChildProcess;
  const opened: string[] = [];
  const deps: BrowserLaunchDeps = {
    openWithApp: async () => {
      if (launch === "reject") throw new Error("spawn failed");
      return child;
    },
    openDefault: async (url) => {
      opened.push(url);
    },
    log: () => undefined,
    platform,
  };
  return { child, opened, deps };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("opening a URL in a named browser", () => {
  it("opens the default browser when the Windows or macOS launcher fails", async () => {
    for (const platform of ["win32", "darwin"] as const) {
      const h = harness(platform);
      openInBrowser("https://6529.io/x", "firefox", "Firefox", h.deps);
      await settle();
      h.child.emit("exit", 1);
      await settle();
      assert.deepEqual(h.opened, ["https://6529.io/x"], platform);
    }
  });

  it("leaves a successful launch alone", async () => {
    const h = harness("win32");
    openInBrowser("https://6529.io/x", "chrome", "Chrome", h.deps);
    await settle();
    h.child.emit("exit", 0);
    await settle();
    assert.deepEqual(h.opened, []);
  });

  it("on Linux, falls back only when the browser cannot start, not when it exits later", async () => {
    const h = harness("linux");
    openInBrowser("https://6529.io/x", "firefox", "Firefox", h.deps);
    await settle();
    h.child.emit("exit", 1);
    await settle();
    assert.deepEqual(h.opened, []);
    h.child.emit("error", new Error("spawn firefox ENOENT"));
    await settle();
    assert.deepEqual(h.opened, ["https://6529.io/x"]);
  });

  it("falls back when the launcher cannot be started", async () => {
    const h = harness("win32", "reject");
    openInBrowser("https://6529.io/x", "brave", "Brave", h.deps);
    await settle();
    assert.deepEqual(h.opened, ["https://6529.io/x"]);
  });

  it("opens the default browser only once when the launcher both errors and exits", async () => {
    const h = harness("win32");
    openInBrowser("https://6529.io/x", "brave", "Brave", h.deps);
    await settle();
    h.child.emit("error", new Error("spawn failed"));
    h.child.emit("exit", 1);
    await settle();
    assert.deepEqual(h.opened, ["https://6529.io/x"]);
  });
});
