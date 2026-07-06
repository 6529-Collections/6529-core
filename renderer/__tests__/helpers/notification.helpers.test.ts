import { ApiNotificationCause } from "@/generated/models/ApiNotificationCause";
import { generateNotificationData } from "@/helpers/notification.helpers";
import type { ApiNotification } from "@/generated/models/ApiNotification";

const createDropReactedNotification = (
  reaction: string
): ApiNotification =>
  ({
    id: 1,
    cause: ApiNotificationCause.DropReacted,
    created_at: 1,
    read_at: null,
    related_identity: {
      handle: "prxt0",
    },
    related_drops: [
      {
        serial_no: 7,
        wave: {
          id: "wave-1",
        },
        parts: [
          {
            content: "gm",
          },
        ],
      },
    ],
    additional_context: {
      reaction,
    },
  }) as ApiNotification;

const emptyEmojiResolvers = {
  findNativeEmoji: () => null,
  findCustomEmoji: () => null,
};

describe("generateNotificationData", () => {
  it("renders native reaction shortcodes as emoji glyphs", () => {
    const data = generateNotificationData(
      createDropReactedNotification(":white_check_mark:"),
      emptyEmojiResolvers
    );

    expect(data?.title).toBe("prxt0 reacted ✅");
    expect(data?.body).toBe("gm");
  });

  it("normalizes hyphenated native reaction ids before rendering glyphs", () => {
    const data = generateNotificationData(
      createDropReactedNotification("white-check-mark"),
      emptyEmojiResolvers
    );

    expect(data?.title).toBe("prxt0 reacted ✅");
  });

  it("returns custom reaction emoji images as notification icons", () => {
    const data = generateNotificationData(
      createDropReactedNotification(":sgt_wink:"),
      {
        findNativeEmoji: () => null,
        findCustomEmoji: (emojiId: string) =>
          emojiId === "sgt_wink"
            ? { skins: [{ src: "https://example.test/sgt_wink.webp" }] }
            : null,
      }
    );

    expect(data?.title).toBe("prxt0 reacted");
    expect(data?.iconUrl).toBe("https://example.test/sgt_wink.webp");
  });

  it("falls back to readable text for unknown reactions", () => {
    const data = generateNotificationData(
      createDropReactedNotification(":unknown_reaction:"),
      emptyEmojiResolvers
    );

    expect(data?.title).toBe("prxt0 reacted 'unknown reaction'");
    expect(data?.iconUrl).toBeUndefined();
  });
});
