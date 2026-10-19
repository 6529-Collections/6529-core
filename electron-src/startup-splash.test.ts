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
  "openMainWindow",
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

/** Run the real lifecycle with fake windows; record any startup delay. */
function createHarness(
  savedArtwork = false,
  createScheduledTasks: () => Promise<void> = async () => undefined,
  initializeDatabase: () => Promise<void> = async () => undefined,
) {
  const timerDelays: number[] = [];
  const calls = { initDb: 0, migrations: 0, scheduledTasks: 0 };
  const sent: Array<{ channel: string; payload: unknown }> = [];
  const errors: unknown[][] = [];
  const windows: FakeWindow[] = [];
  class FakeWindow extends EventEmitter {
    destroyed = false;
    visible = false;
    webContents = Object.assign(new EventEmitter(), {
      send: (channel: string, payload: unknown) =>
        sent.push({ channel, payload }),
    });
    constructor(readonly options: { show?: boolean; frame?: boolean }) {
      super();
      this.visible = options.show !== false;
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
      this.visible = false;
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
    windowCreation: null,
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
      await initializeDatabase();
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
    setTimeout: (_callback: () => void, delay: number) => {
      timerDelays.push(delay);
      return timerDelays.length;
    },
    clearTimeout: noop,
  });
  vm.runInContext(compiled, context);
  return {
    context,
    calls,
    sent,
    windows,
    timerDelays,
    errors,
    get main() {
      return windows.filter((window) => window.options.frame !== false).at(-1)!;
    },
    get splash() {
      return windows.filter((window) => window.options.frame === false).at(-1)!;
    },
    launch: () => vm.runInContext("createWindow()", context) as Promise<void>,
    async ready() {
      this.main.emit("ready-to-show");
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
  };
}

test("startup shows the splash immediately while database initialization is pending", async () => {
  let finishDatabase!: () => void;
  const database = new Promise<void>((resolve) => {
    finishDatabase = resolve;
  });
  const h = createHarness(false, undefined, () => database);
  const launch = h.launch();
  assert.equal(h.windows.length, 1);
  assert.equal(h.splash.options.show, true);
  assert.equal(h.splash.visible, true);
  assert.deepEqual(h.timerDelays, []);
  finishDatabase();
  await launch;
  assert.equal(h.main.visible, false);
});

test("even fast startup shows a splash and switches to the ready main window without a delay", async () => {
  const h = createHarness();
  await h.launch();
  assert.deepEqual(h.timerDelays, []);
  assert.equal(h.splash.visible, true);
  await h.ready();
  assert.equal(h.windows.length, 2);
  assert.equal(h.main.visible, true);
  assert.equal(h.splash.destroyed, true);
});

test("reopening the window from background mode keeps the database and jobs", async () => {
  const h = createHarness();
  await h.launch();
  await h.ready();
  // Background mode destroys the main window; a second launch reopens it.
  h.main.destroy();
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
  h.main.destroy();
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
  const splash = h.splash;
  splash.webContents.emit("did-finish-load");
  await new Promise<void>((resolve) => setImmediate(resolve));
  const card = h.sent.find((entry) => entry.channel === "splash-card")
    ?.payload as { preloadedImageDataUrl?: string } | undefined;
  assert.equal(card?.preloadedImageDataUrl, "file:///FAKE/splash-image");
});

test("requests that arrive while the window opens share one window", async () => {
  const h = createHarness();
  // Startup and a second launch ask for the window at the same moment.
  await Promise.all([h.launch(), h.launch()]);
  assert.equal(h.windows.length, 2);
  assert.equal(h.calls.initDb, 1);
});

test("main window is visible before scheduler setup starts or finishes", async () => {
  let finishSetup!: () => void;
  const setup = new Promise<void>((resolve) => {
    finishSetup = resolve;
  });
  let visibleDuringSetup = false;
  const h = createHarness(false, () => {
    visibleDuringSetup = h.main.visible;
    return setup;
  });
  await h.launch();
  await h.ready();
  assert.equal(h.windows.length, 2);
  assert.equal(h.main.visible, true);
  assert.equal(visibleDuringSetup, true);
  finishSetup();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(h.main.visible, true);
});

test("late splash paint stays hidden while ready main window finishes scheduler setup", async () => {
  let finishSetup!: () => void;
  const setup = new Promise<void>((resolve) => {
    finishSetup = resolve;
  });
  const h = createHarness(false, () => setup);
  await h.launch();
  const splash = h.splash;
  await h.ready();
  splash.emit("ready-to-show");
  splash.webContents.emit("did-finish-load");
  assert.equal(splash.visible, false);
  assert.equal(splash.destroyed, true);
  assert.equal(h.main.visible, true);
  finishSetup();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(splash.destroyed, true);
  assert.equal(h.main.visible, true);
});

test("visible splash closes without waiting for scheduler setup", async () => {
  const h = createHarness(false, () => new Promise<void>(() => undefined));
  await h.launch();
  const splash = h.splash;
  splash.emit("ready-to-show");
  splash.webContents.emit("did-finish-load");
  assert.equal(splash.visible, true);
  await h.ready();
  assert.equal(h.main.visible, true);
  assert.equal(splash.destroyed, true);
});

test("scheduler setup failure is logged without hiding the main window", async () => {
  const failure = new Error("Scheduler setup failed");
  const h = createHarness(false, async () => {
    throw failure;
  });
  await h.launch();
  await h.ready();
  assert.equal(h.main.visible, true);
  assert.deepEqual(h.errors, [
    ["Could not initialize scheduled tasks", failure],
  ]);
});

test("splash paint and artwork events do not gate main-window display", async () => {
  const h = createHarness();
  await h.launch();
  const splash = h.splash;
  assert.equal(splash.visible, true);
  await h.ready();
  assert.equal(splash.destroyed, true);
  assert.equal(h.main.visible, true);
});

test("a late splash paint cannot show after the main window is ready", async () => {
  const h = createHarness();
  await h.launch();
  const splash = h.splash;
  await h.ready();
  splash.emit("ready-to-show");
  assert.equal(splash.destroyed, true);
  assert.equal(h.main.visible, true);
});

test(
  "unresolved artwork does not hold up main-window creation",
  { timeout: 1000 },
  async () => {
    const h = createHarness(true);
    h.context.fetchSplashCard = () => new Promise(() => undefined);
    await h.launch();
    assert.equal(h.windows.length, 2);
    await h.ready();
    assert.equal(h.main.visible, true);
    assert.equal(h.splash.destroyed, true);
  },
);

// Exercise the actual F9 callback without launching a packaged app or CDP.
const suiteSource = ts.createSourceFile(
  "run.ts",
  fs.readFileSync(path.join(process.cwd(), "e2e/desktop/run.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
let splashCheck: ts.Expression | undefined;
function findSplashCheck(node: ts.Node): void {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(suiteSource) === "recorder.check" &&
    ts.isStringLiteral(node.arguments[0]) &&
    node.arguments[0].text === "F9"
  ) {
    splashCheck = node.arguments[3];
  }
  ts.forEachChild(node, findSplashCheck);
}
findSplashCheck(suiteSource);
assert.ok(splashCheck, "The function suite must register its F9 splash check");
const compiledSplashCheck = ts.transpileModule(
  `const runCheck = ${splashCheck.getText(suiteSource)}; runCheck();`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function runFunctionSuiteSplashCheck({
  created = 0,
  observed = null,
  shown = 25,
  staysOpen = false,
}: {
  created?: number | null;
  observed?: number | null;
  shown?: number | null;
  staysOpen?: boolean;
} = {}): Promise<string> {
  return vm.runInNewContext(compiledSplashCheck, {
    splashSeenAt: observed,
    shownLog: shown === null ? null : { time: 1000 + shown },
    session: {
      startedAt: 1000,
      logMilestone: () => created,
      pages: () => (staysOpen ? [{ url: () => "file:///splash.html" }] : []),
    },
    waitFor: async (_label: string, condition: () => boolean) => {
      assert.ok(condition(), "the splash did not close");
    },
  }) as Promise<string>;
}

test("function suite rejects a missing splash even on a fast launch", async () => {
  await assert.rejects(
    runFunctionSuiteSplashCheck({ created: null }),
    /every launch must create the splash/,
  );
});

test("function suite accepts a brief splash logged before CDP attached", async () => {
  assert.match(await runFunctionSuiteSplashCheck(), /splash at 0\.0 s/);
});

test("function suite accepts an observed splash and requires it to close", async () => {
  assert.match(
    await runFunctionSuiteSplashCheck({ created: null, observed: 10 }),
    /splash at/,
  );
  await assert.rejects(
    runFunctionSuiteSplashCheck({ staysOpen: true }),
    /splash did not close/,
  );
});

test("function suite requires main readiness and rejects a late splash", async () => {
  await assert.rejects(
    runFunctionSuiteSplashCheck({ shown: null }),
    /main window readiness was not logged/,
  );
  await assert.rejects(
    runFunctionSuiteSplashCheck({ created: 50, shown: 25 }),
    /splash was created after the main window was ready/,
  );
});
