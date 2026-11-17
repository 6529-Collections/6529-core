import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { classicMacBundleMove } from "./classic-mac-bundle";

for (const [environment, suffix] of [["production", ""], ["staging", " Staging"]]) {
  test(`${environment} moves only the packaged app at the legacy Mac path`, () => {
    const legacyName = `6529 Desktop${suffix}`;
    const root = path.resolve("Applications");
    const source = path.join(root, `${legacyName}.app`);
    const destination = path.join(root, `6529 Desktop Classic${suffix}.app`);
    const executable = (bundle: string) => path.join(bundle, "Contents", "MacOS", legacyName);

    assert.deepEqual(classicMacBundleMove(environment, executable(source)), {
      source,
      destination,
      helper: path.join(source, "Contents", "Helpers", "classic-bundle-move"),
    });
    assert.equal(classicMacBundleMove(environment, executable(destination)), undefined);
    assert.equal(classicMacBundleMove(environment, executable(path.join(root, "Personal Copy.app"))), undefined);
    assert.equal(classicMacBundleMove("local", executable(source)), undefined);
  });
}
