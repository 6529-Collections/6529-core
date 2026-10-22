import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import type { IpfsStatus } from "../../shared/ipfs-status";

const compile = (text: string) =>
  ts.transpileModule(text, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

interface TestServer {
  init: () => Promise<void>;
  startDaemon: (binary: string) => Promise<void>;
  start: (port: number) => Promise<IpfsStatus>;
  getStatus: () => IpfsStatus;
  whenSettled: () => Promise<IpfsStatus>;
  shutdown: () => Promise<void>;
  ensureWebUi: () => Promise<void>;
}

/** Exercise the real daemon lifecycle without processes, network or wall-clock waits. */
function createServerHarness() {
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const daemon = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    pid: 123,
    exitCode: null,
    signalCode: null,
    kill: () => undefined,
  });
  const logger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  const startup = { exports: {} };
  vm.runInNewContext(compile(read("electron-src/ipfs/ipfs-startup.ts")), {
    module: startup,
    exports: startup.exports,
  });
  const config = { exports: {} };
  vm.runInNewContext(compile(read("electron-src/ipfs/ipfs-config.ts")), {
    module: config,
    exports: config.exports,
  });
  const serverModule = { exports: {} };
  const dependencies: Record<string, unknown> = {
    axios: {
      post: async () => {
        throw new Error("Network disabled");
      },
    },
    child_process: { spawn: () => daemon },
    electron: { app: { getPath: () => "/FAKE" } },
    "electron-log": logger,
    fs: {},
    path,
    "./ipfs-startup": startup.exports,
    "./ipfs-config": config.exports,
    "./ipfs-webui": {},
  };
  vm.runInNewContext(compile(read("electron-src/ipfs/ipfs.server.ts")), {
    module: serverModule,
    exports: serverModule.exports,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    },
    setTimeout: (callback: () => void) => {
      timers.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeout: (id: number) => timers.delete(id),
    process: { env: {} },
  });
  const Server = (
    serverModule.exports as { default: new (...args: unknown[]) => TestServer }
  ).default;
  const statuses: IpfsStatus[] = [];
  const server = new Server(8080, 5001, 4001, (status: IpfsStatus) =>
    statuses.push(status),
  );
  server.init = () => server.startDaemon("FAKE");
  server.ensureWebUi = async () => undefined;
  const expireTimers = () => {
    for (const [id, callback] of [...timers]) {
      timers.delete(id);
      callback();
    }
  };
  return { server, daemon, statuses, timers, expireTimers };
}

test("daemon timeout, late readiness and exit publish live status changes", async () => {
  const { server, daemon, statuses, timers, expireTimers } = createServerHarness();
  const initial = server.start(3000);
  assert.equal(server.start(3000), initial);
  assert.equal(server.getStatus(), "starting");
  assert.equal(timers.size, 1);
  expireTimers();
  await initial;
  assert.equal(await server.whenSettled(), "unavailable");
  daemon.stdout.emit("data", Buffer.from("Daemon is r"));
  assert.equal(server.getStatus(), "unavailable");
  daemon.stdout.emit("data", Buffer.from("eady\n"));
  await Promise.resolve();
  assert.equal(await server.whenSettled(), "ready");
  daemon.emit("close", 1);
  assert.equal(await server.whenSettled(), "unavailable");
  assert.deepEqual(statuses, [
    "starting",
    "unavailable",
    "ready",
    "unavailable",
  ]);
});

for (const phase of ["starting", "timed-out", "ready-pending", "ready"] as const) {
  test(`shutdown prevents readiness during ${phase} startup`, async () => {
    const { server, daemon, statuses, timers, expireTimers } = createServerHarness();
    const startup = server.start(3000);
    if (phase === "timed-out") {
      expireTimers();
      await startup;
    } else if (phase === "ready" || phase === "ready-pending") {
      daemon.stdout.emit("data", Buffer.from("Daemon is ready\n"));
      if (phase === "ready") assert.equal(await startup, "ready");
    }

    // Ready output can arrive after termination starts, or startup's success
    // continuation can already be queued when shutdown withdraws availability.
    const shutdown = server.shutdown();
    const transitionCount = statuses.length;
    assert.equal(server.getStatus(), "unavailable");
    daemon.stdout.emit("data", Buffer.from("Daemon is r"));
    daemon.stdout.emit("data", Buffer.from("eady\n"));
    await Promise.resolve();
    assert.equal(server.getStatus(), "unavailable");
    assert.equal(statuses.slice(transitionCount).includes("ready"), false);
    daemon.emit("close", 0);
    await shutdown;
    await startup;
    assert.equal(await server.whenSettled(), "unavailable");
    assert.equal(timers.size, 0);
  });
}

test("preload status subscription removes the exact listener and exposes no IPC object", () => {
  const source = ts.createSourceFile(
    "preload.ts",
    read("electron-src/preload.ts"),
    ts.ScriptTarget.Latest,
    true,
  );
  let property: ts.ObjectLiteralElementLike | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(source) === "onIpfsStatusChange"
    )
      property = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(property);
  const ipcRenderer = new EventEmitter();
  const api = vm.runInNewContext(compile(`({ ${property.getText(source)} })`), {
    ipcRenderer,
  });
  const statuses: string[] = [];
  const unsubscribe = api.onIpfsStatusChange((status: string) =>
    statuses.push(status),
  );
  ipcRenderer.emit("ipfs-status-change", {}, "ready");
  assert.deepEqual(statuses, ["ready"]);
  assert.equal(unsubscribe(), undefined);
  assert.equal(ipcRenderer.listenerCount("ipfs-status-change"), 0);
  ipcRenderer.emit("ipfs-status-change", {}, "unavailable");
  assert.deepEqual(statuses, ["ready"]);
});

