"use client";

import { useAppWallets } from "@/components/app-wallets/AppWalletsContext";
import { useAuth } from "@/components/auth/Auth";
import { useSeizeConnectContext } from "@/components/auth/SeizeConnectContext";
import BellIcon from "@/components/common/icons/BellIcon";
import ChatBubbleIcon from "@/components/common/icons/ChatBubbleIcon";
import DiscoverIcon from "@/components/common/icons/DiscoverIcon";
import HomeIcon from "@/components/common/icons/HomeIcon";
import WavesIcon from "@/components/common/icons/WavesIcon";
import { useCookieConsent } from "@/components/cookies/CookieConsentContext";
import HeaderSearchModal from "@/components/header/header-search/HeaderSearchModal";
import { resolveIpfsUrl, useIpfsContext } from "@/components/ipfs/IPFSContext";
import CommonAnimationOpacity from "@/components/utils/animation/CommonAnimationOpacity";
import CommonAnimationWrapper from "@/components/utils/animation/CommonAnimationWrapper";
import { useEmoji } from "@/contexts/EmojiContext";
import { useTitle } from "@/contexts/TitleContext";
import { ApiNotification } from "@/generated/models/ApiNotification";
import { ApiNotificationCause } from "@/generated/models/ApiNotificationCause";
import { isElectron } from "@/helpers";
import useCapacitor from "@/hooks/useCapacitor";
import { useSectionMap, useSidebarSections } from "@/hooks/useSidebarSections";
import { useUnreadIndicator } from "@/hooks/useUnreadIndicator";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { MagnifyingGlassIcon, UserIcon } from "@heroicons/react/24/outline";
import { usePathname } from "next/navigation";
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { useKey } from "react-use";
import WebSidebarExpandable from "./nav/WebSidebarExpandable";
import WebSidebarNavItem from "./nav/WebSidebarNavItem";
import WebSidebarSubmenu from "./nav/WebSidebarSubmenu";

interface WebSidebarNavProps {
  readonly isCollapsed: boolean;
}

const WebSidebarNav = React.forwardRef<
  { closeSubmenu: () => void },
  WebSidebarNavProps
