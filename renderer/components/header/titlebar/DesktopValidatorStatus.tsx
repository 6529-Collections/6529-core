"use client";

import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import {
  faArrowUpRightFromSquare,
  faCheck,
  faMinus,
  faPlay,
  faQuestion,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useId } from "react";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import {
  useDesktopValidatorStatus,
  useOpenDesktopValidator,
} from "@/hooks/useDesktopValidator";
import { t } from "@/i18n/messages";
import styles from "./TitleBar.module.css";

const STATUS_LABEL = {
  stopped: "navigation.desktop.validatorStopped",
  running: "navigation.desktop.validatorRunning",
  signed: "navigation.desktop.validatorSigned",
  unavailable: "navigation.desktop.validatorUnavailable",
} as const;

const STATUS_MARKER = {
  stopped: { icon: faMinus, color: "tw-text-iron-300" },
  running: { icon: faPlay, color: "tw-text-amber-400" },
  signed: { icon: faCheck, color: "tw-text-emerald-400" },
  unavailable: { icon: faQuestion, color: "tw-text-iron-300" },
} as const;

export default function DesktopValidatorStatus({
  align,
}: {
  readonly align: "left" | "right";
}) {
  const status = useDesktopValidatorStatus(true);
  const openValidator = useOpenDesktopValidator();
  const locale = useBrowserLocale();
  const statusId = useId();

  if (!status || status === "not-installed") return null;

  const label = t(locale, STATUS_LABEL[status]);
  const title = t(locale, "navigation.desktop.validatorTitle");
  const marker = STATUS_MARKER[status];

  return (
    <Popover
      className={`tailwind-scope tw-relative tw-flex tw-font-sans ${styles["validatorControl"]}`}
    >
      <PopoverButton
        aria-describedby={statusId}
        className="tw-flex tw-h-5 tw-items-center tw-gap-1.5 tw-whitespace-nowrap tw-rounded tw-border tw-border-solid tw-border-iron-700 tw-bg-iron-950 tw-px-1.5 tw-text-iron-200 hover:tw-bg-iron-800 focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-primary-400"
      >
        <FontAwesomeIcon
          aria-hidden="true"
          icon={marker.icon}
          className={`tw-size-2.5 ${marker.color}`}
        />
        {t(locale, "navigation.desktop.validatorChip")}
      </PopoverButton>
      <span id={statusId} className="tw-sr-only">
        {label}
      </span>

      <PopoverPanel
        className={`tw-absolute tw-top-full tw-mt-2 tw-w-56 tw-rounded-lg tw-border tw-border-solid tw-border-iron-700 tw-bg-iron-900 tw-p-3 tw-text-sm tw-text-iron-100 tw-shadow-xl ${align === "right" ? "tw-right-0" : "tw-left-0"}`}
      >
        {({ close }) => (
          <>
            <div className="tw-font-semibold">{title}</div>
            <p className="tw-mb-3 tw-mt-1 tw-text-xs tw-text-iron-300">{label}</p>
            <button
              type="button"
              disabled={openValidator.isPending}
              onClick={() =>
                openValidator.mutate(undefined, { onSuccess: () => close() })
              }
              className="tw-flex tw-w-full tw-items-center tw-gap-2 tw-rounded-md tw-border tw-border-solid tw-border-iron-700 tw-bg-iron-800 tw-px-2 tw-py-1.5 tw-text-left hover:tw-bg-iron-700 disabled:tw-opacity-60"
            >
              {t(locale, "navigation.desktop.validatorOpen")}
              <FontAwesomeIcon
                aria-hidden="true"
                icon={faArrowUpRightFromSquare}
                className="tw-size-3 tw-shrink-0"
              />
            </button>
            <p
              role="alert"
              className="tw-mb-0 tw-mt-2 tw-text-xs tw-text-red-300 empty:tw-mt-0"
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
