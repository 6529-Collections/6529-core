"use client";

import {
  Popover,
  PopoverBackdrop,
  PopoverButton,
  PopoverPanel,
} from "@headlessui/react";
import {
  faCheck,
  faCircleInfo,
  faExternalLinkAlt,
  faMinus,
  faPause,
  faQuestion,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useId } from "react";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import {
  useDesktopValidatorStatus,
  useOpenDesktopValidator,
} from "@/hooks/useDesktopValidator";
import {
  formatInteger,
  formatPercent,
  formatTime,
  formatUtcDate,
  selectPluralCategory,
} from "@/i18n/format";
import type { SupportedLocale } from "@/i18n/locales";
import { t } from "@/i18n/messages";
import ValidatorResult from "./ValidatorResult";
import styles from "./TitleBar.module.css";

const HEALTH_LABEL = {
  "all-good": "navigation.desktop.validatorAllGood",
  "getting-ready": "navigation.desktop.validatorGettingReady",
  paused: "navigation.desktop.validatorPaused",
  "not-signing": "navigation.desktop.validatorNotSigning",
  "needs-attention": "navigation.desktop.validatorAttention",
  "update-available": "navigation.desktop.validatorUpdateAvailable",
  "update-needed": "navigation.desktop.validatorUpdateNeeded",
  stopped: "navigation.desktop.validatorStopped",
  unavailable: "navigation.desktop.validatorUnavailable",
} as const;

const SIGNING_LABEL = {
  counted: "navigation.desktop.validatorCounted",
  signed: "navigation.desktop.validatorSigned",
  "not-signed": "navigation.desktop.validatorNotSigned",
} as const;

const NEUTRAL_PANEL = "tw-border-iron-700 tw-bg-iron-800";

const TONE = {
  good: { iconColor: "tw-text-emerald-300", panelTone: NEUTRAL_PANEL },
  alert: {
    iconColor: "tw-text-amber-300",
    panelTone: "tw-border-amber-500/30 tw-bg-amber-500/10",
  },
  info: { iconColor: "tw-text-primary-300", panelTone: NEUTRAL_PANEL },
  neutral: { iconColor: "tw-text-iron-300", panelTone: NEUTRAL_PANEL },
} as const;

const HEALTH_STYLE = {
  "all-good": { icon: faCheck, tone: TONE.good },
  "getting-ready": { icon: faCircleInfo, tone: TONE.neutral },
  paused: { icon: faPause, tone: TONE.neutral },
  "not-signing": { icon: faMinus, tone: TONE.neutral },
  "needs-attention": { icon: faTriangleExclamation, tone: TONE.alert },
  "update-available": { icon: faCircleInfo, tone: TONE.info },
  "update-needed": { icon: faTriangleExclamation, tone: TONE.alert },
  stopped: { icon: faMinus, tone: TONE.neutral },
  unavailable: { icon: faQuestion, tone: TONE.alert },
} as const;

function nextSignatureWords(locale: SupportedLocale, unix: number) {
  const date = new Date(unix * 1000);
  const day = formatUtcDate(locale, date, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = formatTime(locale, date, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  });
  return { day, time };
}

function StatusRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="tw-flex tw-min-h-11 tw-items-center tw-justify-between tw-gap-3 tw-border-0 tw-border-b tw-border-solid tw-border-iron-700 tw-py-1 last:tw-border-b-0">
      <dt className="tw-shrink-0 tw-text-iron-300">{label}</dt>
      <dd className="tw-m-0 tw-min-w-0 tw-break-words tw-text-right">
        {children}
      </dd>
    </div>
  );
}