>(({ isCollapsed = false }, ref) => {
  const pathname = usePathname();
  const capacitor = useCapacitor();
  const { country } = useCookieConsent();
  const { address } = useSeizeConnectContext();
  const { connectedProfile } = useAuth();
  const { appWalletsSupported } = useAppWallets();
  const { haveUnreadNotifications, notifications } = useUnreadNotifications(
    connectedProfile?.handle ?? null
  );
  const { hasUnread: hasUnreadMessages } = useUnreadIndicator({
    type: "messages",
    handle: connectedProfile?.handle ?? null,
  });
  const { setNotificationCount } = useTitle();
  const { findNativeEmoji } = useEmoji();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [openSubmenuKey, setOpenSubmenuKey] = useState<string | null>(null);
  const [submenuAnchor, setSubmenuAnchor] = useState<{
    left: number;
    top: number;
    height: number;
  } | null>(null);
  const [submenuTrigger, setSubmenuTrigger] = useState<HTMLElement | null>(
    null
  );
  const { ipfsUrls } = useIpfsContext();

  useKey(
    (event) => event.metaKey && event.key === "k",
    () => setIsSearchOpen(true),
    { event: "keydown" }
  );

  const profilePath = useMemo(() => {
    if (connectedProfile?.handle) return `/${connectedProfile.handle}`;
    if (address) return `/${address}`;
    return null;
  }, [connectedProfile?.handle, address]);

  const sections = useSidebarSections(
    appWalletsSupported,
    capacitor.isIos,
    country,
    ipfsUrls?.webui ?? ""
  );
  const sectionMap = useSectionMap(sections);
  const desktopSection = sectionMap.get("6529-desktop");
  const networkSection = sectionMap.get("network");
  const collectionsSection = sectionMap.get("collections");

  const closeSubmenu = useCallback(() => {
    setOpenSubmenuKey(null);
    setSubmenuAnchor(null);
    setSubmenuTrigger(null);
  }, []);

  useImperativeHandle(ref, () => ({ closeSubmenu }), [closeSubmenu]);

  const activeSectionKey = useMemo(() => {
    if (!pathname) return null;
    for (const section of sections) {
      const inItems = section.items.some((item) => pathname === item.href);
      const inSubsections =
        section.subsections?.some((sub) =>
          sub.items.some((item) => pathname === item.href)
        ) ?? false;
      if (inItems || inSubsections) return section.key;
    }
    return null;
  }, [pathname, sections]);

  useEffect(() => {
    if (activeSectionKey) {
      setExpandedKeys([activeSectionKey]);
    } else {
      setExpandedKeys([]);
    }
    closeSubmenu();
  }, [activeSectionKey, closeSubmenu]);

  useEffect(() => {
    if (!isCollapsed) {
      closeSubmenu();
    }
  }, [isCollapsed, closeSubmenu]);

  const handleSectionToggle = useCallback(
    (sectionKey: string, event?: React.MouseEvent) => {
      event?.stopPropagation();

      if (isCollapsed) {
        const target = event?.currentTarget as HTMLElement | undefined;
        const nextKey = openSubmenuKey === sectionKey ? null : sectionKey;
        setOpenSubmenuKey(nextKey);

        if (nextKey && target) {
          const rect = target.getBoundingClientRect();
          setSubmenuAnchor({
            left: rect.right + 12,
            top: rect.top,
            height: rect.height,
          });
          setSubmenuTrigger(target);
        } else {
          setSubmenuAnchor(null);
          setSubmenuTrigger(null);
        }

        return;
      }

      setExpandedKeys((prev) =>
        prev.includes(sectionKey)
          ? prev.filter((key) => key !== sectionKey)
          : [...prev, sectionKey]
      );
    },
    [isCollapsed, openSubmenuKey]
  );

  useEffect(() => {
    if (isCollapsed && submenuTrigger) {
      const updateAnchor = () => {
        const rect = submenuTrigger.getBoundingClientRect();
        setSubmenuAnchor({
          left: rect.right + 12,
          top: rect.top,
          height: rect.height,
        });
      };

      const browserWindow = globalThis.window ?? undefined;
      const scrollContainer = submenuTrigger.closest(
        "[data-sidebar-scroll='true']"
      ) as HTMLElement | null;
      const canObserve = typeof ResizeObserver === "function";
      const resizeObserver = canObserve
        ? new ResizeObserver(updateAnchor)
        : null;

      updateAnchor();
      browserWindow?.addEventListener("resize", updateAnchor);
      scrollContainer?.addEventListener("scroll", updateAnchor, {
        passive: true,
      });
      resizeObserver?.observe(submenuTrigger);

      return () => {
        browserWindow?.removeEventListener("resize", updateAnchor);
        scrollContainer?.removeEventListener("scroll", updateAnchor);
        resizeObserver?.disconnect();
      };
    }

    return undefined;
  }, [isCollapsed, submenuTrigger]);

  function generateNotificationData(
    notification: ApiNotification,
    findNativeEmoji: (emojiId: string) => any
  ): { title: string; body: string; redirectPath: string } | null {
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
      if (!waveId) return "/notifications";
      const base = `/waves?wave=${waveId}`;
      const serialNo = drop.serial_no;
      return serialNo ? `${base}&serialNo=${serialNo}` : base;
    };

    switch (cause) {
      case ApiNotificationCause.IdentitySubscribed:
        return {
          title: `${handle} is now following you`,
          body: "View profile",
          redirectPath: handle ? `/${handle}` : "/notifications",
        };

      case ApiNotificationCause.IdentityMentioned: {
        const dropContent = getDropContent();
        return {
          title: `${handle} mentioned you`,
          body: dropContent ?? "View drop",
          redirectPath: getWavesRedirect(),
        };
      }

      case ApiNotificationCause.DropQuoted: {
        const dropContent = getDropContent();
        return {
          title: `${handle} quoted you`,
          body: dropContent ?? "View drop",
          redirectPath: getWavesRedirect(),
        };
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
        return {
          title: `${handle} replied`,
          body: replyContent ?? "View drop",
          redirectPath,
        };
      }

      case ApiNotificationCause.DropVoted: {
        const vote = (notification.additional_context as any)?.vote;
        if (vote === undefined || vote === 0) {
          return null;
        }
        const voteStr = vote > 0 ? `+${vote}` : `-${Math.abs(vote)}`;
        const dropContent = getDropContent();
        return {
          title: `${handle} rated ${voteStr}`,
          body: dropContent ?? "View drop",
          redirectPath: getWavesRedirect(),
        };
      }

      case ApiNotificationCause.DropReacted: {
        const reaction = (notification.additional_context as any)?.reaction;
        if (!reaction) {
          return null;
        }
        const emojiText = getEmojiText(reaction);
        const dropContent = getDropContent();
        return {
          title: `${handle} reacted ${emojiText}`,
          body: dropContent ?? "View drop",
          redirectPath: getWavesRedirect(),
        };
      }

      case ApiNotificationCause.WaveCreated: {
        const wave = notification.related_drops?.[0]?.wave;
        const waveName = (wave as any)?.name ?? "a wave";
        const waveId =
          (notification.additional_context as any)?.wave_id ?? wave?.id;
        const redirectPath = waveId
          ? `/waves?wave=${waveId}`
          : "/notifications";
        return {
          title: `${handle} invited you to a wave: ${waveName}`,
          body: "View wave",
          redirectPath,
        };
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
        return {
          title,
          body: dropContent ?? "View drop",
          redirectPath: getWavesRedirect(),
        };
      }

      default:
        return {
          title: `You have a new notification from ${handle}`,
          body: "View notification",
          redirectPath: "/notifications",
        };
    }
  }

  async function showNotification(
    notification: ApiNotification,
    unreadCount: number
  ) {
    if (!isElectron() || !unreadCount) return;
    const relatedPfp = notification.related_identity?.pfp;
    const newSrc = relatedPfp ? await resolveIpfsUrl(relatedPfp) : "";
    const notificationData = generateNotificationData(
      notification,
      findNativeEmoji
    );
    if (!notificationData) return;
    window.notifications.showNotification(
      notification.id,
      newSrc,
      notificationData.title,
      notificationData.body,
      notificationData.redirectPath
    );
  }

  useEffect(() => {
    setNotificationCount(notifications?.unread_count ?? 0);
    if (haveUnreadNotifications && notifications?.notifications?.length) {
      showNotification(
        notifications.notifications[0],
        notifications?.unread_count
      );
    }
  }, [notifications?.unread_count, haveUnreadNotifications]);

  const renderCollapsedSubmenu = useCallback(
    (sectionKey: string) => {
      if (isCollapsed && openSubmenuKey === sectionKey && submenuAnchor) {
        const openSection = sections.find(
          (section) => section.key === sectionKey
        );
        if (!openSection) {
          return null;
        }

        return (
          <WebSidebarSubmenu
            key={`sidebar-submenu-${sectionKey}`}
            section={openSection}
            pathname={pathname}
            onClose={closeSubmenu}
            leftOffset={submenuAnchor.left}
            anchorTop={submenuAnchor.top}
            anchorHeight={submenuAnchor.height}
            triggerElement={submenuTrigger}
          />
        );
      }

      return null;
    },
    [
      isCollapsed,
      openSubmenuKey,
      sections,
      pathname,
      closeSubmenu,
      submenuAnchor,
    ]
  );

  return (
    <>
      <nav
        className="tw-flex tw-flex-col tw-mt-4 tw-h-full tw-overflow-y-auto tw-overflow-x-hidden tw-scrollbar-thin tw-scrollbar-thumb-iron-500 tw-scrollbar-track-iron-800 desktop-hover:hover:tw-scrollbar-thumb-iron-300 tw-px-3"
        aria-label="Desktop navigation">
        <ul className="tw-list-none tw-m-0 tw-p-0">
          <li>
            <WebSidebarNavItem
              href="/"
              icon={HomeIcon}
              active={pathname === "/"}
              collapsed={isCollapsed}
              label="Home"
            />
          </li>

          <li>
            <WebSidebarNavItem
              href="/waves"
              icon={WavesIcon}
              active={pathname?.startsWith("/waves") || false}
              collapsed={isCollapsed}
              label="Waves"
            />
          </li>

          <li>
            <WebSidebarNavItem
              href="/messages"
              icon={ChatBubbleIcon}
              active={pathname?.startsWith("/messages") || false}
              collapsed={isCollapsed}
              label="Messages"
              hasIndicator={hasUnreadMessages}
            />
          </li>

          {desktopSection && (
            <li className={isCollapsed ? "tw-relative" : undefined}>
              <WebSidebarExpandable
                section={desktopSection}
                expanded={expandedKeys.includes("6529-desktop")}
                onToggle={(event) => handleSectionToggle("6529-desktop", event)}
                collapsed={isCollapsed}
                pathname={pathname}
                data-section="6529-desktop"
              />
              {renderCollapsedSubmenu("6529-desktop")}
            </li>
          )}

          <li>
            <WebSidebarNavItem
              href="/discover"
              icon={DiscoverIcon}
              active={pathname?.startsWith("/discover") || false}
              collapsed={isCollapsed}
              label="Discover"
            />
          </li>

          {networkSection && (
            <li className={isCollapsed ? "tw-relative" : undefined}>
              <WebSidebarExpandable
                section={networkSection}
                expanded={expandedKeys.includes("network")}
                onToggle={(event) => handleSectionToggle("network", event)}
                collapsed={isCollapsed}
                pathname={pathname}
                data-section="network"
              />
              {renderCollapsedSubmenu("network")}
            </li>
          )}

          {collectionsSection && (
            <li className={isCollapsed ? "tw-relative" : undefined}>
              <WebSidebarExpandable
                section={collectionsSection}
                expanded={expandedKeys.includes("collections")}
                onToggle={(event) => handleSectionToggle("collections", event)}
                collapsed={isCollapsed}
                pathname={pathname}
                data-section="collections"
              />
              {renderCollapsedSubmenu("collections")}
            </li>
          )}

          <li>
            <WebSidebarNavItem
              href="/notifications"
              icon={BellIcon}
              active={pathname?.startsWith("/notifications") || false}
              collapsed={isCollapsed}
              label="Notifications"
              hasIndicator={haveUnreadNotifications}
            />
          </li>

          {profilePath && (
            <li>
              <WebSidebarNavItem
                href={profilePath}
                icon={UserIcon}
                iconSizeClass="tw-h-6 tw-w-6"
                active={pathname === profilePath}
                collapsed={isCollapsed}
                label="Profile"
              />
            </li>
          )}

          <li>
            <WebSidebarNavItem
              onClick={(event?: React.MouseEvent) => {
                event?.stopPropagation();
                setIsSearchOpen(true);
              }}
              icon={MagnifyingGlassIcon}
              active={false}
              collapsed={isCollapsed}
              label="Search"
            />
          </li>

          {sections
            .filter(
              (section) =>
                section.key !== "network" &&
                section.key !== "collections" &&
                section.key !== "6529-desktop"
            )
            .map((section) => (
              <li
                key={section.key}
                className={isCollapsed ? "tw-relative" : undefined}>
                <WebSidebarExpandable
                  section={section}
                  expanded={expandedKeys.includes(section.key)}
                  onToggle={(event) => handleSectionToggle(section.key, event)}
                  collapsed={isCollapsed}
                  pathname={pathname}
                  data-section={section.key}
                />
                {renderCollapsedSubmenu(section.key)}
              </li>
            ))}
        </ul>
      </nav>

      <CommonAnimationWrapper mode="sync" initial>
        {isSearchOpen && (
          <CommonAnimationOpacity
            key="search-modal"
            elementClasses="tw-fixed tw-inset-0 tw-z-50"
            elementRole="dialog"
            onClicked={(event) => event.stopPropagation()}>
            <HeaderSearchModal onClose={() => setIsSearchOpen(false)} />
          </CommonAnimationOpacity>
        )}
      </CommonAnimationWrapper>
    </>
  );
});

WebSidebarNav.displayName = "WebSidebarNav";

export default WebSidebarNav;
