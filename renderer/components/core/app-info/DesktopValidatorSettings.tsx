"use client";

import { ArrowUpRightIcon } from "@heroicons/react/24/outline";
import { useId } from "react";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import {
  useDesktopValidatorInstallation,
  useDesktopValidatorVisibility,
  useSetDesktopValidatorVisibility,
} from "@/hooks/useDesktopValidator";
import { t } from "@/i18n/messages";
import { DESKTOP_VALIDATOR_DOWNLOAD_URL } from "@/shared/desktop-validator";

export default function DesktopValidatorSettings() {
  const locale = useBrowserLocale();
  const id = useId();
  const installation = useDesktopValidatorInstallation();
  const visibility = useDesktopValidatorVisibility();
  const setVisibility = useSetDesktopValidatorVisibility();

  if (!installation.supported) return null;

  const showPreferenceError =
    installation.installed === true &&
    (visibility.isError || setVisibility.isError);

  return (
    <section
      aria-labelledby={`${id}-label`}
      className="tw-mt-6 tw-rounded-xl tw-bg-iron-950 tw-p-4 tw-text-white tw-ring-1 tw-ring-inset tw-ring-iron-800"
    >
      <div className="tw-flex tw-flex-col tw-items-start tw-justify-between tw-gap-4 sm:tw-flex-row">
        <div>
          <h2 id={`${id}-label`} className="tw-m-0 tw-text-xl tw-font-semibold">
            {t(locale, "desktop.about.showValidator")}
          </h2>
          <p id={`${id}-help`} className="tw-mb-0 tw-mt-2 tw-text-sm">
            {t(
              locale,
              installation.installed === true
                ? "desktop.about.showValidatorHelp"
                : "desktop.about.showValidatorInstallHelp"
            )}
          </p>
        </div>
        {installation.installed === false && (
          <div className="tw-text-sm sm:tw-max-w-[45%] sm:tw-shrink-0 sm:tw-text-right">
            <p className="tw-m-0 tw-text-iron-300">
              {t(locale, "desktop.about.validatorNotInstalled")}
            </p>
            <a
              href={DESKTOP_VALIDATOR_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="tw-mt-1 tw-inline-flex tw-min-h-6 tw-items-center tw-gap-1.5 tw-rounded tw-font-medium tw-text-primary-300 tw-underline focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-primary-400"
            >
              {t(locale, "navigation.desktop.validatorGet")}
              <ArrowUpRightIcon
                aria-hidden="true"
                className="tw-size-3.5 tw-shrink-0"
              />
            </a>
          </div>
        )}
        {installation.installed === true && visibility.data !== undefined && (
          <label className="tw-relative tw-inline-flex tw-min-h-11 tw-w-11 tw-shrink-0 tw-cursor-pointer tw-items-center">
            <input
              type="checkbox"
              role="switch"
              checked={visibility.data}
              aria-labelledby={`${id}-label`}
              aria-describedby={`${id}-help`}
              aria-disabled={setVisibility.isPending}
              onChange={(event) => {
                if (!setVisibility.isPending)
                  setVisibility.mutate(event.target.checked);
              }}
              className="tw-peer tw-sr-only"
            />
            <span
              aria-hidden="true"
              className="tw-inline-flex tw-h-6 tw-w-11 tw-items-center tw-rounded-full tw-bg-iron-600 tw-p-1 tw-ring-1 tw-ring-inset tw-ring-white/20 tw-transition-colors peer-checked:tw-bg-primary-500 peer-focus-visible:tw-ring-2 peer-focus-visible:tw-ring-primary-300 peer-focus-visible:tw-ring-offset-2 peer-focus-visible:tw-ring-offset-iron-950 motion-reduce:tw-transition-none"
            >
              <span
                className={`tw-size-4 tw-rounded-full tw-bg-iron-50 tw-shadow-sm tw-transition-transform motion-reduce:tw-transition-none ${visibility.data ? "tw-translate-x-5" : ""}`}
              />
            </span>
          </label>
        )}
      </div>
      {installation.isError && installation.installed === undefined && (
        <p role="alert" className="tw-text-red-300 tw-mb-0 tw-mt-2 tw-text-sm">
          {t(locale, "desktop.about.validatorInstallationError")}
        </p>
      )}
      {showPreferenceError && (
        <p role="alert" className="tw-text-red-300 tw-mb-0 tw-mt-2 tw-text-sm">
          {t(
            locale,
            visibility.isError
              ? "desktop.about.showValidatorLoadError"
              : "desktop.about.showValidatorSaveError"
          )}
        </p>
      )}
    </section>
  );
}
