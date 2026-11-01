import type { NotificationConstructorOptions } from "electron";
import type {
  NotificationNavigatePayload,
  NotificationNavigationContext,
} from "../shared/preload-types";

const DEFAULT_NOTIFICATION_PATH = "/notifications";

/**
 * Native notification options. Content-free notices (encrypted messages)
 * have no picture, so an empty icon is left out rather than passed on.
 */
export function getDesktopNotificationOptions({
  title,
  body,
  icon,
}: {
  readonly title: string;
  readonly body: string;
  readonly icon: unknown;
}): NotificationConstructorOptions {
  return typeof icon === "string" && icon.trim().length > 0
    ? { title, body, icon }
    : { title, body };
}

/** The in-app path a click opens: a path on the renderer's own origin. */
export function getNotificationRedirectPath(redirectPath: unknown): string {
  if (typeof redirectPath !== "string") {
    return DEFAULT_NOTIFICATION_PATH;
  }
  const path = redirectPath.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return DEFAULT_NOTIFICATION_PATH;
  }
  return path;
}

/** What the renderer receives when a notification is clicked. */
export function getNotificationNavigatePayload(
  redirectPath: unknown,
  navigationContext?: NotificationNavigationContext,
): NotificationNavigatePayload {
  return {
    path: getNotificationRedirectPath(redirectPath),
    targetAddress: navigationContext?.targetAddress ?? null,
    targetProfileId: navigationContext?.targetProfileId ?? null,
    targetProfileHandle: navigationContext?.targetProfileHandle ?? null,
  };
}
