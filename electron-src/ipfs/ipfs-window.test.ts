import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { pinnedWindowNavigation } from "../navigation-policy";

/** Run the real window opener with inert windows, never Electron or a profile. */
function createHarness(status = "ready") {
  const windows: FakeWindow[] = [];
  class FakeWindow extends EventEmitter {
    destroyed = false;
    minimized = false;
    shows = 0;
    focuses = 0;
    restores = 0;
    loads: string[] = [];
    committedUrl = "";
    private pendingLoads: {
      url: string;
      resolve: () => void;
      reject: (error: Error) => void;
    }[] = [];
    webContents = Object.assign(new EventEmitter(), {
      setWindowOpenHandler: () => undefined,
      getURL: () => this.committedUrl,
    });
    constructor(readonly options: Record<string, unknown>) {
      super();
      windows.push(this);
    }
    isDestroyed() {
      return this.destroyed;
    }
    isMinimized() {
      return this.minimized;
    }
    restore() {
      this.restores++;
      this.minimized = false;
    }
    show() {
      this.shows++;
    }
    focus() {
      this.focuses++;
    }
    maximize() {}
    setFullScreen() {}
    loadURL(url: string) {
      this.loads.push(url);
      return new Promise<void>((resolve, reject) => {
        this.pendingLoads.push({ url, resolve, reject });
      });
    }
    commitLoad(index = this.pendingLoads.length - 1) {
      const load = this.pendingLoads[index];
      this.committedUrl = load.url;
      load.resolve();
    }
    failLoad(index = this.pendingLoads.length - 1) {
      this.pendingLoads[index].reject(new Error("Navigation failed"));
    }
  }

  const source = ts.createSourceFile(
    "index.ts",
    fs.readFileSync(path.join(process.cwd(), "electron-src/index.ts"), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const opener = source.statements.find(
    (node) =>
      ts.isFunctionDeclaration(node) && node.name?.text === "openIpfsWindow",
  );
  assert.ok(opener);
  const state = source.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (declaration) => declaration.name.getText(source) === "myIpfsWindow",
      ),
  );
  assert.ok(state, "window reference is retained in the main process");
  const pendingState = source.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (declaration) =>
          declaration.name.getText(source) === "pendingIpfsWindowLoads",
      ),
  );
  const navigate = source.statements.find(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "navigateIpfsWindow",
  );
  assert.ok(pendingState);
  assert.ok(navigate);
  const compiled = ts.transpileModule(
    `${state.getText(source)}\n${pendingState.getText(source)}\n${navigate.getText(source)}\n${opener.getText(source)}\nopenIpfsWindow;`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  const open = vm.runInNewContext(compiled, {
    BrowserWindow: FakeWindow,
    mainWindow: null,
    URL,
    pinnedWindowNavigation,
    IPFS_SERVER: { getStatus: () => status, getApiEndpoint: () => "http://127.0.0.1:9256" },
    shell: { openExternal: async () => undefined },
    Logger: { error: () => undefined },
  }) as (url: string) => void;
  return { open, windows };
}

const WEBUI = "http://127.0.0.1:9256/webui";

test("disabled or unavailable local nodes cannot open a MyIPFS window", () => {
  for (const status of ["disabled", "stopped", "starting", "unavailable"]) {
    const { open, windows } = createHarness(status);
    open(WEBUI);
    assert.equal(windows.length, 0);
  }
});

test("repeated MyIPFS clicks reuse the window even before loading finishes", () => {
  const { open, windows } = createHarness();
  open(WEBUI);
  open(WEBUI);
  open(WEBUI);
  assert.equal(windows.length, 1);
  assert.deepEqual(windows[0].loads, [WEBUI]);
  assert.equal(windows[0].focuses, 2);
  windows[0].emit("ready-to-show");
  assert.ok(windows[0].shows > 0);
  const preferences = windows[0].options.webPreferences as Record<
    string,
    unknown
  >;
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.preload, undefined);
});

test("reopening restores and focuses without resetting the current IPFS page", () => {
  const { open, windows } = createHarness();
  open(WEBUI);
  const window = windows[0];
  void window.loadURL(`${WEBUI}/#/files`);
  window.minimized = true;
  open(WEBUI);
  assert.equal(windows.length, 1);
  assert.equal(window.restores, 1);
  assert.equal(window.shows, 1);
  assert.equal(window.focuses, 1);
  assert.deepEqual(window.loads, [WEBUI, `${WEBUI}/#/files`]);
});

