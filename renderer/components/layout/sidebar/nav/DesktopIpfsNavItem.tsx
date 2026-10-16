"use client";

import { useIpfsContext } from "@/components/ipfs/IPFSContext";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { t } from "@/i18n/messages";
import {
  faExternalLinkAlt,
  faSpinner,
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
  const ready = ipfsStatus === "ready" && Boolean(ipfsUrls?.webui);
  const starting = ipfsStatus === "starting" || ipfsStatus === "stopped";
  const label = t(DEFAULT_LOCALE, "navigation.desktop.myIpfs");
  const accessibleLabel = ready
    ? label
    : t(
        DEFAULT_LOCALE,
        starting
          ? "navigation.desktop.ipfsStarting"
          : "navigation.desktop.ipfsUnavailable"
      );

  return (
    <a
      href={ready ? ipfsUrls?.webui : undefined}
      role={ready ? undefined : "link"}
      tabIndex={0}
      target={ready ? "_blank" : undefined}
      rel={ready ? "noopener noreferrer" : undefined}
      aria-disabled={ready ? undefined : true}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className={`${className} ${
        ready
          ? "tw-cursor-pointer tw-text-iron-300 desktop-hover:hover:tw-bg-iron-700/50 desktop-hover:hover:tw-text-white"
          : "tw-cursor-not-allowed tw-text-iron-500"
      }`}
      onClick={(event) => {
        if (!ready) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onNavigate?.();
      }}
    >
      <span className="tw-flex tw-min-w-0 tw-items-center tw-gap-2">
        <span className="tw-truncate">{label}</span>
        <FontAwesomeIcon
          aria-hidden="true"
          icon={
            ready
              ? faExternalLinkAlt
              : starting
                ? faSpinner
                : faTriangleExclamation
          }
          className={`tw-h-4 tw-w-4 tw-flex-shrink-0 ${
            starting && !ready ? "motion-safe:tw-animate-spin" : ""
          }`}
        />
      </span>
    </a>
  );
}
