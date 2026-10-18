import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appWorkingDirectory } from "./startup-cwd";

describe("startup working folder", () => {
  it("is the executable's folder for a packaged Windows app", () => {
    assert.equal(
      appWorkingDirectory(true, "win32", "C:\\Program Files\\6529 Desktop\\6529 Desktop.exe"),
      "C:\\Program Files\\6529 Desktop",
    );
  });

  it("is left alone on macOS and Linux", () => {
    assert.equal(appWorkingDirectory(true, "darwin", "/Applications/6529 Desktop.app/Contents/MacOS/6529 Desktop"), null);
    assert.equal(appWorkingDirectory(true, "linux", "/opt/6529 Desktop/6529-desktop"), null);
  });

  it("is left alone in development", () => {
    assert.equal(appWorkingDirectory(false, "win32", "C:\\dev\\node_modules\\electron\\dist\\electron.exe"), null);
  });
});
