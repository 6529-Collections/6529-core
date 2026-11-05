import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { DesktopProfileStorage } from "./desktop-profile-storage";
import {
  parseDesktopProfileState,
  getDesktopProfileMigrationState,
  type DesktopProfileState,
} from "../shared/desktop-profile-state";

const A = `0x${"a".repeat(40)}`;
const B = `0x${"b".repeat(40)}`;
const EMPTY: DesktopProfileState = {
  version: 1,
  accounts: [],
  activeAddress: null,
};
const profile = (address: string) => ({
  address,
  authSessionVersion: "v2",
  jwt: "fixture-access-token",
  profileHandle: "fixture",
  refreshToken: "must-not-migrate",
});
const snapshot = (
  addresses: string[],
  activeAddress: string | null = addresses[0] ?? null,
) =>
  parseDesktopProfileState({
    version: 1,
    accounts: addresses.map(profile),
    activeAddress,
  });

function fixture(legacy = snapshot([A])) {
  const saved = new Map<string, unknown>();
  const sessions = new Set([A, B]);
  let legacyReads = 0;
  const deps = {
    get: (key: string) => saved.get(key),
    set: (key: string, value: unknown) => {
      saved.set(key, value);
    },
    encrypt: (value: string) => Buffer.from(value).toString("base64"),
    decrypt: (value: string) => Buffer.from(value, "base64").toString(),
    readLegacy: async () => {
      legacyReads++;
      return legacy;
    },
    hasSession: (address: string) => sessions.has(address),
  };
  return {
    storage: new DesktopProfileStorage(deps),
    deps,
    saved,
    sessions,
    legacyReads: () => legacyReads,
  };
}

test("recovers existing profiles from the old origin and keeps them across later origins", async () => {
  const f = fixture(snapshot([A, B], B));
  const restored = await f.storage.restore("live", EMPTY);
  assert.deepEqual(
    restored.accounts.map((account) => account.address),
    [A, B],
  );
  assert.equal(restored.activeAddress, B);
  assert.equal(restored.accounts[0].jwt, "fixture-access-token");
  assert.equal(restored.accounts[0].refreshToken, null);
  assert.doesNotMatch(
    JSON.stringify(f.saved.values().next().value),
    /fixture-access-token|must-not-migrate/,
  );

  const restarted = new DesktopProfileStorage({
    ...f.deps,
    readLegacy: async () => {
      throw new Error("Must not reimport");
    },
  });
  assert.deepEqual(await restarted.restore("live", EMPTY), restored);
});

test("logout persists an empty snapshot and cannot resurrect old origin accounts", async () => {
  const f = fixture();
  await f.storage.restore("live", EMPTY);
  await f.storage.save("live", EMPTY);
  assert.deepEqual(await f.storage.restore("live", snapshot([A])), EMPTY);
  assert.equal(f.legacyReads(), 1);
});

test("empty profiles and logout do not require keychain access", async () => {
  const f = fixture(EMPTY);
  const storage = new DesktopProfileStorage({
    ...f.deps,
    encrypt: () => assert.fail("Empty state has no credentials to encrypt"),
    decrypt: () => assert.fail("Empty state has no credentials to decrypt"),
  });
  assert.deepEqual(await storage.restore("live", EMPTY), EMPTY);
  await storage.save("live", EMPTY);
  assert.deepEqual(await storage.restore("live", snapshot([A])), EMPTY);
});

test("migration retains current profiles when both origins together exceed the limit", async () => {
  const addresses = [
    A,
    B,
    ...["c", "d", "e", "f"].map((digit) => `0x${digit.repeat(40)}`),
  ];
  const f = fixture(snapshot(addresses.slice(1)));
  addresses.forEach((address) => f.sessions.add(address));
  const restored = await f.storage.restore("live", snapshot([A]));
  assert.equal(restored.accounts.length, 5);
  assert.equal(restored.accounts[0].address, A);
  assert.equal(restored.activeAddress, A);
});

test("removed native credentials cannot be recovered from a stale profile snapshot", async () => {
  const f = fixture();
  await f.storage.restore("live", EMPTY);
  f.sessions.delete(A);
  assert.deepEqual(await f.storage.restore("live", EMPTY), EMPTY);
});

