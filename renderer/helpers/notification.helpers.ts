import { getUserPageTabByRoute } from "@/components/user/layout/userTabs.config";
import { ApiNotification } from "@/generated/models/ApiNotification";
import { ApiNotificationCause } from "@/generated/models/ApiNotificationCause";
import { emojify } from "./emoji.helpers";
import { formatNumberWithCommas } from "./Helpers";

function getProfileRedirect(handle: string, subroute?: string): string {
  if (!subroute) return `/${handle}`;
  const validTab = getUserPageTabByRoute(subroute);
  if (!validTab) return `/${handle}`;
  return `/${handle}/${validTab.route}`;
}

interface NotificationData {
  title: string;
  body: string;
  redirectPath: string;
  iconUrl?: string | null;
}

type FindNativeEmoji = (
  emojiId: string
) => { skins: { native: string }[] } | null;

type FindCustomEmoji = (
  emojiId: string
) => { skins: { src: string }[] } | null;

interface EmojiResolvers {
  findNativeEmoji: FindNativeEmoji;
  findCustomEmoji?: FindCustomEmoji;
}

interface ReactionPresentation {
  text: string;
  iconUrl?: string | null;
}

const nativeEmojiPattern =
  /[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]/u;

const getReactionEmojiIdCandidates = (reaction: string): string[] => {
  const rawId = reaction.trim().replaceAll(":", "");
  const underscoreId = rawId.replaceAll("-", "_").replaceAll(" ", "_");
  const hyphenId = rawId.replaceAll("_", "-").replaceAll(" ", "-");

  return [...new Set([rawId, underscoreId, hyphenId].filter(Boolean))];
};

