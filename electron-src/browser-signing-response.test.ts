import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const source = ts.createSourceFile(
  "BrowserConnectorProvider.tsx",
  fs.readFileSync(
    path.join(
      process.cwd(),
      "renderer/components/browser-connector/BrowserConnectorProvider.tsx",
    ),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const declarations: string[] = [];
const visit = (node: ts.Node) => {
  if (
    ts.isFunctionDeclaration(node) &&
    node.name?.text === "startRedirectCountdown"
  ) {
    declarations.push(node.getText(source));
  }
  ts.forEachChild(node, visit);
};
visit(source);
assert.equal(declarations.length, 1);
const code = ts.transpileModule(declarations[0], {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

test("cancelling a browser wallet request prevents a late signature from being returned", () => {
  const outgoing: unknown[] = [];
  const timers: Array<() => void> = [];
  const context = vm.createContext({
    responseStartedRef: { current: false },
    setInterval: () => 1,
    clearInterval: () => undefined,
    setTimeout: (callback: () => void) => timers.push(callback),
    openApp: (data: unknown) => outgoing.push(data),
  });
  vm.runInContext(code, context);
  const cancelled = { error: "Cancelled" };
  assert.equal(context.startRedirectCountdown(cancelled), true);
  assert.equal(context.startRedirectCountdown("late-wallet-signature"), false);
  assert.equal(timers.length, 1);
  timers[0]();
  assert.deepEqual(outgoing, [cancelled]);
});