test("timed-out repository commands release startup only after the child closes", async () => {
  const source = ts.createSourceFile(
    "ipfs.server.ts", read("electron-src/ipfs/ipfs.server.ts"),
    ts.ScriptTarget.Latest, true,
  );
  const server = source.statements.find(ts.isClassDeclaration);
  const method = server?.members.find(
    (member) => member.name?.getText(source) === "runCommand",
  );
  assert.ok(method);
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const signals: (string | undefined)[] = [];
  const child = Object.assign(new EventEmitter(), {
    stderr: new EventEmitter(),
    kill: (signal?: string) => { signals.push(signal); return true; },
  });
  const command = vm.runInNewContext(
    compile(`new class { ${method.getText(source)} }`),
    {
      spawn: () => child,
      process: { env: {} },
      setTimeout: (callback: () => void) => {
        timers.set(++nextTimer, callback);
        return nextTimer;
      },
      clearTimeout: (id: number) => timers.delete(id),
    },
  );
  let finished = false;
  const result = command.runCommand("FAKE", ["bootstrap", "rm", "--all"], 30_000);
  const rejection = assert.rejects(result, /ipfs bootstrap rm --all timed out after 30000ms/);
  void result.then(() => { finished = true; }, () => { finished = true; });
  const expire = () => {
    const [id, callback] = [...timers][0];
    timers.delete(id);
    callback();
  };
  expire();
  assert.deepEqual(signals, [undefined]);
  child.emit("error", new Error("termination pending"));
  await Promise.resolve();
  assert.equal(finished, false, "no next setup step while the child still holds its lock");
  expire();
  assert.deepEqual(signals, [undefined, "SIGKILL"]);
  await Promise.resolve();
  assert.equal(finished, false);
  child.emit("close", 0);
  await rejection;
  assert.equal(finished, true);
  assert.equal(timers.size, 0);

  // Successful termination clears the escalation timer, and ordinary errors
  // retain their original diagnostic rather than becoming timeouts.
  const closed = command.runCommand("FAKE", ["init"], 30_000);
  const closedRejection = assert.rejects(closed, /timed out/);
  expire();
  child.emit("close", null);
  await closedRejection;
  assert.equal(timers.size, 0);
  const failed = command.runCommand("FAKE", ["init"], 30_000);
  const failedRejection = assert.rejects(failed, /spawn failed/);
  child.emit("error", new Error("spawn failed"));
  await failedRejection;
  assert.equal(timers.size, 0);
  const success = command.runCommand("FAKE", ["init"], 30_000);
  child.emit("close", 0);
  await success;
  assert.equal(timers.size, 0);
});

test("IPFS info returns a live snapshot without waiting for startup", () => {
  const source = ts.createSourceFile(
    "index.ts", read("electron-src/index.ts"), ts.ScriptTarget.Latest, true,
  );
  const registration = source.statements.find((node) =>
    ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) &&
    node.expression.expression.getText(source) === "ipcMain.handle" &&
    node.expression.arguments[0]?.getText(source) === '"get-ipfs-info"',
  );
  assert.ok(registration);
  let handler: (() => Record<string, unknown>) | undefined;
  let status: IpfsStatus = "starting";
  let endpointReads = 0;
  const endpoint = () => { endpointReads++; return "FAKE"; };
  vm.runInNewContext(compile(registration.getText(source)), {
    ipcMain: { handle: (_: string, callback: typeof handler) => { handler = callback; } },
    IPFS_SERVER: {
      getStatus: () => status,
      whenSettled: () => { throw new Error("Must not wait for startup"); },
      getApiEndpoint: endpoint,
      getGatewayEndpoint: endpoint,
      getMfsPath: endpoint,
    },
  });
  assert.ok(handler);
  for (const state of ["stopped", "starting", "unavailable", "ready", "unavailable"] as const) {
    status = state;
    const result = handler();
    assert.equal(result.status, state);
    assert.equal(result.then, undefined, "the handler must answer synchronously");
    assert.equal("apiEndpoint" in result, state === "ready");
    assert.equal("gatewayEndpoint" in result, state === "ready");
    assert.equal("mfsPath" in result, state === "ready");
  }
  assert.equal(endpointReads, 3);
});

test("late daemon readiness waits for WebUI pinning before publishing ready", async () => {
  const { server, daemon, expireTimers } = createServerHarness();
  let finish!: () => void;
  server.ensureWebUi = () => new Promise<void>((resolve) => { finish = resolve; });
  const startup = server.start(3000);
  expireTimers();
  await startup;
  daemon.stdout.emit("data", Buffer.from("Daemon is ready\n"));
  assert.equal(server.getStatus(), "unavailable");
  finish();
  await Promise.resolve();
  assert.equal(server.getStatus(), "ready");
});

test("late WebUI setup failure never publishes ready", async () => {
  const { server, daemon, expireTimers } = createServerHarness();
  server.ensureWebUi = async () => { throw new Error("missing archive"); };
  const startup = server.start(3000);
  expireTimers();
  await startup;
  daemon.stdout.emit("data", Buffer.from("Daemon is ready\n"));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(server.getStatus(), "unavailable");
});
