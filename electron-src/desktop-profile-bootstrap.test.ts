import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function fixture(restoreProfiles: () => Promise<unknown>) {
  const saved: unknown[] = [];
  const context = vm.createContext({
    exports: {},
    window: {
      nativeAuth: {
        restoreProfiles,
        saveProfiles: async (state: unknown) => {
          saved.push(state);
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
