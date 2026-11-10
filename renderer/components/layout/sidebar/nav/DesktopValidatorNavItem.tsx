"use client";

import { faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { useOpenDesktopValidator } from "@/hooks/useDesktopValidator";
import { t } from "@/i18n/messages";

export default function DesktopValidatorNavItem({
  className,
  onNavigate,
}: {
  readonly className: string;
  readonly onNavigate?: (() => void) | undefined;
}) {
  const openValidator = useOpenDesktopValidator();
  const locale = useBrowserLocale();
  return (
    <>
      <button
        type="button"
        disabled={openValidator.isPending}
        onClick={() =>
          openValidator.mutate(undefined, { onSuccess: () => onNavigate?.() })
        }
        className={`${className} tw-cursor-pointer tw-gap-2 tw-border-0 tw-bg-transparent tw-text-left tw-font-medium tw-text-iron-300 disabled:tw-opacity-60 desktop-hover:hover:tw-bg-iron-700/50 desktop-hover:hover:tw-text-white`}
      >
        <span>{t(locale, "navigation.desktop.validatorTitle")}</span>
        <FontAwesomeIcon
          aria-hidden="true"
          icon={faExternalLinkAlt}
          className="tw-h-3 tw-w-3 tw-shrink-0"
        />
      </button>
      <p
        role="alert"
        className="tw-text-red-300 tw-mx-3 tw-mb-2 tw-mt-0 tw-text-xs empty:tw-mb-0"
      >
        {openValidator.isError &&
          t(locale, "navigation.desktop.validatorOpenFailed")}
      </p>
    </>
  );
}
