"use client";

import { faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  useDesktopValidatorStatus,
  useOpenDesktopValidator,
} from "@/hooks/useDesktopValidator";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { t } from "@/i18n/messages";

export default function DesktopValidatorNavItem({
  className,
  onNavigate,
}: {
  readonly className: string;
  readonly onNavigate?: (() => void) | undefined;
}) {
  const status = useDesktopValidatorStatus();
  const openValidator = useOpenDesktopValidator();
  const label = t(
    DEFAULT_LOCALE,
    status === "not-installed"
      ? "navigation.desktop.validatorGet"
      : "navigation.desktop.validatorTitle"
  );

  return (
    <>
      <button
        type="button"
        disabled={openValidator.isPending || status === undefined}
        onClick={() =>
          openValidator.mutate(undefined, { onSuccess: () => onNavigate?.() })
        }
        className={`${className} tw-cursor-pointer tw-gap-2 tw-border-0 tw-bg-transparent tw-text-left tw-text-iron-300 disabled:tw-opacity-60 desktop-hover:hover:tw-bg-iron-700/50 desktop-hover:hover:tw-text-white`}
      >
        <span>{label}</span>
        <FontAwesomeIcon
          aria-hidden="true"
          icon={faExternalLinkAlt}
          className="tw-size-3 tw-shrink-0"
        />
      </button>
      {openValidator.isError && (
        <p
          role="alert"
          className="tw-text-red-300 tw-mx-3 tw-mb-2 tw-mt-0 tw-text-xs"
        >
          {t(DEFAULT_LOCALE, "navigation.desktop.validatorOpenFailed")}
        </p>
      )}
    </>
  );
}
