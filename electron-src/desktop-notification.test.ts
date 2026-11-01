import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getDesktopNotificationOptions,
  getNotificationNavigatePayload,
  getNotificationRedirectPath,
} from "./desktop-notification";

describe("desktop notifications", () => {
  it("shows a content-free encrypted-message notice without an icon", () => {
    assert.deepEqual(
      getDesktopNotificationOptions({
        title: "6529",
        body: "New encrypted message",
        icon: "",
      }),
      { title: "6529", body: "New encrypted message" },
    );
  });

  it("keeps the picture of other notifications", () => {
    assert.deepEqual(
      getDesktopNotificationOptions({
        title: "punk6529",
        body: "replied",
        icon: "https://example.com/pfp.png",
      }),
      { title: "punk6529", body: "replied", icon: "https://example.com/pfp.png" },
    );
  });

  it("opens the encrypted chat a notice points to", () => {
    const group = "c2d6b3c4-1f9e-4a5b-9b7e-3f1d2a0e8c11";
    assert.deepEqual(
      getNotificationNavigatePayload(`/messages/encrypted/${group}`, {
        targetAddress: "0xabc",
        targetProfileId: "profile-1",
        targetProfileHandle: "alice",
      }),
      {
        path: `/messages/encrypted/${group}`,
        targetAddress: "0xabc",
        targetProfileId: "profile-1",
        targetProfileHandle: "alice",
      },
    );
  });

  it("falls back to notifications for a missing or foreign path", () => {
    for (const value of [
      "",
      "   ",
      undefined,
      42,
      "https://example.com/phish",
      "//example.com/phish",
      "/\\example.com",
      "javascript:alert(1)",
    ]) {
      assert.equal(getNotificationRedirectPath(value), "/notifications", String(value));
    }
    assert.equal(getNotificationRedirectPath("/waves?wave=1"), "/waves?wave=1");
  });

  it("sends null targets when the notice has no profile", () => {
    assert.deepEqual(getNotificationNavigatePayload("/notifications"), {
      path: "/notifications",
      targetAddress: null,
      targetProfileId: null,
      targetProfileHandle: null,
    });
  });
});
