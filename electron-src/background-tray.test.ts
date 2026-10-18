import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { backgroundTrayMenu } from "./background-tray";

describe("background tray menu", () => {
  it("offers to open the app or quit it", () => {
    const calls: string[] = [];
    const menu = backgroundTrayMenu({
      open: () => calls.push("open"),
      quit: () => calls.push("quit"),
    });
    assert.deepEqual(
      menu.map((item) => ("label" in item ? item.label : item.type)),
      ["Open 6529 Desktop", "separator", "Quit 6529 Desktop"],
    );
    for (const item of menu) {
      if ("click" in item) item.click?.();
    }
    assert.deepEqual(calls, ["open", "quit"]);
  });
});
