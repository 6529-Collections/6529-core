"use client";

import { faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import {
  useDesktopValidatorInstallation,
  useOpenDesktopValidator,
} from "@/hooks/useDesktopValidator";
import { t } from "@/i18n/messages";

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

  const checking = installed === undefined && !isError;
  const busy = checking || openValidator.isPending;
  const label = checking
    ? "navigation.desktop.validatorCheckingInstallation"
    : installed === false
      ? "navigation.desktop.validatorGet"
      : "navigation.desktop.validatorTitle";

  return (
    <>
      <button
        type="button"
        className={`${actionClassName} tw-border-0`}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        onClick={() => {
          if (!busy) {
            openValidator.mutate(undefined, { onSuccess: () => onNavigate?.() });
          }
        }}
      >
        <span className="tw-min-w-0 tw-break-words">
          {t(locale, label)}
        </span>
        {!checking && (
          <FontAwesomeIcon
            aria-hidden="true"
            icon={faExternalLinkAlt}
            className="tw-h-4 tw-w-4 tw-shrink-0"
          />
        )}
      </button>
      <div role="alert">
        {openValidator.isError && (
          <p className="tw-text-red-300 tw-mx-3 tw-my-1 tw-text-sm">
            {t(locale, "navigation.desktop.validatorOpenFailed")}
          </p>
        )}
      </div>
    </>
  );
}
