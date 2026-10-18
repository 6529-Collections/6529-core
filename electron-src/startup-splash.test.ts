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
  "appIconPath",
  "initCoreOnce",
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
function createHarness(
  savedArtwork = false,
  createScheduledTasks: () => Promise<void> = async () => undefined,
) {
  const timers = new Map<number, () => void>();
  const timerDelays: number[] = [];
  const calls = { initDb: 0, migrations: 0, scheduledTasks: 0 };
  const sent: Array<{ channel: string; payload: unknown }> = [];
  const errors: unknown[][] = [];
  const windows: FakeWindow[] = [];
  let nextTimer = 0;
  class FakeWindow extends EventEmitter {
    destroyed = false;
    visible = false;
    webContents = Object.assign(new EventEmitter(), {
      send: (channel: string, payload: unknown) => sent.push({ channel, payload }),
    });
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
    savedSplashImage: null,
    latestSplashMessage: "Loading",
    BrowserWindow: FakeWindow,
    path,
    __dirname: "/FAKE",
    PORT: 3000,
    Logger: {
      info: noop,
      warn: noop,
      error: (...args: unknown[]) => errors.push(args),
    },
    isWindows: () => false,
    isMac: () => true,
    getValue: (key: string) =>
      key === "card" && savedArtwork ? { id: 1, scaled: "fake" } : null,
    isValidSplashCard: (value: unknown) => value !== null,
    SPLASH_CARD_STORE_KEY: "card",
    savedSplashImageUrl: () => "file:///FAKE/splash-image",
    initDb: async () => {
      calls.initDb++;
    },
    runCoreMigrations: async () => {
      calls.migrations++;
    },
    coreReady: null,
    scheduledTasksStarted: false,
    getDb: noop,
    IPFS_SERVER: { start: async () => "starting" },
    localShortcut: { register: noop },
    hideBackgroundTray: noop,
    createScheduledTasks: () => {
      calls.scheduledTasks++;
      return createScheduledTasks();
    },
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
    setTimeout: (callback: () => void, delay: number) => {
      timerDelays.push(delay);
      timers.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  vm.runInContext(compiled, context);
  return {
    context,
    calls,
    sent,
    windows,
    timers,
    timerDelays,
    errors,
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
  assert.deepEqual(h.timerDelays, [1000]);
  await h.ready();
  h.elapseDelay();
  assert.equal(h.windows.length, 1);
  assert.equal(h.windows[0].visible, true);
});

test("reopening the window from background mode keeps the database and jobs", async () => {
  const h = createHarness();
  await h.launch();
  await h.ready();
  // Background mode destroys the main window; a second launch reopens it.
  h.windows[0].destroy();
  h.context.mainWindow = null;
  await h.launch();
  const reopened = h.windows.at(-1)!;
  reopened.emit("ready-to-show");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(reopened.visible, true);
  assert.deepEqual(h.calls, { initDb: 1, migrations: 1, scheduledTasks: 1 });
});

test("a window reopened after failed scheduler setup tries the setup again", async () => {
  let attempts = 0;
  const h = createHarness(false, async () => {
    attempts++;
    if (attempts === 1) throw new Error("setup failed");
  });
  await h.launch();
  await h.ready();
  h.windows[0].destroy();
  h.context.mainWindow = null;
  await h.launch();
  h.windows.at(-1)!.emit("ready-to-show");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(attempts, 2);
  assert.deepEqual(h.calls, { initDb: 1, migrations: 1, scheduledTasks: 2 });
});

test("the splash gets the saved image as a file URL, never as data", async () => {
  const h = createHarness(true);
  await h.launch();
  h.elapseDelay();
  const splash = h.windows[1];
  splash.webContents.emit("did-finish-load");
  await new Promise<void>((resolve) => setImmediate(resolve));
  const card = h.sent.find((entry) => entry.channel === "splash-card")?.payload as
    | { preloadedImageDataUrl?: string }
    | undefined;
  assert.equal(card?.preloadedImageDataUrl, "file:///FAKE/splash-image");
});

test("main window is visible before scheduler setup starts or finishes", async () => {
  let finishSetup!: () => void;
  const setup = new Promise<void>((resolve) => {
    finishSetup = resolve;
  });
  let visibleDuringSetup = false;
  const h = createHarness(false, () => {
    visibleDuringSetup = h.windows[0].visible;
    return setup;
  });
  await h.launch();
  await h.ready();
  h.elapseDelay();
  assert.equal(h.windows.length, 1);
  assert.equal(h.windows[0].visible, true);
  assert.equal(visibleDuringSetup, true);
  finishSetup();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(h.windows[0].visible, true);
});

test("late splash paint stays hidden while ready main window finishes scheduler setup", async () => {
  let finishSetup!: () => void;
  const setup = new Promise<void>((resolve) => {
    finishSetup = resolve;
  });
  const h = createHarness(false, () => setup);
  await h.launch();
  h.elapseDelay();
  const splash = h.windows[1];
  await h.ready();
  splash.emit("ready-to-show");
  splash.webContents.emit("did-finish-load");
  assert.equal(splash.visible, false);
  assert.equal(splash.destroyed, true);
  assert.equal(h.windows[0].visible, true);
  finishSetup();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(splash.destroyed, true);
  assert.equal(h.windows[0].visible, true);
});

test("visible splash closes without waiting for scheduler setup", async () => {
  const h = createHarness(false, () => new Promise<void>(() => undefined));
  await h.launch();
  h.elapseDelay();
  const splash = h.windows[1];
  splash.emit("ready-to-show");
  splash.webContents.emit("did-finish-load");
  assert.equal(splash.visible, true);
  await h.ready();
  assert.equal(h.windows[0].visible, true);
  assert.equal(splash.destroyed, true);
});

test("scheduler setup failure is logged without hiding the main window", async () => {
  const failure = new Error("Scheduler setup failed");
  const h = createHarness(false, async () => {
    throw failure;
  });
  await h.launch();
  await h.ready();
  assert.equal(h.windows[0].visible, true);
  assert.deepEqual(h.errors, [["Could not initialize scheduled tasks", failure]]);
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
