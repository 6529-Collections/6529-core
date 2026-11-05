import assert from "node:assert/strict";
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
let startupCode = "";
function findStartup(node: ts.Node) {
  if (
    ts.isExpressionStatement(node) &&
    node.getText(source).startsWith("app.whenReady().then(")
  ) {
    startupCode = `globalThis.startup = ${node.expression.getText(source)};`;
  }
  ts.forEachChild(node, findStartup);
}
findStartup(source);
assert.notEqual(startupCode, "", "Expected the app's startup entry point");
const compiled = ts.transpileModule(startupCode, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

test("Next preparation stays pending until its HTTP server binds and returns that port", async () => {
  const nextSource = ts.createSourceFile(
    "prepareNext.ts",
    fs.readFileSync(
      path.join(process.cwd(), "electron-src/utils/prepareNext.ts"),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    true,
  );
  const prepareNext = nextSource.statements.find(
    (node) =>
      ts.isFunctionDeclaration(node) && node.name?.text === "prepareNext",
  );
  assert.ok(prepareNext);
  const code = ts.transpileModule(
    prepareNext.getText(nextSource).replace(/^export /, ""),
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  let listening!: (port: number) => void;
  const binding = new Promise<number>((resolve) => {
    listening = resolve;
  });
  const readyLogs: unknown[][] = [];
  const server = {};
  const context = vm.createContext({
    nextApp: { prepare: async () => undefined },
    createServer: () => server,
    listenRendererServer: async (candidate: unknown, port: number) => {
      assert.equal(candidate, server);
      assert.equal(port, 6529);
      return binding;
    },
    Logger: { info: (...args: unknown[]) => readyLogs.push(args) },
  });
  vm.runInContext(code, context);
  const startup = context.prepareNext(6529) as Promise<number>;
  let ready = false;
  void startup.then(() => {
    ready = true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(ready, false);
  assert.deepEqual(readyLogs, []);

  listening(3002);
  assert.equal(await startup, 3002);
  assert.deepEqual(readyLogs, [
    ["NEXT SERVER:", "Ready on http://localhost:3002"],
  ]);
});

function startApp(prepareNext: (port: number) => Promise<number>) {
  const calls: string[] = [];
  const noop = () => undefined;
  const context = vm.createContext({
    PORT: undefined,
    IPFS_PORT: 9255,
    IPFS_RPC_PORT: 9256,
    IPFS_SWARM_PORT: 9257,
    IPFS_SERVER: undefined,
    localIpfsPreferences: undefined,
    mainWindow: null,
    splash: null,
    app: {
      whenReady: () => Promise.resolve(),
      setName: noop,
      isDefaultProtocolClient: () => true,
      on: noop,
      exit: (code: number) => calls.push(`exit ${code}`),
    },
    protocol: { handle: noop },
    getScheme: () => "core6529",
    isMac: () => false,
    isDev: false,
    Logger: { info: noop, error: () => calls.push("error logged") },
    dialog: { showErrorBox: () => calls.push("startup error") },
    prepareNext,
    resolvePorts: async () => calls.push("IPFS ports"),
    initLogs: async () => calls.push("logs"),
    initStore: noop,
    getValue: noop,
    setValue: noop,
    LOCAL_IPFS_ENABLED_KEY: "local-ipfs-enabled",
    LocalIpfsPreferences: class {},
    IPFSServer: class {},
    createWindow: async () => calls.push("window"),
  });
  vm.runInContext(compiled, context);
  return { context, calls, done: context.startup as Promise<void> };
}

test("startup opens a window only after binding, using the confirmed fallback port", async () => {
  let listening!: (port: number) => void;
  const pendingListener = new Promise<number>((resolve) => {
    listening = resolve;
  });
  const harness = startApp(async (port) => {
    assert.equal(port, 6529);
    return pendingListener;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(harness.calls, []);

  listening(3001);
  await harness.done;

  assert.equal(harness.context.PORT, 3001);
  assert.deepEqual(harness.calls, ["IPFS ports", "logs", "window"]);
});

test("a failed renderer startup shows an error and exits before any app window opens", async () => {
  const harness = startApp(async () => {
    throw new Error("Cannot bind renderer");
  });
  await harness.done;
  assert.deepEqual(harness.calls, ["error logged", "startup error", "exit 1"]);
  assert.equal(harness.context.PORT, undefined);
});
