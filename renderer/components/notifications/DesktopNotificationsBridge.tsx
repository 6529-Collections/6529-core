"use client";

import { useAuth } from "@/components/auth/Auth";
import { useSeizeConnectContext } from "@/components/auth/SeizeConnectContext";
import { resolveIpfsUrlAsync } from "@/components/ipfs/IPFSContext";
import { useEmoji } from "@/contexts/EmojiContext";
import type { ApiIdentity } from "@/generated/models/ApiIdentity";
import type { ApiNotification } from "@/generated/models/ApiNotification";
import type { ApiNotificationsResponse } from "@/generated/models/ApiNotificationsResponse";
import { isElectron } from "@/helpers";
import { generateNotificationData } from "@/helpers/notification.helpers";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { commonApiFetch } from "@/services/api/common-api";
import {
  getConnectedWalletAccounts,
  type ConnectedWalletAccount,
} from "@/services/auth/auth.utils";

type NotificationSnapshot = Readonly<{
  unreadCount: number;
  notification: ApiNotification | null;
}>;

type NotificationNavigatePayload = Readonly<{
  path: string;
  targetAddress: string | null;
  targetProfileId: string | null;
  targetProfileHandle: string | null;
}>;

const POLL_INTERVAL_MS = 15000;
const PROFILE_SWITCH_SETTLE_TIMEOUT_MS = 3000;
const PROFILE_SWITCH_POLL_INTERVAL_MS = 50;

const toAddressKey = (address: string): string => address.toLowerCase();

const clampUnreadCount = (count: number | null | undefined): number => {
  if (typeof count !== "number" || Number.isNaN(count) || count <= 0) {
    return 0;
  }
  return Math.floor(count);
};

const toNullableTrimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseNotificationNavigatePayload = (
  value: unknown
): NotificationNavigatePayload | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const path = toNullableTrimmedString(record["path"]);
  if (!path) {
    return null;
  }

  return {
    path,
    targetAddress: toNullableTrimmedString(record["targetAddress"]),
    targetProfileId: toNullableTrimmedString(record["targetProfileId"]),
    targetProfileHandle: toNullableTrimmedString(record["targetProfileHandle"]),
  };
};

const fetchNotificationSnapshotForAccount = async (
  account: ConnectedWalletAccount
): Promise<NotificationSnapshot> => {
  if (!account.jwt) {
    return { unreadCount: 0, notification: null };
  }

  const notifications = await commonApiFetch<ApiNotificationsResponse>({
    endpoint: "notifications",
    params: { limit: "1" },
    headers: {
      Authorization: `Bearer ${account.jwt}`,
    },
  });

  return {
    unreadCount: clampUnreadCount(notifications.unread_count),
    notification: notifications.notifications?.[0] ?? null,
  };
};

