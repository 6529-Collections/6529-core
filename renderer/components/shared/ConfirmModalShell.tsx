"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export const confirmModalHeader =
  "tw-p-4 tw-bg-iron-950 tw-text-iron-100 tw-rounded-t tw-border-0 tw-border-b tw-border-solid tw-border-iron-800";
export const confirmModalBody =
  "tw-bg-iron-950 tw-text-iron-100 tw-border-0 tw-border-b tw-border-solid tw-border-iron-800 tw-p-4";
export const confirmModalFooter =
  "tw-bg-iron-950 tw-text-iron-100 tw-border-0 tw-border-t tw-border-solid tw-border-iron-800 tw-rounded-b tw-p-4 tw-flex tw-gap-2 tw-justify-end";
export const confirmModalFooterBetween =
  "tw-bg-iron-950 tw-text-iron-100 tw-border-0 tw-border-t tw-border-solid tw-border-iron-800 tw-rounded-b tw-p-4 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2";

export const confirmBtnSecondary =
  "tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-iron-700 tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-iron-100 tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-iron-500 desktop-hover:hover:tw-bg-iron-600";
export const confirmBtnPrimary =
  "tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 desktop-hover:hover:tw-bg-primary-600 disabled:tw-opacity-50";
export const confirmBtnDanger =
  "tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-[#dc2626] tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-red focus-visible:tw-ring-offset-2 focus-visible:tw-ring-offset-iron-950 desktop-hover:hover:tw-bg-[#ef4444]";
export const confirmBtnSecondarySmall =
  "tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-iron-700 tw-px-3 tw-py-1.5 tw-text-sm tw-font-medium tw-text-iron-100 tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-iron-500 desktop-hover:hover:tw-bg-iron-600";
export const confirmBtnPrimaryWithIcon =
  "tw-cursor-pointer tw-inline-flex tw-items-center tw-gap-1 tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 desktop-hover:hover:tw-bg-primary-600";

export const confirmInputClass =
  "tw-h-10 tw-w-full tw-rounded-lg tw-border-0 tw-bg-iron-800 tw-px-3 tw-py-2 tw-text-iron-100 tw-outline-none placeholder:tw-text-iron-500 focus:tw-ring-2 focus:tw-ring-primary-400";

const dialogBase =
  "tw-max-h-[90vh] tw-w-full tw-max-w-lg tw-overflow-auto tw-rounded-xl tw-bg-iron-950 tw-shadow-xl tw-ring-1 tw-ring-iron-800";

export function ConfirmModalShell(props: {
  show: boolean;
  title: ReactNode;
  children?: ReactNode;
  footer: ReactNode;
  onBackdropClick?: () => void;
  dialogClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  titleClassName?: string;
}) {
  const {
    show,
    title,
    children,
    footer,
    onBackdropClick,
    dialogClassName = "",
    bodyClassName = "",
    footerClassName = confirmModalFooter,
    titleClassName = "tw-m-0 tw-text-lg tw-font-semibold",
  } = props;

  if (!show) return null;

  const overlay = (
    <div
      className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-bg-black/50"
      onClick={onBackdropClick}
      role="dialog"
      aria-modal
    >
      <div
        className={`${dialogBase} ${dialogClassName}`.trim()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={confirmModalHeader}>
          <h2 className={titleClassName}>{title}</h2>
        </div>
        {children != null && (
          <div
            className={
              bodyClassName
                ? `${confirmModalBody} ${bodyClassName}`.trim()
                : confirmModalBody
            }
          >
            {children}
          </div>
        )}
        <div className={footerClassName}>{footer}</div>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(overlay, document.body);
  }
  return overlay;
}
