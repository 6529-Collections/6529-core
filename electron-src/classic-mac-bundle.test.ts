import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { classicMacBundleMove } from "./classic-mac-bundle";

for (const [environment, suffix] of [
  ["production", ""],
  ["staging", " Staging"],
]) {
  test(`${environment} moves only the packaged app at the legacy Mac path`, () => {
    const legacyName = `6529 Desktop${suffix}`;
    const root = path.resolve("Applications");
    const source = path.join(root, `${legacyName}.app`);
    const destination = path.join(root, `6529 Desktop Classic${suffix}.app`);
    const executable = (bundle: string) =>
      path.join(bundle, "Contents", "MacOS", legacyName);

    assert.deepEqual(classicMacBundleMove(environment, executable(source)), {
      source,
      destination,
      helper: path.join(source, "Contents", "Helpers", "classic-bundle-move"),
    });
    assert.equal(
      classicMacBundleMove(environment, executable(destination)),
      undefined,
    );
    assert.equal(
      classicMacBundleMove(
        environment,
        executable(path.join(root, "Personal Copy.app")),
      ),
      undefined,
    );
    assert.equal(classicMacBundleMove("local", executable(source)), undefined);
  });
}

for (const linkDuringWrite of [false, true]) {
  test(`the Mac startup move ${linkDuringWrite ? "preserves a link arriving during handoff" : "exits after a link-free handoff"}`, async () => {
    const source = ts.createSourceFile(
      "index.ts",
      fs.readFileSync("electron-src/index.ts", "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    let moveStatement: ts.IfStatement | undefined;
    const visit = (node: ts.Node) => {
      if (
        ts.isIfStatement(node) &&
        node.expression.getText(source) ===
          "isMac() && app.isPackaged && !pendingDeepLinks.hasPending"
      ) {
        moveStatement = node;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    assert.ok(moveStatement);
    let finishWrite!: () => void;
    const write = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    const pendingDeepLinks = { hasPending: false };
    let exited = false;
    let authorized = false;
    const context = vm.createContext({
      isMac: () => true,
      app: {
        isPackaged: true,
        exit: () => {
          exited = true;
        },
      },
      getEnvironment: () => "staging",
      pendingDeepLinks,
      startClassicMacBundleMove: async () => async (shouldMove: boolean) => {
        authorized = shouldMove;
        await write;
      },
      Logger: { warn: () => assert.fail("unexpected move error") },
    });
    const code = ts.transpileModule(
      `(async () => { ${moveStatement.getText(source)} })()`,
      {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      },
    ).outputText;
    const completion = vm.runInContext(code, context);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(authorized, true);
    pendingDeepLinks.hasPending = linkDuringWrite;
    finishWrite();
    await completion;
    assert.equal(exited, !linkDuringWrite);
  });
}