export default function DesktopNotificationsBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const { connectedProfile } = useAuth();
  const { findNativeEmoji } = useEmoji();
  const {
    address,
    connectedAccounts,
    connectedAccountUnreadNotifications,
    seizeSwitchConnectedAccount,
  } = useSeizeConnectContext();
  const connectedProfileRef = useRef<ApiIdentity | null>(connectedProfile);
  const activeAddressRef = useRef(address);
  const connectedAccountsRef = useRef(connectedAccounts);
  const shownNotificationKeysRef = useRef<Set<string>>(new Set());
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    connectedProfileRef.current = connectedProfile;
  }, [connectedProfile]);

  useEffect(() => {
    activeAddressRef.current = address;
  }, [address]);

  useEffect(() => {
    connectedAccountsRef.current = connectedAccounts;
  }, [connectedAccounts]);

  const dockBadgeCount = useMemo(
    () =>
      Object.values(connectedAccountUnreadNotifications).reduce(
        (total, count) => total + clampUnreadCount(count),
        0
      ),
    [connectedAccountUnreadNotifications]
  );

  useEffect(() => {
    if (!isElectron()) {
      return;
    }

    window.notifications.setBadge(dockBadgeCount);
  }, [dockBadgeCount]);

  const resolveAddressForNotificationPayload = useCallback(
    (payload: NotificationNavigatePayload): string | null => {
      if (payload.targetAddress) {
        const normalizedTargetAddress = payload.targetAddress.toLowerCase();
        const accountByAddress = connectedAccountsRef.current.find(
          (account) => account.address.toLowerCase() === normalizedTargetAddress
        );
        if (accountByAddress) {
          return accountByAddress.address;
        }
      }

      if (payload.targetProfileId) {
        const accountByProfileId = connectedAccountsRef.current.find(
          (account) => account.profileId === payload.targetProfileId
        );
        if (accountByProfileId) {
          return accountByProfileId.address;
        }
      }

      if (payload.targetProfileHandle) {
        const normalizedHandle = payload.targetProfileHandle.toLowerCase();
        const accountByHandle = connectedAccountsRef.current.find(
          (account) => account.profileHandle?.toLowerCase() === normalizedHandle
        );
        if (accountByHandle) {
          return accountByHandle.address;
        }
      }

      return null;
    },
    []
  );

  const switchToNotificationProfile = useCallback(
    async (payload: NotificationNavigatePayload): Promise<boolean> => {
      const hasTargetProfile = !!(
        payload.targetAddress ||
        payload.targetProfileId ||
        payload.targetProfileHandle
      );
      if (!hasTargetProfile) {
        return true;
      }

      const matchedAddress = resolveAddressForNotificationPayload(payload);
      if (!matchedAddress) {
        return false;
      }

      const isTargetProfileActive = (): boolean => {
        const activeAddress = activeAddressRef.current;
        if (!activeAddress) {
          return false;
        }

        if (activeAddress.toLowerCase() !== matchedAddress.toLowerCase()) {
          return false;
        }

        if (!payload.targetProfileId) {
          return true;
        }

        return connectedProfileRef.current?.id === payload.targetProfileId;
      };

      const waitForProfileSwitchSettlement = async (): Promise<boolean> => {
        const timeoutAt = Date.now() + PROFILE_SWITCH_SETTLE_TIMEOUT_MS;
        while (Date.now() < timeoutAt) {
          if (isTargetProfileActive()) {
            return true;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, PROFILE_SWITCH_POLL_INTERVAL_MS)
          );
        }
        return isTargetProfileActive();
      };

      if (isTargetProfileActive()) {
        return true;
      }

      if (typeof window !== "undefined") {
        const currentPath = window.location.pathname;
        const currentParams = new URLSearchParams(window.location.search);
        const isWaveScopedRoute =
          currentPath === "/messages" || currentPath === "/waves";
        if (isWaveScopedRoute && currentParams.has("wave")) {
          router.replace(currentPath, { scroll: false });
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      if (
        activeAddressRef.current?.toLowerCase() === matchedAddress.toLowerCase()
      ) {
        return await waitForProfileSwitchSettlement();
      }

      try {
        await Promise.resolve(seizeSwitchConnectedAccount(matchedAddress));
      } catch {
        return false;
      }

      return await waitForProfileSwitchSettlement();
    },
    [resolveAddressForNotificationPayload, router, seizeSwitchConnectedAccount]
  );

  const navigateToUrl = useCallback(
    (url: string) => {
      if (typeof window === "undefined") {
        router.push(url);
        return;
      }

      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (currentUrl !== url) {
        router.push(url);
        return;
      }

      const currentParams = new URLSearchParams(window.location.search);
      currentParams.set("reload", "true");
      const normalizedPathname = pathname.split("?")[0];
      const reloadUrl = `${normalizedPathname}?${currentParams.toString()}`;
      router.replace(reloadUrl, { scroll: false });
    },
    [pathname, router]
  );

  useEffect(() => {
    if (!isElectron()) {
      return;
    }

    const onNotificationNavigate = (_event: any, value: unknown) => {
      const payload = parseNotificationNavigatePayload(value);
      if (!payload) {
        return;
      }

      void (async () => {
        const didSwitch = await switchToNotificationProfile(payload);
        if (!didSwitch) {
          return;
        }

        navigateToUrl(payload.path);
      })();
    };

    window.api.onNotificationNavigate(onNotificationNavigate);
    return () => {
      window.api.offNotificationNavigate(onNotificationNavigate);
    };
  }, [navigateToUrl, switchToNotificationProfile]);

  const showDesktopNotification = useCallback(
    async (account: ConnectedWalletAccount, notification: ApiNotification) => {
      const addressKey = toAddressKey(account.address);
      const connectedAccount = connectedAccountsRef.current.find(
        (item) => toAddressKey(item.address) === addressKey
      );

      const profileHandle =
        connectedAccount?.profileHandle ?? account.profileHandle ?? null;
      const profileId = connectedAccount?.profileId ?? account.profileId ?? null;
      const accountHandle = profileHandle?.trim() ?? "";
      const hasMultipleConnectedAccounts = connectedAccountsRef.current.length > 1;
      const titlePrefix =
        hasMultipleConnectedAccounts && accountHandle
          ? `[${accountHandle}] `
          : "";

      const relatedPfp = notification.related_identity?.pfp;
      const notificationData = generateNotificationData(
        notification,
        findNativeEmoji,
        accountHandle || null
      );
      if (!notificationData) {
        return;
      }

      const icon = relatedPfp ? await resolveIpfsUrlAsync(relatedPfp) : "";
      window.notifications.showNotification(
        notification.id,
        icon,
        `${titlePrefix}${notificationData.title}`,
        notificationData.body,
        notificationData.redirectPath,
        {
          targetAddress: account.address,
          targetProfileId: profileId,
          targetProfileHandle: profileHandle,
        }
      );
    },
    [findNativeEmoji]
  );

  const pollNotifications = useCallback(async () => {
    if (!isElectron() || pollInFlightRef.current) {
      return;
    }

    pollInFlightRef.current = true;
    try {
      const accounts = getConnectedWalletAccounts();
      if (accounts.length === 0) {
        return;
      }

      const results = await Promise.allSettled(
        accounts.map((account) => fetchNotificationSnapshotForAccount(account))
      );

      results.forEach((result, index) => {
        const account = accounts[index];
        if (!account) {
          return;
        }

        if (result.status !== "fulfilled") {
          return;
        }

        const { unreadCount, notification } = result.value;
        if (!notification || unreadCount <= 0) {
          return;
        }

        const notificationKey = `${toAddressKey(account.address)}:${notification.id}`;
        if (shownNotificationKeysRef.current.has(notificationKey)) {
          return;
        }
        shownNotificationKeysRef.current.add(notificationKey);

        void showDesktopNotification(account, notification);
      });
    } finally {
      pollInFlightRef.current = false;
    }
  }, [showDesktopNotification]);

  useEffect(() => {
    if (!isElectron()) {
      return;
    }

    void pollNotifications();
    const interval = setInterval(() => {
      void pollNotifications();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [pollNotifications]);

  return null;
}
