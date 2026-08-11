import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldOpenInExternalBrowser } from "./navigation-policy";

describe("desktop navigation policy", () => {
  it("opens external web origins in the system browser", () => {
    assert.equal(
      shouldOpenInExternalBrowser(
        "http://localhost:6529/waves",
        "https://x.com/intent/post",
      ),
      true,
    );
    assert.equal(
      shouldOpenInExternalBrowser(
        "http://localhost:6529/waves",
        "https://farcaster.xyz/~/compose",
      ),
      true,
    );
    assert.equal(
      shouldOpenInExternalBrowser("", "https://x.com/intent/post"),
      true,
    );
  });

  it("keeps same-origin renderer navigation internal", () => {
    assert.equal(
      shouldOpenInExternalBrowser(
        "http://localhost:6529/waves",
        "http://localhost:6529/the-memes?sort=desc",
      ),
      false,
    );
  });

  it("does not pass custom or malformed protocols to the system browser", () => {
    assert.equal(
      shouldOpenInExternalBrowser(
        "http://localhost:6529/waves",
        "localcore6529://navigate/the-memes",
      ),
      false,
    );
    assert.equal(
      shouldOpenInExternalBrowser("http://localhost:6529/waves", "not a url"),
      false,
    );
  });
});