export function generateNotificationData(
  notification: ApiNotification,
  emojiResolvers: EmojiResolvers,
  connectedProfileHandle?: string | null
): NotificationData | null {
  const handle = notification.related_identity?.handle ?? "Someone";
  const cause = notification.cause;
  const { findNativeEmoji, findCustomEmoji } = emojiResolvers;

  const getReactionPresentation = (
    reaction: string
  ): ReactionPresentation => {
    const trimmedReaction = reaction.trim();
    if (nativeEmojiPattern.test(trimmedReaction)) {
      return { text: trimmedReaction };
    }

    for (const emojiId of getReactionEmojiIdCandidates(trimmedReaction)) {
      const nativeEmoji = findNativeEmoji(emojiId);
      const native = nativeEmoji?.skins[0]?.native;
      if (native) {
        return { text: native };
      }

      const emojified = emojify(`:${emojiId}:`);
      if (emojified !== `:${emojiId}:`) {
        return { text: emojified };
      }

      const customEmoji = findCustomEmoji?.(emojiId);
      const customIconUrl = customEmoji?.skins[0]?.src;
      if (customIconUrl) {
        return { text: "", iconUrl: customIconUrl };
      }
    }

    const normalizedReaction = reaction
      .replaceAll(":", "")
      .replaceAll("-", " ")
      .replaceAll("_", " ");
    return { text: `'${normalizedReaction}'` };
  };

  const getDropContent = (dropIndex: number = 0): string | null => {
    if (!notification.related_drops?.length) return null;
    const drop = notification.related_drops[dropIndex];
    if (!drop) return null;
    const firstPart =
      drop.parts?.find((part) => part.content) ?? drop.parts?.[0];
    return firstPart?.content ?? null;
  };

  const getWavesRedirect = (dropIndex: number = 0): string => {
    if (!notification.related_drops?.length) return "/notifications";
    const drop = notification.related_drops[dropIndex];
    if (!drop) return "/notifications";
    const waveId = drop.wave?.id;
    const isDm = drop.wave?.admin_group_id?.startsWith("dm-");
    if (!waveId) return "/notifications";
    const base = isDm ? `/messages?wave=${waveId}` : `/waves?wave=${waveId}`;
    const serialNo = drop.serial_no;
    return serialNo ? `${base}&serialNo=${serialNo}` : base;
  };

  let notificationData: NotificationData | null = null;

  switch (cause) {
    case ApiNotificationCause.IdentitySubscribed:
      notificationData = {
        title: `${handle} is now following you`,
        body: "View profile",
        redirectPath: handle ? getProfileRedirect(handle) : "/notifications",
      };
      break;

    case ApiNotificationCause.IdentityMentioned: {
      const dropContent = getDropContent();
      notificationData = {
        title: `${handle} mentioned you`,
        body: dropContent ?? "View drop",
        redirectPath: getWavesRedirect(),
      };
      break;
    }

    case ApiNotificationCause.IdentityNic: {
      const nicCtx = notification.additional_context as
        | { amount?: number; total?: number }
        | undefined;
      const amount = nicCtx?.amount ?? 0;
      const total = nicCtx?.total ?? 0;
      const emoji = amount > 0 ? "🚀" : "💔";
      const sign = amount > 0 ? "+" : "";
      notificationData = {
        title: `${emoji} Updated NIC Rating`,
        body: `${handle} updated your NIC by ${sign}${formatNumberWithCommas(amount)}\nNew Total: ${formatNumberWithCommas(total)}`,
        redirectPath: connectedProfileHandle
          ? getProfileRedirect(connectedProfileHandle, "identity")
          : "/notifications",
      };
      break;
    }
    case ApiNotificationCause.IdentityRep: {
      const repCtx = notification.additional_context as
        | { amount?: number; total?: number; category?: string }
        | undefined;
      const amount = repCtx?.amount ?? 0;
      const total = repCtx?.total ?? 0;
      const category = repCtx?.category;
      const categoryText = category ? ` for category '${category}'` : "";
      const emoji = amount > 0 ? "🚀" : "💔";
      const sign = amount > 0 ? "+" : "";
      notificationData = {
        title: `${emoji} Updated REP${categoryText}`,
        body: `${handle} updated your REP by ${sign}${formatNumberWithCommas(amount)}\nNew Total: ${formatNumberWithCommas(total)}`,
        redirectPath: connectedProfileHandle
          ? getProfileRedirect(connectedProfileHandle, "rep")
          : "/notifications",
      };
      break;
    }

    case ApiNotificationCause.DropQuoted: {
      const dropContent = getDropContent();
      notificationData = {
        title: `${handle} quoted you`,
        body: dropContent ?? "View drop",
        redirectPath: getWavesRedirect(),
      };
      break;
    }

    case ApiNotificationCause.DropReplied: {
      const replyContent = getDropContent(1);
      notificationData = {
        title: `${handle} replied`,
        body: replyContent ?? "View drop",
        redirectPath: getWavesRedirect(1),
      };
      break;
    }

    case ApiNotificationCause.DropVoted: {
      const vote = (notification.additional_context as any)?.vote;
      if (vote === undefined || vote === 0) {
        return null;
      }
      const voteStr = vote > 0 ? `+${vote}` : `-${Math.abs(vote)}`;
      const dropContent = getDropContent();
      notificationData = {
        title: `${handle} rated ${voteStr}`,
        body: dropContent ?? "View drop",
        redirectPath: getWavesRedirect(),
      };
      break;
    }

    case ApiNotificationCause.DropReacted: {
      const reaction = (notification.additional_context as any)?.reaction;
      if (!reaction) {
        return null;
      }
      const reactionPresentation = getReactionPresentation(reaction);
      const dropContent = getDropContent();
      notificationData = {
        title: `${handle} reacted${
          reactionPresentation.text ? ` ${reactionPresentation.text}` : ""
        }`,
        body: dropContent ?? "View drop",
        redirectPath: getWavesRedirect(),
        ...(reactionPresentation.iconUrl !== undefined && {
          iconUrl: reactionPresentation.iconUrl,
        }),
      };
      break;
    }

    case ApiNotificationCause.DropBoosted: {
      const dropContent = getDropContent();
      notificationData = {
        title: `${handle} boosted your drop 🔥`,
        body: dropContent ?? "View drop",
        redirectPath: getWavesRedirect(),
      };
      break;
    }

    case ApiNotificationCause.WaveCreated: {
      const wave = notification.related_drops?.[0]?.wave;
      const waveName = (wave as any)?.name ?? "a wave";
      const waveId =
        (notification.additional_context as any)?.wave_id ?? wave?.id;
      const redirectPath = waveId ? `/waves?wave=${waveId}` : "/notifications";
      notificationData = {
        title: `${handle} invited you to a wave: ${waveName}`,
        body: "View wave",
        redirectPath,
      };
      break;
    }

    case ApiNotificationCause.AllDrops: {
      const wave = notification.related_drops?.[0]?.wave;
      const waveName = (wave as any)?.name ?? "a wave";
      const vote = (notification.additional_context as any)?.vote;

      let title = handle;
      if (typeof vote === "number" && vote !== 0) {
        const voteStr = vote > 0 ? `+${vote}` : `-${Math.abs(vote)}`;
        title = `${handle} rated a drop: ${voteStr}`;
      }
      title += ` in ${waveName}`;
      const dropContent = getDropContent();
      notificationData = {
        title,
        body: dropContent ?? "View drop",
        redirectPath: getWavesRedirect(),
      };
      break;
    }

    default:
      notificationData = {
        title: `You have a new notification from ${handle}`,
        body: "View notification",
        redirectPath: "/notifications",
      };
      break;
  }

  if (!notificationData) {
    return null;
  }

  let title = emojify(notificationData.title.replace(/@\[(.+?)\]/g, "@$1"));
  let body = emojify(notificationData.body.replace(/@\[(.+?)\]/g, "@$1"));

  return {
    title,
    body,
    redirectPath: notificationData.redirectPath,
    ...(notificationData.iconUrl !== undefined && {
      iconUrl: notificationData.iconUrl,
    }),
  };
}
