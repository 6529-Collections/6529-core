import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { DeepLinkQueue } from "./deep-link-queue";

test("only a main-frame document navigation resets deep-link readiness", () => {
  const source = ts.createSourceFile(
    "index.ts",
    fs.readFileSync("electron-src/index.ts", "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  let registration: ts.CallExpression | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "mw.webContents.on" &&
      node.arguments[0]?.getText(source) === '"did-start-navigation"'
    )
      registration = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(registration, "main-window navigation readiness reset must exist");
  let navigate!: (
    event: object,
    url: string,
    isInPlace: boolean,
    isMainFrame: boolean,
  ) => void;
  const navigationReadyWindows = new WeakSet<object>();
  const mw = {
    webContents: {
      on: (_name: string, callback: typeof navigate) => {
        navigate = callback;
      },
    },
  };
  let walletLocks = 0;
  const context = vm.createContext({
    mw,
    navigationReadyWindows,
    walletPasswordNavigation: 0,
    walletSavePrompt: null,
    seedWalletSession: { lock: () => walletLocks++ },
  });
  vm.runInContext(
    ts.transpileModule(registration.getText(source), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  navigationReadyWindows.add(mw);
  navigate({}, "http://localhost:6529/#section", true, true);
  assert.equal(navigationReadyWindows.has(mw), true);
  navigate({}, "http://localhost:6529/iframe", false, false);
  assert.equal(navigationReadyWindows.has(mw), true);
  assert.equal(context.walletPasswordNavigation, 0);
  assert.equal(walletLocks, 0);
  navigate({}, "http://localhost:6529/connection/accept", false, true);
  assert.equal(navigationReadyWindows.has(mw), false);
  assert.equal(context.walletPasswordNavigation, 1);
  assert.equal(walletLocks, 1);
});

test("cold-start links retain private fragments until the current renderer is ready", () => {
  let ready = false;
  const delivered: string[] = [];
  const queue = new DeepLinkQueue(
    () => ready,
    (url) => delivered.push(url),
  );
  const first =
    "localclassiccore6529://navigate?path=/connection/accept?code=one#unlock=private";
  queue.enqueue(first);
  queue.flush(); // did-finish-load alone is insufficient.
  assert.deepEqual(delivered, []);
  ready = true;
  queue.flush();
  queue.flush();
  assert.deepEqual(delivered, [first]);
  ready = false; // Reload or recreate the window.
  queue.enqueue("second#secret");
  queue.enqueue("third#secret");
  assert.deepEqual(delivered, [first]);
  ready = true;
  queue.flush();
  assert.deepEqual(delivered, [first, "second#secret", "third#secret"]);
});

test("OS deep links queue through cold startup and reopen an initialized window", async () => {
  const source = ts.createSourceFile(
    "index.ts",
    fs.readFileSync("electron-src/index.ts", "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const events = new Map<string, Function>();
  const declarations: string[] = [];
  const coldLink =
    "LOCALCLASSICCORE6529://navigate?path=/connection/accept#cold";
  const visit = (node: ts.Node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      ["isClassicDeepLink", "receiveDeepLink"].includes(node.name?.text ?? "")
    )
      declarations.push(node.getText(source));
    if (
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression) &&
      node.expression.expression.getText(source) === "app.on" &&
      ['"open-url"', '"second-instance"'].includes(
        node.expression.arguments[0]?.getText(source),
      )
    )
      declarations.push(node.getText(source));
    if (
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression) &&
      node.expression.expression.getText(source) === "receiveDeepLink" &&
      node.expression.arguments[0]
        ?.getText(source)
        .startsWith("process.argv.find")
    )
      declarations.push(node.getText(source));
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(declarations.length, 5);
  const links: string[] = [];
  let reopened = 0;
  const context = vm.createContext({
    app: {
      on: (name: string, callback: Function) => events.set(name, callback),
    },
    mainWindowStartupComplete: false,
    pendingDeepLinks: {
      enqueue: (url: string) => links.push(url),
      flush: () => {},
    },
    getScheme: () => "localclassiccore6529",
    process: { argv: ["app", "localcore6529://other/", coldLink] },
    mainWindow: null,
    restoreFromBackground: async () => {
      reopened++;
    },
    Logger: { error: () => assert.fail("unexpected failure") },
  });
  vm.runInContext(
    ts.transpileModule(declarations.join("\n"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  assert.deepEqual(links, [coldLink]);
  let prevented = false;
  events.get("open-url")!(
    {
      preventDefault: () => {
        prevented = true;
      },
    },
    "localclassiccore6529://navigate?path=/connection/accept#secret",
  );
  assert.equal(prevented, true);
  assert.equal(links.length, 2);
  assert.equal(reopened, 0);
  context.mainWindowStartupComplete = true;
  const openUrl = events.get("open-url")!;
  for (const scheme of [
    "core6529",
    "localcore6529",
    "stagingclassiccore6529",
    "https",
  ]) {
    openUrl(
      {
        preventDefault() {
          assert.fail("another app's URL must keep its default handling");
        },
      },
      `${scheme}://navigate/connection/accept#wrong-app`,
    );
  }
  assert.equal(links.length, 2);
  assert.equal(reopened, 0);
  events.get("second-instance")!({}, [
    "app",
    "localclassiccore6529://navigate?path=/connection/accept#second",
  ]);
  await Promise.resolve();
  assert.equal(reopened, 1);
  assert.equal(links.length, 3);
});

test("only the owned main frame can release private links, after listener registration", () => {
  const source = ts.createSourceFile(
    "index.ts",
    fs.readFileSync("electron-src/index.ts", "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const handler = source.statements.find(
    (node) =>
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression) &&
      node.expression.expression.getText(source) === "ipcMain.handle" &&
      node.expression.arguments[0]?.getText(source) === '"navigation-ready"',
  );
  assert.ok(handler, "navigation readiness handler must exist");
  let ready: Function | undefined;
  let flushed = 0;
  const mainWindow = {};
  const navigationReadyWindows = new WeakSet<object>();
  const context = vm.createContext({
    ipcMain: {
      handle: (_channel: string, callback: Function) => {
        ready = callback;
      },
    },
    mainWindow,
    navigationReadyWindows,
    desktopProfileBackend: (event: { trusted: boolean }) => {
      if (!event.trusted) throw new Error("untrusted frame");
    },
    pendingDeepLinks: {
      flush: () => {
        flushed++;
      },
    },
  });
  vm.runInContext(
    ts.transpileModule(handler.getText(source), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  assert.throws(() => ready!({ trusted: false }), /untrusted frame/);
  assert.equal(navigationReadyWindows.has(mainWindow), false);
  assert.equal(flushed, 0);
  ready!({ trusted: true });
  assert.equal(navigationReadyWindows.has(mainWindow), true);
  assert.equal(flushed, 1);
  const titlebar = fs.readFileSync(
    "renderer/components/header/titlebar/TitleBar.tsx",
    "utf8",
  );
  assert.ok(
    titlebar.indexOf("window.api.onNavigate(handleNavigate)") <
      titlebar.indexOf("window.api.navigationReady()"),
  );
});
