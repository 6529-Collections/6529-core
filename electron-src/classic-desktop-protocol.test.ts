import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import classicDesktop from "../config/classic-desktop.json";
import { registerClassicDesktopProtocol } from "./classic-desktop-protocol";

function protocolClient(
  owned: string[],
  { isPackaged = true, canRegister = true } = {},
) {
  const defaults = new Set(owned);
  const changes: string[] = [];
  const app: Parameters<typeof registerClassicDesktopProtocol>[0] = {
    isPackaged,
    isDefaultProtocolClient: (scheme) => defaults.has(scheme),
    setAsDefaultProtocolClient: (scheme) => {
      changes.push(`register ${scheme}`);
      if (canRegister) defaults.add(scheme);
      return canRegister;
    },
    removeAsDefaultProtocolClient: (scheme) => {
      changes.push(`remove ${scheme}`);
      return defaults.delete(scheme);
    },
  };
  return { app, changes, defaults };
}

test("registers a Classic scheme before releasing the owned legacy scheme", () => {
  for (const platform of ["darwin", "win32"] as const) {
    const { app, changes, defaults } = protocolClient(["core6529"]);
    assert.equal(
      registerClassicDesktopProtocol(app, "classiccore6529", platform),
      true,
    );
    assert.deepEqual(changes, ["register classiccore6529", "remove core6529"]);
    assert.deepEqual([...defaults], ["classiccore6529"]);
    assert.equal(
      registerClassicDesktopProtocol(app, "classiccore6529", platform),
      true,
    );
    assert.equal(changes.length, 2);
  }
});

test("releases only the matching legacy scheme when the app still owns it", () => {
  const { app, changes, defaults } = protocolClient([
    "stagingcore6529",
    "localcore6529",
  ]);
  assert.equal(
    registerClassicDesktopProtocol(app, "classiccore6529", "darwin"),
    true,
  );
  assert.deepEqual(changes, ["register classiccore6529"]);
  assert.equal(
    registerClassicDesktopProtocol(app, "stagingclassiccore6529", "darwin"),
    true,
  );
  assert.deepEqual(changes, [
    "register classiccore6529",
    "register stagingclassiccore6529",
    "remove stagingcore6529",
  ]);
  assert.ok(defaults.has("localcore6529"));
  assert.equal(
    registerClassicDesktopProtocol(app, "core6529", "darwin"),
    false,
  );
  assert.equal(changes.length, 3);
});

test("keeps the legacy scheme if new registration fails or cleanup is unsupported", () => {
  const failed = protocolClient(["core6529"], { canRegister: false });
  assert.equal(
    registerClassicDesktopProtocol(failed.app, "classiccore6529", "win32"),
    false,
  );
  assert.deepEqual(failed.changes, ["register classiccore6529"]);
  assert.ok(failed.defaults.has("core6529"));

  const unpackaged = protocolClient(["core6529"], { isPackaged: false });
  assert.equal(
    registerClassicDesktopProtocol(unpackaged.app, "classiccore6529", "darwin"),
    true,
  );
  assert.deepEqual(unpackaged.changes, ["register classiccore6529"]);

  const linux = protocolClient(["core6529"]);
  assert.equal(
    registerClassicDesktopProtocol(linux.app, "classiccore6529", "linux"),
    true,
  );
  assert.deepEqual(linux.changes, ["register classiccore6529"]);
});

test("all packaged builds declare their Classic name and scheme under their existing app ID", () => {
  for (const [target, environment, name, appId] of [
    ["production", "production", "6529 Desktop Classic", "com.6529.6529core"],
    [
      "production-mac-arm64",
      "production",
      "6529 Desktop Classic",
      "com.6529.6529core",
    ],
    [
      "production-mac-x64",
      "production",
      "6529 Desktop Classic",
      "com.6529.6529core",
    ],
    [
      "staging",
      "staging",
      "6529 Desktop Classic Staging",
      "com.6529.6529stagingcore",
    ],
    ["local", "local", "6529 Desktop Classic Local", "com.6529.6529localcore"],
  ] as const) {
    const config = JSON.parse(
      readFileSync(`electron-builder.${target}.json`, "utf8"),
    );
    const scheme = classicDesktop.schemes[environment];
    assert.equal(config.productName, name);
    assert.equal(config.appId, appId);
    assert.deepEqual(
      config.protocols.flatMap(
        (protocol: { schemes: string[] }) => protocol.schemes,
      ),
      [scheme],
    );
    assert.deepEqual(
      config.mac.extendInfo.CFBundleURLTypes.flatMap(
        (type: { CFBundleURLSchemes: string[] }) => type.CFBundleURLSchemes,
      ),
      [scheme],
    );
    if (config.win) {
      assert.equal(config.win.executableName, name.replace(" Classic", ""));
      assert.equal(config.nsis.shortcutName, name);
    }
  }
});
