"use client";

import { useIpfsContext } from "@/components/ipfs/IPFSContext";
import CircleLoader, {
  CircleLoaderSize,
} from "@/components/distribution-plan-tool/common/CircleLoader";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { t } from "@/i18n/messages";
import { useRouter } from "next/navigation";
import {
  faExternalLinkAlt,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

/** Keep the local node's menu row stable as its availability changes. */
export default function DesktopIpfsNavItem({
  className,
  onNavigate,
}: {
  readonly className: string;
  readonly onNavigate?: (() => void) | undefined;
}) {
  const { ipfsStatus, ipfsUrls } = useIpfsContext();
  const router = useRouter();
  const ready = ipfsStatus === "ready" && Boolean(ipfsUrls?.webui);
  const off = ipfsStatus === "disabled";
  const settingsHref = "/core/core-info#local-ipfs";
  const starting = ipfsStatus === "starting" || ipfsStatus === "stopped";
  const label = t(DEFAULT_LOCALE, "navigation.desktop.myIpfs");
  const accessibleLabel = ready
    ? label
    : t(
        DEFAULT_LOCALE,
        ipfsStatus === "disabled"
          ? "navigation.desktop.ipfsDisabled"
          : starting
            ? "navigation.desktop.ipfsStarting"
            : "navigation.desktop.ipfsUnavailable"
      );

  return (
    <a
      href={ready ? ipfsUrls?.webui : off ? settingsHref : undefined}
      role={ready || off ? undefined : "link"}
      tabIndex={0}
      target={ready ? "_blank" : undefined}
      rel={ready ? "noopener noreferrer" : undefined}
      aria-disabled={ready || off ? undefined : true}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className={`${className} ${
        ready || off
          ? "tw-cursor-pointer tw-text-iron-300 desktop-hover:hover:tw-bg-iron-700/50 desktop-hover:hover:tw-text-white"
          : "tw-cursor-not-allowed tw-text-iron-500"
      }`}
      onClick={(event) => {
        if (off) {
          event.preventDefault();
          onNavigate?.();
          router.push(settingsHref);
          return;
        }
        if (!ready) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onNavigate?.();
      }}
      onAuxClick={(event) => {
        if (off && event.button === 1) {
          event.preventDefault();
          onNavigate?.();
          router.push(settingsHref);
        }
      }}
    >
      <span className="tw-flex tw-min-w-0 tw-items-center tw-gap-2">
        <span className="tw-truncate">{label}</span>
        {off ? (
          <span
            aria-hidden="true"
            className="tw-rounded-md tw-bg-iron-800 tw-px-1.5 tw-py-0.5 tw-text-xs tw-font-medium tw-text-iron-300"
          >
            {t(DEFAULT_LOCALE, "navigation.desktop.ipfsOff")}
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="tw-flex tw-h-4 tw-w-4 tw-flex-shrink-0 tw-items-center tw-justify-center motion-reduce:[&_svg]:tw-animate-none"
          >
            {starting && !ready ? (
              <CircleLoader size={CircleLoaderSize.SMALL} />
            ) : (
              <FontAwesomeIcon
                aria-hidden="true"
                icon={ready ? faExternalLinkAlt : faTriangleExclamation}
                className="tw-h-4 tw-w-4"
              />
            )}
          </span>
        )}
      </span>
    </a>
  );
}
