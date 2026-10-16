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

test("daemon timeout, late readiness and exit publish live status changes", async () => {
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const daemon = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
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
  interface TestServer {
    init: () => Promise<void>;
    startDaemon: (binary: string) => Promise<void>;
    start: (port: number) => Promise<IpfsStatus>;
    getStatus: () => IpfsStatus;
    whenSettled: () => Promise<IpfsStatus>;
  }
  const Server = (
    serverModule.exports as { default: new (...args: unknown[]) => TestServer }
  ).default;
  const statuses: IpfsStatus[] = [];
  const server = new Server(8080, 5001, 4001, (status: IpfsStatus) =>
    statuses.push(status),
  );
  server.init = () => server.startDaemon("FAKE");
  const initial = server.start(3000);
  assert.equal(server.start(3000), initial);
  assert.equal(server.getStatus(), "starting");
  assert.equal(timers.size, 1);
  for (const [id, callback] of [...timers]) {
    timers.delete(id);
    callback();
  }
  await initial;
  assert.equal(await server.whenSettled(), "unavailable");
  daemon.stdout.emit("data", Buffer.from("Daemon is r"));
  assert.equal(server.getStatus(), "unavailable");
  daemon.stdout.emit("data", Buffer.from("eady\n"));
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
