import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { parseDesktopProfileState } from "../shared/desktop-profile-state";

function fixture(failInterception = false) {
  const calls: string[] = [];
  const commands: { name: string; params: any }[] = [];
  let listener: (...args: any[]) => void;
  let destroyed = false;
  const address = `0x${"a".repeat(40)}`;
  class BrowserWindow {
    constructor(options: any) {
      assert.equal(options.show, false);
      assert.equal(options.webPreferences.sandbox, true);
      assert.equal(options.webPreferences.contextIsolation, true);
      assert.equal(options.webPreferences.nodeIntegration, false);
      assert.equal(options.webPreferences.preload, undefined);
    }
    webContents = {
      debugger: {
        attach: () => calls.push("attach"),
        on: (_event: string, callback: typeof listener) => {
          listener = callback;
        },
        sendCommand: async (name: string, params: any) => {
          calls.push(name);
          commands.push({ name, params });
          if (failInterception && name === "Fetch.enable")
            throw new Error("fixture failure");
        },
      },
      executeJavaScript: async (code: string) => {
        assert.match(code, /6529-wallet-accounts/);
        assert.doesNotMatch(code, /setItem|removeItem|fetch\(/);
        return JSON.stringify({
          accounts: JSON.stringify([
            { address, refreshToken: "must-not-copy" },
          ]),
          activeAddress: address,
        });
      },
    };
    async loadURL(url: string) {
      calls.push(`load ${url}`);
      if (url === "about:blank") return;
      assert.ok(calls.includes("Fetch.enable"));
      assert.ok(calls.includes("Network.setBypassServiceWorker"));
      listener({}, "Fetch.requestPaused", {
        requestId: "document",
        resourceType: "Document",
        request: { url },
      });
      listener({}, "Fetch.requestPaused", {
        requestId: "other",
        resourceType: "Script",
        request: { url: "https://fixture.invalid/script.js" },
      });
    }
    isDestroyed() {
      return destroyed;
    }
    destroy() {
      destroyed = true;
    }
  }
  const context = vm.createContext({
    exports: {},
    Buffer,
    setTimeout,
    clearTimeout,
    require: (name: string) => {
      if (name === "electron") return { BrowserWindow };
      if (name === "node:crypto") return { randomUUID: () => "fixture-nonce" };
      if (name === "../shared/desktop-profile-state")
        return { parseDesktopProfileState };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const source = fs.readFileSync(
    path.join(process.cwd(), "electron-src/legacy-desktop-profiles.ts"),
    "utf8",
  );
  vm.runInContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    context,
  );
  return {
    read: context.exports.readLegacyDesktopProfiles as () => Promise<any>,
    calls,
    commands,
    isDestroyed: () => destroyed,
  };
}

test("legacy migration intercepts a blank document before visiting the old origin and blocks all other requests", async () => {
  const f = fixture();
  const state = await f.read();
  assert.deepEqual(f.calls.slice(0, 4), [
    "load about:blank",
    "attach",
    "Network.setBypassServiceWorker",
    "Fetch.enable",
  ]);
  const document = f.commands.find(
    (command) => command.name === "Fetch.fulfillRequest",
  );
  assert.ok(document);
  assert.ok(
    document.params.responseHeaders.some(
      (header: any) =>
        header.name === "Content-Security-Policy" &&
        header.value === "default-src 'none'",
    ),
  );
  assert.ok(
    f.commands.some(
      (command) =>
        command.name === "Fetch.failRequest" &&
        command.params.requestId === "other",
    ),
  );
  assert.equal(state.accounts.length, 1);
  assert.equal(state.accounts[0].refreshToken, null);
  assert.equal(f.isDestroyed(), true);
});

test("failed interception never loads the old origin and closes the migration window", async () => {
  const f = fixture(true);
  await assert.rejects(f.read(), /Could not read saved Desktop profiles/);
  assert.deepEqual(
    f.calls.filter((call) => call.startsWith("load ")),
    ["load about:blank"],
  );
  assert.equal(f.isDestroyed(), true);
});
