import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { pinnedWindowNavigation } from "../navigation-policy";

/** Run the real window opener with inert windows, never Electron or a profile. */
function createHarness() {
  const windows: FakeWindow[] = [];
  class FakeWindow extends EventEmitter {
    destroyed = false;
    minimized = false;
    shows = 0;
    focuses = 0;
    restores = 0;
    loads: string[] = [];
    webContents = Object.assign(new EventEmitter(), {
      setWindowOpenHandler: () => undefined,
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
      return Promise.resolve();
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
  const compiled = ts.transpileModule(
    `${state.getText(source)}\n${opener.getText(source)}\nopenIpfsWindow;`,
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
    shell: { openExternal: async () => undefined },
    Logger: { error: () => undefined },
  }) as (url: string) => void;
  return { open, windows };
}

const WEBUI = "http://127.0.0.1:9256/webui";

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
