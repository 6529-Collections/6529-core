"use client";

import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import {
  useDesktopValidatorStatus,
  useOpenDesktopValidator,
} from "@/hooks/useDesktopValidator";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { t } from "@/i18n/messages";
import styles from "./TitleBar.module.css";

const STATUS_LABEL = {
  stopped: "navigation.desktop.validatorStopped",
  running: "navigation.desktop.validatorRunning",
  signed: "navigation.desktop.validatorSigned",
  unavailable: "navigation.desktop.validatorUnavailable",
} as const;

const STATUS_COLOR = {
  stopped: "tw-bg-iron-500",
  running: "tw-bg-amber-400",
  signed: "tw-bg-emerald-400",
  unavailable: "tw-bg-iron-500",
} as const;

export default function DesktopValidatorStatus({
  align,
}: {
  readonly align: "left" | "right";
}) {
  const status = useDesktopValidatorStatus(true);
  const openValidator = useOpenDesktopValidator();

  if (!status || status === "not-installed") return null;

  const label = t(DEFAULT_LOCALE, STATUS_LABEL[status]);
  const title = t(DEFAULT_LOCALE, "navigation.desktop.validatorTitle");

  return (
    <Popover
      className={`tailwind-scope tw-relative tw-flex tw-font-sans ${styles["validatorControl"]}`}
    >
      <PopoverButton
        aria-label={`${title} — ${label}`}
        className="tw-flex tw-h-5 tw-items-center tw-gap-1.5 tw-whitespace-nowrap tw-rounded tw-border tw-border-solid tw-border-iron-700 tw-bg-iron-950 tw-px-1.5 tw-text-iron-200 hover:tw-bg-iron-800 focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-primary-400"
      >
        <span
          aria-hidden="true"
          className={`tw-size-1.5 tw-rounded-full ${STATUS_COLOR[status]}`}
        />
        {t(DEFAULT_LOCALE, "navigation.desktop.validatorChip")}
      </PopoverButton>

      <PopoverPanel
        className={`tw-absolute tw-top-full tw-mt-2 tw-w-56 tw-rounded-lg tw-border tw-border-solid tw-border-iron-700 tw-bg-iron-900 tw-p-3 tw-text-sm tw-text-iron-100 tw-shadow-xl ${align === "right" ? "tw-right-0" : "tw-left-0"}`}
      >
        {({ close }) => (
          <>
            <div className="tw-font-semibold">{title}</div>
            <p className="tw-mb-3 tw-mt-1 tw-text-xs tw-text-iron-300">
              {label}
            </p>
            <button
              type="button"
              disabled={openValidator.isPending}
              onClick={() =>
                openValidator.mutate(undefined, { onSuccess: () => close() })
              }
              className="tw-w-full tw-rounded-md tw-border tw-border-solid tw-border-iron-700 tw-bg-iron-800 tw-px-2 tw-py-1.5 tw-text-left hover:tw-bg-iron-700 disabled:tw-opacity-60"
            >
              {t(DEFAULT_LOCALE, "navigation.desktop.validatorOpen")} ↗
            </button>
            {openValidator.isError && (
              <p
                role="alert"
                className="tw-text-red-300 tw-mb-0 tw-mt-2 tw-text-xs"
              >
                {t(DEFAULT_LOCALE, "navigation.desktop.validatorOpenFailed")}
              </p>
            )}
          </>
        )}
      </PopoverPanel>
    </Popover>
  );
}
