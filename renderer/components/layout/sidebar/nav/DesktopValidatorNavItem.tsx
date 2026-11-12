"use client";

import { ArrowUpRightIcon } from "@heroicons/react/24/outline";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import {
  useDesktopValidatorInstallation,
  useOpenDesktopValidator,
} from "@/hooks/useDesktopValidator";
import { t } from "@/i18n/messages";
import { DESKTOP_VALIDATOR_DOWNLOAD_URL } from "@/shared/desktop-validator";

export default function DesktopValidatorNavItem({
  className,
  onNavigate,
}: {
  readonly className: string;
  readonly onNavigate?: (() => void) | undefined;
}) {
  const locale = useBrowserLocale();
  const { supported, installed, isError } = useDesktopValidatorInstallation();
  const openValidator = useOpenDesktopValidator();

  if (!supported) return null;

  const actionClassName = `${className} tw-gap-2 tw-bg-transparent tw-text-left tw-text-iron-300 desktop-hover:hover:tw-bg-iron-700/50 desktop-hover:hover:tw-text-white`;

  if (installed === false) {
    return (
      <a
        href={DESKTOP_VALIDATOR_DOWNLOAD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={actionClassName}
        onClick={onNavigate}
      >
        <span className="tw-min-w-0 tw-break-words">
          {t(locale, "navigation.desktop.validatorGet")}
        </span>
        <ArrowUpRightIcon aria-hidden="true" className="tw-size-4 tw-shrink-0" />
      </a>
    );
  }

  const canOpen = installed === true || isError;

  return (
    <>
      <button
        type="button"
        className={`${actionClassName} tw-border-0`}
        disabled={!canOpen}
        aria-disabled={openValidator.isPending}
        onClick={() => {
          if (!openValidator.isPending) {
            openValidator.mutate(undefined, { onSuccess: () => onNavigate?.() });
          }
        }}
      >
        <span className="tw-min-w-0 tw-break-words">
          {t(
            locale,
            canOpen
              ? "navigation.desktop.validatorOpen"
              : "navigation.desktop.validatorTitle"
          )}
        </span>
        {canOpen && (
          <ArrowUpRightIcon aria-hidden="true" className="tw-size-4 tw-shrink-0" />
        )}
      </button>
      {openValidator.isError && (
        <p role="alert" className="tw-text-red-300 tw-mx-3 tw-my-1 tw-text-sm">
          {t(locale, "navigation.desktop.validatorOpenFailed")}
        </p>
      )}
    </>
  );
}
