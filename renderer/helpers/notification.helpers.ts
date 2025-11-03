import { ApiNotification } from "@/generated/models/ApiNotification";
import { ApiNotificationCause } from "@/generated/models/ApiNotificationCause";
import { emojify } from "./emoji.helpers";

interface NotificationData {
  title: string;
  body: string;
  redirectPath: string;
}

type FindNativeEmoji = (
  emojiId: string
) => { skins: { native: string }[] } | null;

export function generateNotificationData(
  notification: ApiNotification,
  findNativeEmoji: FindNativeEmoji
): NotificationData | null {
  const handle = notification.related_identity?.handle ?? "Someone";
  const cause = notification.cause;

  const getEmojiText = (reaction: string): string => {
    const emojiId = reaction.replaceAll(":", "");
    const nativeEmoji = findNativeEmoji(emojiId);
    if (nativeEmoji) {
      return nativeEmoji.skins[0].native;
    }
    const normalizedReaction = reaction
      .replaceAll(":", "")
      .replaceAll("-", " ")
      .replaceAll("_", " ");
    return `'${normalizedReaction}'`;
  };

  const getDropContent = (dropIndex: number = 0): string | null => {
    if (!notification.related_drops?.length) return null;
    const drop = notification.related_drops[dropIndex];
    if (!drop) return null;
    const firstPart =
      drop.parts?.find((part) => part.content) ?? drop.parts?.[0];
    return firstPart?.content ?? null;
  };

  const getWavesRedirect = (): string => {
    if (!notification.related_drops?.length) return "/notifications";
    const drop = notification.related_drops[0];
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
        redirectPath: handle ? `/${handle}` : "/notifications",
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
      const redirectPath = (() => {
        if (
          !notification.related_drops?.length ||
          notification.related_drops.length < 2
        )
          return "/notifications";
        const replyDrop = notification.related_drops[1];
        const waveId = replyDrop.wave?.id;
        if (!waveId) return "/notifications";
        const base = `/waves?wave=${waveId}`;
        const serialNo = replyDrop.serial_no;
        return serialNo ? `${base}&serialNo=${serialNo}` : base;
      })();
      notificationData = {
        title: `${handle} replied`,
        body: replyContent ?? "View drop",
        redirectPath,
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
      const emojiText = getEmojiText(reaction);
      const dropContent = getDropContent();
      notificationData = {
        title: `${handle} reacted ${emojiText}`,
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
  };
}