export default function DesktopValidatorStatus({
  align,
}: {
  readonly align: "left" | "right";
}) {
  const status = useDesktopValidatorStatus(true);
  const openValidator = useOpenDesktopValidator();
  const locale = useBrowserLocale();
  const statusId = useId();

  if (!status || status.service === "not-installed") return null;

  const running = status.service === "running" ? status : null;
  const health = status.service === "running" ? status.health : status.service;
  const label = t(locale, HEALTH_LABEL[health]);
  const title = t(locale, "navigation.desktop.validatorTitle");
  const {
    icon,
    tone: { iconColor, panelTone },
  } = HEALTH_STYLE[health];
  const showChipLabel =
    health === "update-needed" ||
    health === "update-available" ||
    health === "needs-attention" ||
    health === "unavailable";
  const release = running?.release;
  const releaseBadge = release?.match(/rc\.\d+$/)?.[0] ?? release;
  const next = running?.nextSignatureAt;
  const networkAgreement = running?.networkAgreement;

  return (
    <Popover
      className={`tailwind-scope tw-relative tw-flex tw-min-w-0 ${styles["validatorControl"]}`}
    >
      <PopoverButton
        aria-describedby={showChipLabel ? undefined : statusId}
        className={`tw-relative tw-z-[1] tw-flex tw-h-[22px] tw-min-w-0 tw-items-center tw-gap-1 tw-whitespace-nowrap tw-rounded tw-border tw-border-solid tw-border-iron-700 tw-bg-transparent tw-px-1.5 tw-text-iron-100 hover:tw-bg-iron-900 focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-primary-400 aria-expanded:tw-border-iron-500 aria-expanded:tw-bg-iron-800 ${styles["validatorChip"]}`}
      >
        <FontAwesomeIcon
          aria-hidden="true"
          icon={icon}
          className={`tw-size-2.5 tw-shrink-0 ${iconColor}`}
        />
        <span className="tw-truncate">
          {title}
          {showChipLabel && ` · ${label}`}
        </span>
      </PopoverButton>
      <span id={statusId} className="tw-sr-only">
        {label}
      </span>

      <PopoverBackdrop
        className={`tw-fixed tw-inset-0 tw-z-0 ${styles["validatorControl"]}`}
      />
      <PopoverPanel
        anchor={{
          to: align === "right" ? "bottom end" : "bottom start",
          gap: 8,
          padding: 8,
        }}
        className={`tailwind-scope tw-z-[1001] tw-w-[360px] tw-max-w-[calc(100vw-1rem)] tw-rounded-lg tw-border tw-border-solid tw-border-iron-700 tw-bg-iron-900 tw-p-3.5 tw-font-sans tw-text-sm tw-text-iron-100 tw-shadow-xl ${styles["validatorControl"]}`}
      >
        {({ close }) => (
          <>
            <div className="tw-mb-2.5 tw-flex tw-items-center tw-justify-between tw-gap-2">
              <span className="tw-font-semibold">{title}</span>
              {releaseBadge && (
                <span
                  title={release}
                  className="tw-truncate tw-rounded tw-border tw-border-solid tw-border-iron-700 tw-bg-iron-800 tw-px-1.5 tw-font-mono tw-text-xs tw-text-iron-300"
                >
                  {releaseBadge}
                </span>
              )}
            </div>
            <div
              className={`tw-rounded-md tw-border tw-border-solid tw-px-2.5 tw-py-2 ${panelTone}`}
            >
              <div className="tw-flex tw-items-center tw-gap-1.5 tw-font-semibold">
                <FontAwesomeIcon
                  aria-hidden="true"
                  icon={icon}
                  className={`tw-size-3 tw-shrink-0 ${iconColor}`}
                />
                {label}
              </div>
              {health === "all-good" && (
                <p className="tw-m-0 tw-text-[11px] tw-leading-4 tw-text-iron-300">
                  {t(locale, "navigation.desktop.validatorNothingToDo")}
                </p>
              )}
              {health === "update-needed" && (
                <p className="tw-m-0 tw-text-xs tw-text-iron-300">
                  {t(locale, "navigation.desktop.validatorUpdateAction")}
                </p>
              )}
            </div>
            <dl className="tw-mb-3.5 tw-mt-2 tw-text-xs">
              {status.service !== "unavailable" && (
                <StatusRow
                  label={t(locale, "navigation.desktop.validatorService")}
                >
                  {t(
                    locale,
                    running
                      ? "navigation.desktop.validatorRunning"
                      : "navigation.desktop.validatorStopped"
                  )}
                </StatusRow>
              )}
              {running && (
                <StatusRow
                  label={t(locale, "navigation.desktop.validatorToday")}
                >
                  {t(locale, SIGNING_LABEL[running.signing])}
                </StatusRow>
              )}
              {running?.resultRoot && (
                <StatusRow
                  label={t(locale, "navigation.desktop.validatorResult")}
                >
                  <ValidatorResult root={running.resultRoot} />
                </StatusRow>
              )}
              {networkAgreement && (
                <StatusRow
                  label={t(locale, "navigation.desktop.validatorNetwork")}
                >
                  {t(
                    locale,
                    selectPluralCategory(
                      locale,
                      networkAgreement.signingAccounts
                    ) === "one"
                      ? "navigation.desktop.validatorNetworkSummary.one"
                      : "navigation.desktop.validatorNetworkSummary.other",
                    {
                      accounts: formatInteger(
                        locale,
                        networkAgreement.signingAccounts
                      ),
                      share: formatPercent(locale, networkAgreement.signedTdhShare),
                    }
                  )}
                </StatusRow>
              )}
              {next !== undefined && (
                <StatusRow
                  label={t(locale, "navigation.desktop.validatorNextSignature")}
                >
                  {t(
                    locale,
                    "navigation.desktop.validatorNextSignatureTime",
                    nextSignatureWords(locale, next)
                  )}
                </StatusRow>
              )}
            </dl>
            <button
              type="button"
              disabled={openValidator.isPending}
              onClick={() =>
                openValidator.mutate(undefined, { onSuccess: () => close() })
              }
              className="tw-flex tw-min-h-11 tw-w-full tw-items-center tw-justify-between tw-gap-3 tw-rounded-lg tw-border tw-border-solid tw-border-iron-700 tw-bg-iron-800 tw-px-3 tw-py-2 tw-text-left tw-font-semibold hover:tw-bg-iron-700 focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-primary-400 disabled:tw-opacity-60"
            >
              {t(locale, "navigation.desktop.validatorOpen")}
              <FontAwesomeIcon
                aria-hidden="true"
                icon={faExternalLinkAlt}
                className="tw-h-4 tw-w-4 tw-shrink-0 tw-text-iron-300"
              />
            </button>
            <p
              role="alert"
              className="tw-text-red-300 tw-mb-0 tw-mt-2 tw-text-xs empty:tw-mt-0"
            >
              {openValidator.isError &&
                t(locale, "navigation.desktop.validatorOpenFailed")}
            </p>
          </>
        )}
      </PopoverPanel>
    </Popover>
  );
}
