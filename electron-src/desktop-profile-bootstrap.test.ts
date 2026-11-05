import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function fixture(
  restoreProfiles: () => Promise<unknown>,
  save?: (state: unknown) => Promise<void>,
) {
  const saved: unknown[] = [];
  const context = vm.createContext({
    exports: {},
    window: {
      nativeAuth: {
        restoreProfiles,
        saveProfiles: async (state: unknown) => {
          saved.push(state);
          await save?.(state);
        },
      },
    },
    console: { error: () => undefined },
  });
  const source = fs.readFileSync(
    path.join(
      process.cwd(),
      "renderer/services/auth/desktop-profile-storage.ts",
    ),
    "utf8",
  );
  vm.runInContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    context,
  );
  return { api: context.exports, saved };
}

test("bootstrap restores before enabling persistence and shares one initialization", async () => {
  const state = { version: 1, accounts: [], activeAddress: null };
  let resolve!: (state: unknown) => void;
  let reads = 0;
  const f = fixture(() => {
    reads++;
    return new Promise((done) => {
      resolve = done;
    });
  });
  const restored: unknown[] = [];
  const first = f.api.initializeDesktopProfiles(state, (value: unknown) => {
    restored.push(value);
    f.api.persistDesktopProfiles(value);
  });
  const second = f.api.initializeDesktopProfiles(state, () =>
    assert.fail("Already initializing"),
  );
  assert.equal(first, second);
  assert.equal(reads, 1);
  assert.equal(restored.length, 0);
  resolve(state);
  await first;
  assert.deepEqual(restored, [state]);
  assert.deepEqual(f.saved, []);
  f.api.persistDesktopProfiles(state);
  await new Promise<void>((done) => setImmediate(done));
  assert.deepEqual(f.saved, [state]);
});

test("bootstrap failures do not write an empty account list and can be retried", async () => {
  const state = { version: 1, accounts: [], activeAddress: null };
  let reads = 0;
  const f = fixture(async () => {
    if (++reads === 1) throw new Error("Locked");
    return state;
  });
  await assert.rejects(
    f.api.initializeDesktopProfiles(state, () => assert.fail("Failed restore")),
  );
  assert.deepEqual(f.saved, []);
  await f.api.initializeDesktopProfiles(state, () => undefined);
  assert.equal(reads, 2);
});

test("failed profile saves retain their snapshot and expose an explicit retry", async () => {
  const state = { version: 1, accounts: [], activeAddress: null };
  let fail = true;
  const f = fixture(
    async () => state,
    async () => {
      if (fail) throw new Error("Locked");
    },
  );
  await f.api.initializeDesktopProfiles(state, () => undefined);
  const statuses: string[] = [];
  const unsubscribe = f.api.subscribeDesktopProfileSaveStatus(() =>
    statuses.push(f.api.getDesktopProfileSaveStatus()),
  );
  f.api.persistDesktopProfiles(state);
  await new Promise<void>((done) => setImmediate(done));
  assert.equal(f.api.getDesktopProfileSaveStatus(), "failed");
  fail = false;
  await f.api.retryDesktopProfileSave();
  assert.deepEqual(f.saved, [state, state]);
  assert.deepEqual(statuses, ["failed", "retrying", "idle"]);
  unsubscribe();
  await f.api.retryDesktopProfileSave();
  assert.equal(f.saved.length, 2);
});

test("retry after an in-flight failure saves the latest logout rather than replaying older credentials", async () => {
  const prior = {
    version: 1,
    accounts: [{ address: "fixture-profile" }],
    activeAddress: "fixture-profile",
  };
  const logout = { version: 1, accounts: [], activeAddress: null };
  let reject!: (error: Error) => void;
  let attempts = 0;
  const f = fixture(
    async () => prior,
    () =>
      ++attempts === 1
        ? new Promise((_resolve, failure) => {
            reject = failure;
          })
        : Promise.resolve(),
  );
  await f.api.initializeDesktopProfiles(prior, () => undefined);
  f.api.persistDesktopProfiles(prior);
  await new Promise<void>((done) => setImmediate(done));
  f.api.persistDesktopProfiles(logout);
  reject(new Error("Storage failed"));
  await new Promise<void>((done) => setImmediate(done));
  assert.equal(f.api.getDesktopProfileSaveStatus(), "failed");
  await f.api.retryDesktopProfileSave();
  assert.deepEqual(f.saved, [prior, logout]);
});

