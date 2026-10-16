import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile(
  "index.ts",
  fs.readFileSync(path.join(process.cwd(), "electron-src/index.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const functions = [
  "createWindow",
  "createSplash",
  "updateSplashMessage",
  "sendSplashCardIfReady",
];
const code = source.statements
  .filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      functions.includes(node.name?.text ?? ""),
  )
  .map((node) => node.getText(source))
  .join("\n");
const compiled = ts.transpileModule(code, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;

/** Run the real window lifecycle with fake native windows and virtual timers. */
function createHarness(savedArtwork = false) {
  const timers = new Map<number, () => void>();
  const windows: FakeWindow[] = [];
  let nextTimer = 0;
  class FakeWindow extends EventEmitter {
    destroyed = false;
    visible = false;
    webContents = Object.assign(new EventEmitter(), { send: () => undefined });
    constructor(readonly options: { show?: boolean }) {
      super();
      windows.push(this);
    }
    isDestroyed() {
      return this.destroyed;
    }
    loadURL() {
      return Promise.resolve();
    }
    show() {
      this.visible = true;
    }
    destroy() {
      this.destroyed = true;
    }
    maximize() {}
    setBounds() {}
  }
  const noop = () => undefined;
  const context = vm.createContext({
    mainWindow: null,
    splash: null,
    splashCardData: null,
    preloadSplashImagePromise: null,
    latestSplashMessage: "Loading",
    BrowserWindow: FakeWindow,
    path,
    __dirname: "/FAKE",
    PORT: 3000,
    Logger: { info: noop, warn: noop },
    isWindows: () => false,
    isMac: () => true,
    getValue: (key: string) =>
      key === "card" && savedArtwork ? { id: 1, scaled: "fake" } : null,
    isValidSplashCard: (value: unknown) => value !== null,
    SPLASH_CARD_STORE_KEY: "card",
    loadSplashImageFromFile: () => new Promise(() => undefined),
    preloadSplashImage: noop,
    initDb: async () => undefined,
    runCoreMigrations: async () => undefined,
    getDb: noop,
    IPFS_SERVER: { start: async () => "starting" },
    localShortcut: { register: noop },
    createScheduledTasks: async () => undefined,
    process: { on: noop },
    initListeners: noop,
    screen: {
      getPrimaryDisplay: () => ({ workAreaSize: { width: 1200, height: 800 } }),
    },
    SPLASH_MAX_WIDTH: 1000,
    SPLASH_MIN_WIDTH: 500,
    SPLASH_MAX_HEIGHT: 700,
    SPLASH_MIN_HEIGHT: 300,
    SPLASH_SCREEN_RATIO: 0.8,
    app: { getVersion: () => "FAKE" },
    getEnvironment: () => "local",
    getBackendTarget: () => "live",
    fetchSplashCard: async () => {
      throw new Error("Network disabled");
    },
    setTimeout: (callback: () => void) => {
      timers.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  vm.runInContext(compiled, context);
  return {
    windows,
    timers,
    launch: () => vm.runInContext("createWindow()", context) as Promise<void>,
    async ready() {
      windows[0].emit("ready-to-show");
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
    elapseDelay() {
      for (const [id, callback] of [...timers]) {
        timers.delete(id);
        callback();
      }
    },
  };
}

test("fast startup cancels the splash before creating a native window", async () => {
  const h = createHarness();
  await h.launch();
  await h.ready();
  h.elapseDelay();
  assert.equal(h.windows.length, 1);
  assert.equal(h.windows[0].visible, true);
});

test("slow startup shows a painted splash and closes it immediately when ready", async () => {
  const h = createHarness();
  await h.launch();
  h.elapseDelay();
  const splash = h.windows[1];
  assert.equal(splash.options.show, false);
  assert.equal(splash.visible, false);
  splash.emit("ready-to-show");
  assert.equal(splash.visible, false);
  splash.webContents.emit("did-finish-load");
  assert.equal(splash.visible, true);
  await h.ready();
  assert.equal(splash.destroyed, true);
  assert.equal(h.windows[0].visible, true);
});

test("a late splash paint cannot show after the main window is ready", async () => {
  const h = createHarness();
  await h.launch();
  h.elapseDelay();
  const splash = h.windows[1];
  await h.ready();
  splash.emit("ready-to-show");
  assert.equal(splash.visible, false);
  assert.equal(splash.destroyed, true);
});

test(
  "unresolved artwork does not hold up main-window creation",
  { timeout: 1000 },
  async () => {
    const h = createHarness(true);
    await h.launch();
    assert.equal(h.windows.length, 1);
    await h.ready();
    assert.equal(h.windows[0].visible, true);
  },
);