test("keeps an explicit current selection while merging legacy profiles", async () => {
  const f = fixture(snapshot([A]));
  const restored = await f.storage.restore("live", snapshot([B]));
  assert.deepEqual(
    restored.accounts.map((account) => account.address),
    [B, A],
  );
  assert.equal(restored.activeAddress, B);
  await f.storage.save("live", snapshot([A, B], A));
  assert.equal((await f.storage.restore("live", EMPTY)).activeAddress, A);
});

test("backend snapshots are isolated and a failed decrypt leaves saved state intact", async () => {
  const f = fixture(EMPTY);
  await f.storage.save("live", snapshot([A]));
  assert.deepEqual(await f.storage.restore("test", EMPTY), EMPTY);
  const before = JSON.stringify([...f.saved]);
  const broken = new DesktopProfileStorage({
    ...f.deps,
    decrypt: () => {
      throw new Error("Keychain locked");
    },
  });
  await assert.rejects(broken.restore("live", EMPTY));
  assert.equal(JSON.stringify([...f.saved]), before);
});

test("a migration failure preserves data and permits retry, and later saves keep their order", async () => {
  const f = fixture();
  let first = true;
  const storage = new DesktopProfileStorage({
    ...f.deps,
    readLegacy: async () => {
      if (first) {
        first = false;
        throw new Error("Migration unavailable");
      }
      return snapshot([A]);
    },
  });
  await assert.rejects(storage.restore("live", EMPTY));
  assert.equal(f.saved.size, 0);
  const restoration = storage.restore("live", EMPTY);
  const logout = storage.save("live", EMPTY);
  await Promise.all([restoration, logout]);
  assert.deepEqual(await storage.restore("live", EMPTY), EMPTY);
});

test("rejects corrupt account lists and strips unknown fields and refresh credentials", () => {
  assert.throws(() => snapshot([A], B));
  assert.throws(() => snapshot([A, A]));
  assert.throws(() => snapshot(["not-an-address"]));
  const state = parseDesktopProfileState({
    version: 1,
    accounts: [
      { ...profile(A), native_refresh_token: "secret", unexpected: true },
    ],
    activeAddress: A,
  });
  assert.equal(state.accounts[0].refreshToken, null);
  assert.doesNotMatch(
    JSON.stringify(state),
    /secret|must-not-migrate|unexpected/,
  );
});

test("old storage migration skips malformed entries, deduplicates and caps while preserving the active profile", () => {
  const addresses = [
    A,
    B,
    ...["c", "d", "e", "f"].map((digit) => `0x${digit.repeat(40)}`),
  ];
  const active = addresses[5];
  const state = getDesktopProfileMigrationState({
    accounts: [
      { address: "invalid" },
      ...addresses.map(profile),
      profile(A),
      { ...profile(B), jwt: "x".repeat(40_000) },
    ],
    activeAddress: active,
  });
  assert.equal(state.accounts.length, 5);
  assert.equal(state.activeAddress, active);
  assert.ok(state.accounts.some((account) => account.address === active));
  assert.equal(
    state.accounts.every((account) => account.refreshToken === null),
    true,
  );
  assert.deepEqual(
    getDesktopProfileMigrationState({ accounts: [null], activeAddress: A }),
    EMPTY,
  );
});

test("profile IPC accepts only the owned renderer main frame at its confirmed origin", () => {
  const source = ts.createSourceFile(
    "index.ts",
    fs.readFileSync(path.join(process.cwd(), "electron-src/index.ts"), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const fn = source.statements.find(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "desktopProfileBackend",
  );
  assert.ok(fn);
  const mainFrame = { url: "http://localhost:3000/waves" };
  const webContents = { mainFrame };
  const context = vm.createContext({
    mainWindow: { webContents },
    PORT: 3000,
    URL,
    getApiEndpoint: () => "fixture-backend",
    getPublicRuntimeConfig: () => ({}),
  });
  vm.runInContext(
    ts.transpileModule(fn.getText(source), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  assert.equal(
    context.desktopProfileBackend({
      sender: webContents,
      senderFrame: mainFrame,
    }),
    "fixture-backend",
  );
  assert.throws(() =>
    context.desktopProfileBackend({ sender: {}, senderFrame: mainFrame }),
  );
  assert.throws(() =>
    context.desktopProfileBackend({
      sender: webContents,
      senderFrame: { url: mainFrame.url },
    }),
  );
  mainFrame.url = "http://localhost:6529/";
  assert.throws(() =>
    context.desktopProfileBackend({
      sender: webContents,
      senderFrame: mainFrame,
    }),
  );
});
