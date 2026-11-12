import CollectionsMenuIcon from "@/components/common/icons/CollectionsMenuIcon";
import DesktopIcon from "@/components/common/icons/DesktopIcon";
import WavesIcon from "@/components/common/icons/WavesIcon";
import type { SidebarSection } from "@/components/navigation/navTypes";
import {
  getAboutNavItemActivePathPrefixes,
  getAboutNavItemHref,
  getAboutNavItemLabel,
  getVisibleAboutNavGroups,
} from "@/components/about/about.routes";
import { DEFAULT_LOCALE, type SupportedLocale } from "@/i18n/locales";
import { t, type MessageKey } from "@/i18n/messages";
import {
  BuildingLibraryIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { useMemo, type ComponentType } from "react";
import { useBrowserLocale } from "./useBrowserLocale";

type SidebarSubsection = NonNullable<SidebarSection["subsections"]>[number];
type SidebarNavItem = SidebarSubsection["items"][number];

function getDesktopSection(
  ipfsWebuiUrl: string,
  locale: SupportedLocale
): SidebarSection {
  return {
    key: "6529-desktop",
    name: t(locale, "navigation.desktop.title"),
    icon: DesktopIcon,
    items: [
      {
        name: t(locale, "navigation.desktop.wallets"),
        href: "/core/core-wallets",
      },
      {
        name: t(locale, "navigation.desktop.ethTransactions"),
        href: "/core/eth-transactions",
      },
      {
        name: t(locale, "navigation.desktop.tdhCalculation"),
        href: "/core/tdh-calculation",
      },
      { name: t(locale, "navigation.primary.about"), href: "/core/core-info" },
    ],
    subsections: [
      {
        name: t(locale, "navigation.desktop.localServices"),
        items: [
          {
            id: "desktop-ipfs",
            name: t(locale, "navigation.desktop.myIpfs"),
            href: ipfsWebuiUrl,
            isExternal: true,
          },
          {
            id: "desktop-validator",
            name: t(locale, "navigation.desktop.validatorTitle"),
            href: "",
          },
        ],
      },
    ],
  };
}

function mapAboutNavItemToSidebarItem(
  item: ReturnType<typeof getVisibleAboutNavGroups>[number]["items"][number]
): SidebarNavItem {
  const activePathPrefixes = getAboutNavItemActivePathPrefixes(item);
  const sidebarItem = {
    name: getAboutNavItemLabel(item, DEFAULT_LOCALE),
    href: getAboutNavItemHref(item),
  };

  return activePathPrefixes === undefined
    ? sidebarItem
    : { ...sidebarItem, activePathPrefixes };
}

function mapAboutNavGroupToSubsection(
  group: ReturnType<typeof getVisibleAboutNavGroups>[number]
): SidebarSubsection {
  return {
    name: t(DEFAULT_LOCALE, group.labelKey),
    items: group.items.map(mapAboutNavItemToSidebarItem),
  };
}

function getWavesSection(): SidebarSection {
  return {
    key: "waves",
    name: t(DEFAULT_LOCALE, "navigation.primary.waves"),
    icon: WavesIcon,
    items: [
      {
        name: t(DEFAULT_LOCALE, "navigation.primary.waves"),
        href: "/waves",
        activePathPrefixes: ["/waves/"],
      },
      {
        name: t(DEFAULT_LOCALE, "navigation.waves.discover"),
        href: "/discover",
      },
    ],
    subsections: [],
  };
}

function getMuseumSection(): SidebarSection {
  return {
    key: "museum",
    name: t(DEFAULT_LOCALE, "navigation.primary.museum"),
    icon: BuildingLibraryIcon,
    items: [
      {
        name: t(DEFAULT_LOCALE, "navigation.primary.museum"),
        href: "/museum/network",
        activePathPrefixes: ["/museum/network/"],
      },
    ],
    subsections: [],
  };
}

// NFTs rows that also stay active on their nested pages, in menu order.
const NFT_SECTION_ROUTES: ReadonlyArray<readonly [MessageKey, string]> = [
  ["collect.menuLabel", "/collect"],
  ["navigation.nfts.theMemes", "/the-memes"],
  ["navigation.nfts.gradient", "/6529-gradient"],
  ["navigation.nfts.nextGen", "/nextgen"],
  ["navigation.nfts.memeLab", "/meme-lab"],
  ["navigation.nfts.rememes", "/rememes"],
  ["navigation.nfts.stream", "/stream"],
];

function getNftsSection(hideNftPurchasing: boolean): SidebarSection {
  return {
    key: "nfts",
    name: t(DEFAULT_LOCALE, "navigation.primary.nfts"),
    icon: CollectionsMenuIcon,
    items: [
      ...NFT_SECTION_ROUTES.filter(
        ([, href]) => !hideNftPurchasing || href !== "/collect"
      ).map(([nameKey, href]) => ({
        name: t(DEFAULT_LOCALE, nameKey),
        href,
        activePathPrefixes: [`${href}/`],
      })),
      {
        name: t(DEFAULT_LOCALE, "navigation.nfts.activity"),
        href: "/nft-activity",
      },
      {
        name: t(DEFAULT_LOCALE, "navigation.nfts.memesCalendar"),
        href: "/meme-calendar",
      },
    ],
    subsections: [],
  };
}

function getAboutSection(
  appWalletsSupported: boolean,
  hideSubscriptions: boolean,
  hideSubscriptionReports: boolean
): SidebarSection {
  const aboutGroups = getVisibleAboutNavGroups({
    hideSubscriptions,
    hideSubscriptionReports,
    appWalletsSupported,
  });

  return {
    key: "about",
    name: t(DEFAULT_LOCALE, "navigation.primary.about"),
    icon: DocumentTextIcon,
    items: [
      {
        name: t(DEFAULT_LOCALE, "navigation.about.overview"),
        href: "/about",
        activePathPrefixes: ["/about/"],
      },
    ],
    subsections: aboutGroups.map(mapAboutNavGroupToSubsection),
  };
}

function buildSidebarSections(
  appWalletsSupported: boolean,
  hideSubscriptions: boolean,
  hideSubscriptionReports: boolean,
  ipfsWebuiUrl: string,
  locale: SupportedLocale
): SidebarSection[] {
  return [
    getNftsSection(hideSubscriptions),
    getMuseumSection(),
    getWavesSection(),
    getAboutSection(
      appWalletsSupported,
      hideSubscriptions,
      hideSubscriptionReports
    ),
    getDesktopSection(ipfsWebuiUrl, locale),
  ];
}

export function useSidebarSections(
  appWalletsSupported: boolean,
  hideSubscriptions: boolean,
  hideSubscriptionReports = hideSubscriptions,
  ipfsWebuiUrl = ""
): SidebarSection[] {
  const locale = useBrowserLocale();
  return useMemo(
    () =>
      buildSidebarSections(
        appWalletsSupported,
        hideSubscriptions,
        hideSubscriptionReports,
        ipfsWebuiUrl,
        locale
      ),
    [
      appWalletsSupported,
      hideSubscriptions,
      hideSubscriptionReports,
      ipfsWebuiUrl,
      locale,
    ]
  );
}

export function useSectionMap(sections: SidebarSection[]) {
  return useMemo(
    () => new Map(sections.map((section) => [section.key, section])),
    [sections]
  );
}

export interface SidebarPageEntry {
  name: string;
  href: string;
  section: string;
  subsection?: string | undefined;
  icon?: ComponentType<{ className?: string | undefined }> | undefined;
}

export function mapSidebarSectionsToPages(
  sections: SidebarSection[]
): SidebarPageEntry[] {
  return sections.flatMap((section) => {
    const sectionIcon = section.icon;
    const sectionItems: SidebarPageEntry[] = section.items.map((item) => ({
      name: item.name,
      href: item.href,
      section: section.name,
      icon: sectionIcon,
    }));

    const subsectionItems =
      section.subsections?.flatMap((subsection) =>
        subsection.items
          .filter((item) => Boolean(item.href))
          .map((item) => ({
            name: item.name,
            href: item.href,
            section: section.name,
            subsection: subsection.name,
            icon: sectionIcon,
          }))
      ) ?? [];

    return [...sectionItems, ...subsectionItems];
  });
}
