import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { LocalIpfsPreferences } from "./ipfs-preferences";

test("local IPFS defaults on unless an explicit false was saved", () => {
  for (const value of [undefined, null, true, "false", 0, {}]) {
    let writes = 0;
    const preferences = new LocalIpfsPreferences(value, () => {
      writes++;
    });
    assert.deepEqual(preferences.getSnapshot(), {
      enabled: true,
      enabledAtStartup: true,
      restartRequired: false,
    });
    assert.equal(writes, 0, "reading preferences does not write anything");
  }
});

test("preference changes apply only to a new session and can be cancelled", () => {
  let saved: unknown;
  const preferences = new LocalIpfsPreferences(saved, (value) => {
    saved = value;
  });
  assert.deepEqual(preferences.setEnabled(false), {
    enabled: false,
    enabledAtStartup: true,
    restartRequired: true,
  });
  assert.equal(saved, false);
  assert.equal(preferences.enabledAtStartup, true);
  assert.equal(preferences.setEnabled(true).restartRequired, false);
  preferences.setEnabled(false);
  const nextSession = new LocalIpfsPreferences(saved, (value) => {
    saved = value;
  });
  assert.deepEqual(nextSession.getSnapshot(), {
    enabled: false,
    enabledAtStartup: false,
    restartRequired: false,
  });
  assert.deepEqual(nextSession.setEnabled(true), {
    enabled: true,
    enabledAtStartup: false,
    restartRequired: true,
  });
  assert.equal(nextSession.enabledAtStartup, false);
  const enabledSession = new LocalIpfsPreferences(saved, () => undefined);
  assert.equal(enabledSession.enabledAtStartup, true);
});

test("invalid requests and persistence failures do not change the snapshot", () => {
  let writes = 0;
  const preferences = new LocalIpfsPreferences(undefined, () => {
    writes++;
  });
  for (const invalid of ["false", null, undefined, 0, 1, {}]) {
    assert.throws(() => preferences.setEnabled(invalid), /must be a boolean/);
  }
  assert.equal(writes, 0);
  const failed = new LocalIpfsPreferences(true, () => {
    throw new Error("disk full");
  });
  assert.throws(() => failed.setEnabled(false), /disk full/);
  assert.deepEqual(failed.getSnapshot(), {
    enabled: true,
    enabledAtStartup: true,
    restartRequired: false,
  });
});

test("the real preferences IPC handlers only persist the next-launch choice", () => {
  const source = ts.createSourceFile(
    "index.ts",
    fs.readFileSync(path.join(process.cwd(), "electron-src/index.ts"), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const channels = ["get-local-ipfs-preferences", "set-local-ipfs-enabled"];
  const registrations = source.statements.filter((node) => {
    if (
      !ts.isExpressionStatement(node) ||
      !ts.isCallExpression(node.expression)
    )
      return false;
    const channel = node.expression.arguments[0];
    return (
      node.expression.expression.getText(source) === "ipcMain.handle" &&
      channel &&
      ts.isStringLiteral(channel) &&
      channels.includes(channel.text)
    );
  });
  assert.equal(registrations.length, 2);
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const writes: boolean[] = [];
  const preferences = new LocalIpfsPreferences(true, (value) =>
    writes.push(value),
  );
  vm.runInNewContext(
    ts.transpileModule(
      registrations.map((node) => node.getText(source)).join("\n"),
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    {
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
          handlers.set(channel, handler),
      },
      localIpfsPreferences: preferences,
      IPFS_SERVER: new Proxy(
        {},
        {
          get() {
            throw new Error("IPC must not control the live node");
          },
        },
      ),
    },
  );
  const set = handlers.get(channels[1]);
  const get = handlers.get(channels[0]);
  assert.ok(set);
  assert.ok(get);
  set({}, false);
  assert.deepEqual(writes, [false]);
  assert.deepEqual(get(), {
    enabled: false,
    enabledAtStartup: true,
    restartRequired: true,
  });
  assert.throws(() => set({}, "false"), /must be a boolean/);
  assert.deepEqual(writes, [false]);
});

test("settings announce action feedback without repeating session copy or guessing checkbox state", () => {
  const source = ts.createSourceFile(
    "LocalIpfsSettings.tsx",
    fs.readFileSync(
      path.join(
        process.cwd(),
        "renderer/components/core/app-info/LocalIpfsSettings.tsx",
      ),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const liveRegions: ts.JsxElement[] = [];
  let checkbox: ts.JsxSelfClosingElement | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.attributes.properties.some(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(source) === "role" &&
          attribute.initializer &&
          ts.isStringLiteral(attribute.initializer) &&
          attribute.initializer.text === "status",
      )
    )
      liveRegions.push(node);
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(source) === "input"
    )
      checkbox = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(liveRegions.length, 1);
  const live = liveRegions[0].getText(source);
  assert.match(live, /aria-live="polite"/);
  assert.match(live, /aria-atomic="true"/);
  assert.match(live, /desktop\.localIpfs\.restartRequired/);
  assert.doesNotMatch(live, /sessionEnabled|sessionDisabled/);
  assert.ok(checkbox);
  assert.match(checkbox.getText(source), /checked=\{preferences.enabled\}/);
  assert.match(source.text, /\{preferences && \(/);
  assert.match(checkbox.getText(source), /aria-disabled=\{saving\}/);
  assert.doesNotMatch(
    checkbox.getText(source),
    /\sdisabled=/,
    "saving must not remove keyboard focus",
  );
});
