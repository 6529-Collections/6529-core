import { ApiAttachmentKind } from "@/generated/models/ApiAttachmentKind";
import { ApiAttachmentStatus } from "@/generated/models/ApiAttachmentStatus";
import { ApiAttachmentUploadMimeType } from "@/generated/models/ApiAttachmentUploadMimeType";
import { ApiNotificationCause } from "@/generated/models/ApiNotificationCause";
import { generateNotificationData } from "@/helpers/notification.helpers";
import type { ApiNotification } from "@/generated/models/ApiNotification";

const createDropReactedNotification = (reaction: string): ApiNotification =>
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

  it("renders raw emoji character reactions as-is", () => {
    const data = generateNotificationData(
      createDropReactedNotification("✅"),
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

describe("outgoing native notification previews", () => {
  const causes = [
    ApiNotificationCause.IdentityMentioned,
    ApiNotificationCause.DropQuoted,
    ApiNotificationCause.DropVoted,
    ApiNotificationCause.DropReacted,
    ApiNotificationCause.DropBoosted,
    ApiNotificationCause.AllDrops,
  ];

  it.each(causes)(
    "formats drop content for %s without changing the source",
    (cause) => {
      const notification = createDropReactedNotification(":white_check_mark:");
      notification.cause = cause;
      notification.additional_context = {
        reaction: ":white_check_mark:",
        vote: 1,
      };
      const content =
        "# Heading\n\n**Hello** @[prxt0] :wave: [commit](https://example.com/" +
        "x".repeat(500) +
        ")";
      notification.related_drops[0].parts[0].content = content;
      const data = generateNotificationData(notification, emptyEmojiResolvers);
      expect(data?.body).toBe("Heading\nHello @prxt0 👋 commit");
      expect(data?.redirectPath).toBe("/waves?wave=wave-1&serialNo=7");
      expect(notification.related_drops[0].parts[0].content).toBe(content);
    }
  );

  it("uses the reply drop and keeps generated titles literal", () => {
    const notification = createDropReactedNotification("✅");
    notification.cause = ApiNotificationCause.DropReplied;
    notification.related_identity!.handle = "user_name";
    const original = notification.related_drops[0];
    notification.related_drops.push({
      ...original,
      serial_no: 8,
      parts: [{ ...original.parts[0], content: "> reply `code`" }],
    });
    const data = generateNotificationData(notification, emptyEmojiResolvers);
    expect(data?.title).toBe("user_name replied");
    expect(data?.body).toBe("“reply ‘code’”");
    expect(data?.redirectPath).toBe("/waves?wave=wave-1&serialNo=8");
  });

  it("uses View drop when only Markdown or media remains", () => {
    const notification = createDropReactedNotification("✅");
    notification.related_drops[0].parts[0].content =
      "![image](https://example.com/x)";
    expect(
      generateNotificationData(notification, emptyEmojiResolvers)?.body
    ).toBe("View drop");
  });
});

it("preserves attachment filenames literally in outgoing notification content", () => {
  const notification = createDropReactedNotification(":white_check_mark:");
  const part = notification.related_drops[0].parts[0];
  part.content = "![image](https://example.com/x)";
  part.attachments = [
    {
      attachment_id: "attachment-1",
      file_name: "@[draft]_:wave:.pdf",
      mime_type: ApiAttachmentUploadMimeType.ApplicationPdf,
      kind: ApiAttachmentKind.Pdf,
      status: ApiAttachmentStatus.Ready,
    },
  ];
  const data = generateNotificationData(notification, emptyEmojiResolvers);
  expect(data?.body).toBe("@[draft]_:wave:.pdf");
  expect(data?.title).toBe("prxt0 reacted ✅");
});

it("sends later readable content instead of an earlier part's attachment fallback", () => {
  const notification = createDropReactedNotification("✅");
  const part = notification.related_drops[0].parts[0];
  part.content = "![image](https://example.com/x)";
  notification.related_drops[0].parts.push({
    ...part,
    content: "**Hi** @[prxt0] :wave:",
  });
  expect(
    generateNotificationData(notification, emptyEmojiResolvers)?.body
  ).toBe("Hi @prxt0 👋");
});
