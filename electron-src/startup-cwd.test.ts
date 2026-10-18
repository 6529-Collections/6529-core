import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { appWorkingDirectory } from "./startup-cwd";

describe("startup working folder", () => {
  it("is the executable's folder for a packaged app", () => {
    const exe = path.join(path.sep, "Program Files", "6529 Desktop", "6529 Desktop.exe");
    assert.equal(appWorkingDirectory(true, exe), path.dirname(exe));
  });

  it("is left alone in development", () => {
    assert.equal(appWorkingDirectory(false, "/usr/bin/electron"), null);
  });
});