test("distinct permitted links navigate the existing window without duplicates or repeat reloads", () => {
  const { open, windows } = createHarness();
  const files = `${WEBUI}/#/files`;
  const peers = `${WEBUI}/#/peers`;
  open(WEBUI);
  open(files);
  open(files);
  open(peers);
  open(WEBUI);
  assert.equal(windows.length, 1);
  assert.deepEqual(windows[0].loads, [WEBUI, files, peers]);
  assert.equal(windows[0].focuses, 4);
});

test("a repeated explicit link does not interrupt a pending load, or reload after commit", async () => {
  const { open, windows } = createHarness();
  const files = `${WEBUI}/#/files`;
  open(WEBUI);
  const window = windows[0];
  window.commitLoad();
  await Promise.resolve();
  open(files);
  assert.equal(
    window.webContents.getURL(),
    WEBUI,
    "requested is not committed",
  );
  open(files);
  assert.deepEqual(window.loads, [WEBUI, files]);
  window.commitLoad();
  await Promise.resolve();
  open(files);
  assert.deepEqual(window.loads, [WEBUI, files]);
});

test("failed loads can be retried without reusing stale pending state", async () => {
  const { open, windows } = createHarness();
  const files = `${WEBUI}/#/files`;
  open(files);
  const window = windows[0];
  window.failLoad();
  await Promise.resolve();
  open(files);
  assert.deepEqual(window.loads, [files, files]);
});

test("superseded completions cannot clear a newer pending request for the same URL", async () => {
  const { open, windows } = createHarness();
  const files = `${WEBUI}/#/files`;
  const peers = `${WEBUI}/#/peers`;
  open(files);
  const window = windows[0];
  open(peers);
  open(files);
  window.failLoad(0);
  window.failLoad(1);
  await Promise.resolve();
  open(files);
  assert.deepEqual(window.loads, [files, peers, files]);
});

test("a different pending navigation does not block returning to the committed URL", async () => {
  const { open, windows } = createHarness();
  const files = `${WEBUI}/#/files`;
  const peers = `${WEBUI}/#/peers`;
  open(files);
  windows[0].commitLoad();
  await Promise.resolve();
  open(peers);
  open(files);
  assert.deepEqual(windows[0].loads, [files, peers, files]);
});

test("the sidebar focuses a window first opened with a specific IPFS link", () => {
  const { open, windows } = createHarness();
  const files = `${WEBUI}/#/files`;
  open(files);
  open(WEBUI);
  assert.equal(windows.length, 1);
  assert.deepEqual(windows[0].loads, [files]);
  assert.equal(windows[0].focuses, 1);
});

test("disallowed links cannot create or navigate the pinned IPFS window", () => {
  const { open, windows } = createHarness();
  const blocked = [
    "http://127.0.0.1:92560/webui",
    "http://127.0.0.1:9256.attacker.test/webui",
    "https://example.com/webui",
    "javascript:alert(1)",
    "not a URL",
  ];
  for (const url of blocked) open(url);
  assert.equal(windows.length, 0);
  open(WEBUI);
  for (const url of blocked) open(url);
  assert.equal(windows.length, 1);
  assert.deepEqual(windows[0].loads, [WEBUI]);
});

test("closing MyIPFS allows exactly one replacement window", () => {
  const { open, windows } = createHarness();
  open(WEBUI);
  windows[0].destroyed = true;
  windows[0].emit("closed");
  open(WEBUI);
  open(WEBUI);
  assert.equal(windows.length, 2);
  assert.deepEqual(windows[1].loads, [WEBUI]);
  assert.equal(windows[1].focuses, 1);
});

test("a destroyed window and its late closed event cannot discard the replacement", () => {
  const { open, windows } = createHarness();
  open(WEBUI);
  windows[0].destroyed = true;
  open(WEBUI);
  windows[0].emit("closed");
  open(WEBUI);
  assert.equal(windows.length, 2);
  assert.equal(windows[1].focuses, 1);
});
