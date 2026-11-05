import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const A = `0x${"a".repeat(40)}`;
const B = `0x${"b".repeat(40)}`;
const source = ts.createSourceFile(
  "auth.utils.ts",
  fs.readFileSync(
    path.join(process.cwd(), "renderer/services/auth/auth.utils.ts"),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
);
const declaration = source.statements
  .flatMap((statement) =>
    ts.isVariableStatement(statement)
      ? [...statement.declarationList.declarations]
      : [],
  )
  .find((node) => node.name.getText(source) === "restoreDesktopProfileState");
assert.ok(declaration?.initializer);
const compiled = ts.transpileModule(
  `globalThis.restore = ${declaration.initializer.getText(source)};`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function restore(
  accounts: object[],
  local: object[] = [],
  legacy: { address: string; token: string } | null = null,
) {
  let saved: any[] | undefined;
  const context = vm.createContext({
    readAccountsFromStorage: () => local,
    safeLocalStorage: {
      getItem: (key: string) =>
        key === "address" ? (legacy?.address ?? null) : (legacy?.token ?? null),
    },
    WALLET_ADDRESS_STORAGE_KEY: "address",
    WALLET_REFRESH_TOKEN_STORAGE_KEY: "token",
    normalizeAddress: (address: string) => address.toLowerCase(),
    persistAccountsWithActive: (value: any[]) => {
      saved = value;
    },
  });
  vm.runInContext(compiled, context);
  context.restore({ version: 1, accounts, activeAddress: A });
  assert.ok(saved);
  return saved;
}

test("profile restoration preserves an existing same-origin legacy token matched by address", () => {
  const [account] = restore(
    [{ address: A, authSessionVersion: null, refreshToken: null }],
    [
      {
        address: A.toUpperCase(),
        refreshToken: "existing-legacy",
        authSessionVersion: null,
      },
    ],
  );
  assert.equal(account.refreshToken, "existing-legacy");
  const [legacy] = restore(
    [{ address: A, authSessionVersion: null, refreshToken: null }],
    [],
    { address: A, token: "separate-legacy" },
  );
  assert.equal(legacy.refreshToken, "separate-legacy");
});

test("profile restoration never copies unmatched tokens or tokens into native v2 profiles", () => {
  const [unmatched] = restore(
    [{ address: A, authSessionVersion: null, refreshToken: null }],
    [{ address: B, refreshToken: "other-profile" }],
    { address: B, token: "other-legacy" },
  );
  assert.equal(unmatched.refreshToken, null);
  const [native] = restore(
    [{ address: A, authSessionVersion: "v2", refreshToken: null }],
    [{ address: A, refreshToken: "must-not-copy" }],
    { address: A, token: "must-not-copy-either" },
  );
  assert.equal(native.refreshToken, null);
  const [otherOrigin] = restore([
    { address: A, authSessionVersion: null, refreshToken: null },
  ]);
  assert.equal(otherOrigin.refreshToken, null);
});

test("an authoritative logged-out snapshot never restores locally present accounts", () => {
  assert.equal(
    restore([], [{ address: A, refreshToken: "old-token" }], {
      address: A,
      token: "old-token",
    }).length,
    0,
  );
});
