import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { runShutdownStepWithTimeout } from "./shutdown";

// Exercise the real lifecycle/IPC functions with no Electron process, user
// profile, workers or IPFS daemon. Importing index.ts would start the app.
const source = ts.createSourceFile(
  "index.ts",
  fs.readFileSync("electron-src/index.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const functions = new Set([
  "quitApplication",
  "requestApplicationQuit",
  "destroyMainWindow",
]);
const lifecycle = source.statements.filter(
  (node) =>
    ts.isFunctionDeclaration(node) && functions.has(node.name?.text ?? ""),
);
const registration = source.statements.find(
  (node) =>
    ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) &&
    node.expression.expression.getText(source) === "ipcMain.handle" &&
    node.expression.arguments[0]?.getText(source) ===
      '"restart-for-local-ipfs"',
);
assert.equal(lifecycle.length, functions.size);
assert.ok(registration);
const lifecycleSource = [...lifecycle, registration]
  .map((node) => node.getText(source))
  .join("\n");

function harness(
  stop: () => Promise<void> = async () => undefined,
  saveWindowState: () => void = () => undefined,
) {
  const calls: string[] = [];
  const errors: string[] = [];
  const webContents = { mainFrame: {}, removeAllListeners() {} };
  let restartRequired = true;
  let failRelaunch = false;
  let handler!: (event: unknown) => Promise<void>;
  const context = vm.createContext({
    mainWindow: {
      webContents,
      getBounds: () => ({ x: 1, y: 2, width: 800, height: 600 }),
      isMaximized: () => false,
      destroy: () => calls.push("destroy"),
    },
    scheduledWorkers: [],
    stopSchedulers: async () => {
      calls.push("workers");
      await stop();
    },
    IPFS_SERVER: {
      shutdown: async () => {
        calls.push("ipfs");
        await stop();
      },
    },
    runShutdownStepWithTimeout,
    hideBackgroundTray: () => calls.push("hide-tray"),
    setValue: (key: string) => {
      calls.push(`save:${key}`);
      saveWindowState();
    },
    Logger: { info() {}, error: (message: string) => errors.push(message) },
    app: {
      relaunch: (...args: unknown[]) => {
        assert.equal(
          args.length,
          0,
          "preserve Electron's app path and launch arguments",
        );
        if (failRelaunch) throw new Error("relaunch failed");
        calls.push("relaunch");
      },
      quit: () => calls.push("quit"),
    },
    localIpfsPreferences: { getSnapshot: () => ({ restartRequired }) },
    ipcMain: {
      handle: (_channel: string, value: typeof handler) => {
        handler = value;
      },
    },
  });
  vm.runInContext(
    ts.transpileModule(
      "let quitApplicationPromise = null; let isMainWindowCloseAuthorized = false;\n" +
        lifecycleSource,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    context,
  );
  return {
    calls,
    errors,
    restart: () =>
      handler({ sender: webContents, senderFrame: webContents.mainFrame }),
    request: (event: unknown) => handler(event),
    requestFromChildFrame: () =>
      handler({ sender: webContents, senderFrame: {} }),
    restartAgain: () =>
      vm.runInContext(
        "requestApplicationQuit({ restart: true })",
        context,
      ) as Promise<void>,
    quit: () =>
      vm.runInContext("requestApplicationQuit()", context) as Promise<void>,
    noPendingChange: () => {
      restartRequired = false;
    },
    failRelaunch: (value: boolean) => {
      failRelaunch = value;
    },
  };
}

test("restart bypasses the chooser, drains services, and schedules one same-profile relaunch", async () => {
  let finish!: () => void;
  const stopped = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const app = harness(() => stopped);
  const restart = app.restart();
  assert.equal(
    app.restartAgain(),
    restart,
    "repeat restart cannot queue a second relaunch",
  );
  assert.equal(app.quit(), restart, "concurrent quit reuses the same shutdown");
  assert.deepEqual(app.calls, [
    "relaunch",
    "hide-tray",
    "save:window-state",
    "destroy",
    "workers",
    "ipfs",
  ]);
  assert.ok(
    !app.calls.includes("quit"),
    "wait for service shutdown before exiting",
  );
  finish();
  await restart;
  assert.equal(app.calls.filter((call) => call === "relaunch").length, 1);
  assert.equal(app.calls.filter((call) => call === "quit").length, 1);
});

test("ordinary quit does not relaunch, even when a shutdown step fails", async () => {
  const app = harness(async () => {
    throw new Error("stop failed");
  });
  await app.quit();
  assert.ok(!app.calls.includes("relaunch"));
  assert.equal(app.calls.at(-1), "quit");
});

test("a window-state write failure cannot block quit or a requested restart", async () => {
  for (const restart of [false, true]) {
    const app = harness(undefined, () => {
      throw new Error("window-state write failed: disk full");
    });
    const quitting = restart ? app.restart() : app.quit();
    assert.equal(
      app.quit(),
      quitting,
      "concurrent requests share a settling shutdown",
    );
    await assert.doesNotReject(quitting);
    assert.deepEqual(app.errors, [
      "Failed to save window state while quitting",
    ]);
    assert.deepEqual(app.calls.slice(-4), [
      "destroy",
      "workers",
      "ipfs",
      "quit",
    ]);
    assert.equal(
      app.calls.filter((call) => call === "relaunch").length,
      restart ? 1 : 0,
    );
    assert.equal(app.calls.filter((call) => call === "quit").length, 1);
  }
});

test("restart rejects other windows/frames and unchanged preferences without teardown", () => {
  const app = harness();
  assert.throws(
    () => app.request({ sender: {}, senderFrame: {} }),
    /main app window/,
  );
  assert.throws(() => app.requestFromChildFrame(), /main app window/);
  app.noPendingChange();
  assert.throws(() => app.restart(), /requires a restart/);
  assert.deepEqual(app.calls, []);
});

test("a relaunch failure leaves the app open and permits retry", async () => {
  const app = harness();
  app.failRelaunch(true);
  assert.throws(() => app.restart(), /relaunch failed/);
  assert.deepEqual(app.calls, []);
  app.failRelaunch(false);
  await app.restart();
  assert.equal(app.calls.at(-1), "quit");
});
