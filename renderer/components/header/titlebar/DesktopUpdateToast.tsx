"use client";

import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { t } from "@/i18n/messages";
import { type JSX } from "react";

const SGT_SALUTING_IMAGE = (
  // react-doctor-disable-next-line react-doctor/nextjs-no-img-element Matches the frontend version toast's decorative emoji behavior.
  <img
    src="/emojis/sgt_saluting_face.webp"
    alt=""
    className="tw-size-[18px] tw-flex-shrink-0 tw-self-end tw-opacity-85"
  />
);

const ROCKET_UPDATE_IMAGE = (
  // react-doctor-disable-next-line react-doctor/nextjs-no-img-element Matches the frontend version toast's decorative asset behavior.
  <img
    src="/rocket-refresh.png"
    alt=""
    className="tw-relative tw-z-10 tw-h-12 tw-w-auto tw-flex-shrink-0 tw-text-[#dfffe8] tw-transition-all tw-duration-200 tw-ease-out group-active:tw-scale-[0.985] desktop-hover:group-hover:tw-brightness-150 desktop-hover:group-hover:tw-saturate-150"
  />
);

export default function DesktopUpdateToast({
  onViewUpdate,
  open,
  version,
}: {
  readonly onViewUpdate: () => void;
  readonly open: boolean;
  readonly version: string;
}): JSX.Element | null {
  const locale = useBrowserLocale();

  if (!open) {
    return null;
  }

  const viewUpdateLabel = t(locale, "desktopUpdateToast.viewUpdate");

  return (
    <div className="tailwind-scope tw-pointer-events-none tw-fixed tw-bottom-7 tw-right-7 tw-z-[10000] tw-w-[420px]">
      <button
        type="button"
        aria-label={viewUpdateLabel}
        title={viewUpdateLabel}
        onClick={onViewUpdate}
        className="toast-shell tw-group tw-pointer-events-auto tw-relative tw-ml-auto tw-flex tw-w-full tw-animate-fadeIn tw-cursor-pointer tw-items-center tw-justify-between tw-gap-4 tw-overflow-hidden tw-rounded-[18px] tw-border-none tw-bg-[#15191b] tw-px-[18px] tw-py-2 tw-text-iron-50 tw-shadow-[0_0_0_1px_rgba(126,158,134,0.34),_0_2px_12px_rgba(0,0,0,0.36),_0_18px_40px_rgba(0,0,0,0.60),_0_0_34px_rgba(49,205,105,0.15),_inset_0_1px_0_rgba(255,255,255,0.07),_inset_0_-1px_0_rgba(49,205,105,0.08)] tw-backdrop-blur-xl tw-transition-[box-shadow,transform] tw-duration-200 tw-ease-out before:tw-pointer-events-none before:tw-absolute before:tw-inset-0 before:tw-origin-[82%_50%] before:tw-scale-95 before:tw-bg-[radial-gradient(circle_at_82%_50%,rgba(42,185,82,0.34),rgba(18,44,29,0.20)_32%,transparent_64%)] before:tw-opacity-0 before:tw-transition-[opacity,transform] before:tw-duration-200 before:tw-ease-out before:tw-content-[''] focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-inset focus-visible:tw-ring-[#95ffad] active:tw-scale-[0.985] desktop-hover:hover:tw-shadow-[0_0_0_1px_rgba(66,168,84,0.50),_0_2px_12px_rgba(0,0,0,0.34),_0_18px_40px_rgba(0,0,0,0.56),_0_0_16px_rgba(49,205,105,0.12),_inset_0_1px_0_rgba(153,255,176,0.12),_inset_0_0_20px_rgba(35,126,61,0.12)] desktop-hover:hover:before:tw-scale-100 desktop-hover:hover:before:tw-opacity-100"
      >
        <div className="tw-relative tw-z-10 tw-min-w-0 tw-pr-2 tw-text-left">
          <div className="tw-whitespace-nowrap tw-text-base tw-font-bold tw-leading-tight tw-text-[#f5f7f6]">
            {t(locale, "desktopUpdateToast.versionAvailable", { version })}
          </div>
          <div className="tw-mt-0.5 tw-flex tw-items-center tw-gap-1 tw-text-sm tw-font-semibold tw-leading-none tw-text-[#b9c0c4]">
            <span>{viewUpdateLabel} →</span>
            {SGT_SALUTING_IMAGE}
          </div>
        </div>
        <span className="tw-relative tw-z-10 tw-flex tw-h-14 tw-w-fit tw-flex-shrink-0 tw-items-center tw-justify-center">
          {ROCKET_UPDATE_IMAGE}
        </span>
      </button>
    </div>
  );
}
