import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APP_CLOSE_DIALOG_OPTIONS, getAppCloseAction } from "./app-close";

describe("desktop app close confirmation", () => {
  it("defaults Enter to Quit while keeping keyboard cancellation safe", () => {
    assert.equal(APP_CLOSE_DIALOG_OPTIONS.defaultId, 0);
    assert.equal(APP_CLOSE_DIALOG_OPTIONS.buttons?.[0], "Quit");
    assert.equal(APP_CLOSE_DIALOG_OPTIONS.cancelId, 2);
    assert.equal(APP_CLOSE_DIALOG_OPTIONS.buttons?.[2], "Cancel");
  });

  it("maps every message-box response to a safe close action", () => {
    assert.equal(getAppCloseAction(0), "quit");
    assert.equal(getAppCloseAction(1), "run-background");
    assert.equal(getAppCloseAction(2), "cancel");
    assert.equal(getAppCloseAction(-1), "cancel");
  });
});