test("successful saves drain newer profile mutations serially", async () => {
  const first = { version: 1, accounts: [], activeAddress: null };
  const latest = { ...first, activeAddress: "fixture-selection" };
  let finish!: () => void;
  let attempts = 0;
  const f = fixture(
    async () => first,
    () =>
      ++attempts === 1
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(),
  );
  await f.api.initializeDesktopProfiles(first, () => undefined);
  f.api.persistDesktopProfiles(first);
  await new Promise<void>((done) => setImmediate(done));
  f.api.persistDesktopProfiles(latest);
  assert.deepEqual(f.saved, [first]);
  finish();
  await f.api.retryDesktopProfileSave();
  assert.deepEqual(f.saved, [first, latest]);
  assert.equal(f.api.getDesktopProfileSaveStatus(), "idle");
});

test("automatic persistence drains a newer snapshot without an explicit retry", async () => {
  const first = { version: 1, accounts: [], activeAddress: null };
  const latest = { ...first, activeAddress: "fixture-new-selection" };
  let finishFirst!: () => void;
  let finishLatest!: () => void;
  let latestStarted!: () => void;
  const latestStart = new Promise<void>((resolve) => {
    latestStarted = resolve;
  });
  let active = 0;
  let maxActive = 0;
  const f = fixture(
    async () => first,
    async (state) => {
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        if (state === first)
          await new Promise<void>((resolve) => {
            finishFirst = resolve;
          });
        else {
          latestStarted();
          await new Promise<void>((resolve) => {
            finishLatest = resolve;
          });
        }
      } finally {
        active--;
      }
    },
  );
  await f.api.initializeDesktopProfiles(first, () => undefined);
  f.api.persistDesktopProfiles(first);
  await new Promise<void>((done) => setImmediate(done));
  f.api.persistDesktopProfiles(latest);
  assert.deepEqual(f.saved, [first]);
  finishFirst();
  await latestStart;
  assert.deepEqual(f.saved, [first, latest]);
  assert.equal(maxActive, 1);
  finishLatest();
  await new Promise<void>((done) => setImmediate(done));
  assert.deepEqual(f.saved, [first, latest]);
  assert.equal(active, 0);
  assert.equal(f.api.getDesktopProfileSaveStatus(), "idle");
});

test("finally automatically drains a snapshot queued by success notification exactly once", async () => {
  const failed = {
    version: 1,
    accounts: [],
    activeAddress: "failed-selection",
  };
  const retry = { ...failed, activeAddress: "retry-selection" };
  const latest = { ...failed, activeAddress: "final-selection" };
  let finalStarted!: () => void;
  let finishFinal!: () => void;
  const finalStart = new Promise<void>((resolve) => {
    finalStarted = resolve;
  });
  let active = 0;
  let maxActive = 0;
  const f = fixture(
    async () => failed,
    async (state) => {
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        if (state === failed) throw new Error("Initial failure");
        if (state === latest) {
          finalStarted();
          await new Promise<void>((resolve) => {
            finishFinal = resolve;
          });
        }
      } finally {
        active--;
      }
    },
  );
  await f.api.initializeDesktopProfiles(failed, () => undefined);
  f.api.persistDesktopProfiles(failed);
  await new Promise<void>((done) => setImmediate(done));
  assert.equal(f.api.getDesktopProfileSaveStatus(), "failed");
  const unsubscribe = f.api.subscribeDesktopProfileSaveStatus(() => {
    if (f.api.getDesktopProfileSaveStatus() === "idle") {
      unsubscribe();
      // The save loop has finished but its promise has not reached finally.
      f.api.persistDesktopProfiles(latest);
    }
  });
  f.api.persistDesktopProfiles(retry);
  await finalStart;
  assert.deepEqual(f.saved, [failed, retry, latest]);
  assert.equal(maxActive, 1);
  finishFinal();
  await new Promise<void>((done) => setImmediate(done));
  assert.deepEqual(f.saved, [failed, retry, latest]);
  assert.equal(active, 0);
  assert.equal(f.api.getDesktopProfileSaveStatus(), "idle");
});
