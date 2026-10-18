import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pinnedWindowNavigation, shouldOpenInExternalBrowser } from "./navigation-policy";

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

describe("IPFS window navigation", () => {
  const webui = "http://127.0.0.1:9256";

  it("keeps the WebUI on the daemon's own origin", () => {
    assert.equal(pinnedWindowNavigation(webui, "http://127.0.0.1:9256/webui#/files"), "stay");
  });

  it("opens gateway files and other sites in the system browser", () => {
    assert.equal(pinnedWindowNavigation(webui, "http://127.0.0.1:9255/ipfs/bafy"), "external");
    assert.equal(pinnedWindowNavigation(webui, "https://docs.ipfs.tech/"), "external");
  });

  it("drops other schemes and malformed addresses", () => {
    assert.equal(pinnedWindowNavigation(webui, "file:///C:/Windows/win.ini"), "block");
    assert.equal(pinnedWindowNavigation(webui, "stagingcore6529://navigate/waves"), "block");
    assert.equal(pinnedWindowNavigation(webui, "not a url"), "block");
  });
});
