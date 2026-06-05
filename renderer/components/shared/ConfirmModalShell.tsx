"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
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
  "tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-iron-700 tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-iron-100 tw-transition-colors focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-iron-500 focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-iron-500 desktop-hover:hover:tw-bg-iron-600";
export const confirmBtnPrimary =
  "tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white tw-transition-colors focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-primary-400 focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 desktop-hover:hover:tw-bg-primary-600 disabled:tw-opacity-50";
export const confirmBtnDanger =
  "tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-[#dc2626] tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white tw-transition-colors focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-red focus:tw-ring-offset-2 focus:tw-ring-offset-iron-950 focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-red focus-visible:tw-ring-offset-2 focus-visible:tw-ring-offset-iron-950 desktop-hover:hover:tw-bg-[#ef4444]";
export const confirmBtnSecondarySmall =
  "tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-iron-700 tw-px-3 tw-py-1.5 tw-text-sm tw-font-medium tw-text-iron-100 tw-transition-colors focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-iron-500 focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-iron-500 desktop-hover:hover:tw-bg-iron-600";
export const confirmBtnPrimaryWithIcon =
  "tw-cursor-pointer tw-inline-flex tw-items-center tw-gap-1 tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white tw-transition-colors focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-primary-400 focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 desktop-hover:hover:tw-bg-primary-600";

export const confirmInputClass =
  "tw-h-10 tw-w-full tw-rounded-lg tw-border-0 tw-bg-iron-800 tw-px-3 tw-py-2 tw-text-iron-100 tw-outline-none placeholder:tw-text-iron-500 focus:tw-ring-2 focus:tw-ring-primary-400";

const dialogBase =
  "tw-max-h-[90vh] tw-w-full tw-max-w-lg tw-overflow-auto tw-rounded-xl tw-bg-iron-950 tw-shadow-xl tw-ring-1 tw-ring-iron-800";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const getFocusableElements = (element: HTMLElement | null) => {
  if (!element) {
    return [];
  }

  return Array.from(element.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((focusableElement) => focusableElement.offsetParent !== null)
    .filter((focusableElement) => !focusableElement.hasAttribute("disabled"));
};

const setActiveFocusElement = (
  dialogElement: HTMLElement | null,
  focusElement: HTMLElement | null
) => {
  if (!dialogElement) {
    return;
  }

  getFocusableElements(dialogElement).forEach((focusableElement) => {
    if (focusableElement === focusElement) {
      focusableElement.setAttribute("data-confirm-focused", "true");
    } else {
      focusableElement.removeAttribute("data-confirm-focused");
    }
  });
};

export function ConfirmModalShell(props: {
  show: boolean;
  title: ReactNode;
  children?: ReactNode;
  footer: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onBackdropClick?: () => void;
  overlayClassName?: string;
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
    initialFocusRef,
    onBackdropClick,
    overlayClassName = "",
    dialogClassName = "",
    bodyClassName = "",
    footerClassName = confirmModalFooter,
    titleClassName = "tw-m-0 tw-text-lg tw-font-semibold",
  } = props;
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show) {
      return;
    }

    const focusableElements = getFocusableElements(dialogRef.current);
    const defaultFocusElement =
      initialFocusRef?.current ?? focusableElements.at(-1);

    defaultFocusElement?.focus();
    setActiveFocusElement(dialogRef.current, defaultFocusElement ?? null);
  }, [initialFocusRef, show]);

  useEffect(() => {
    if (!show) {
      return;
    }

    const dialogElement = dialogRef.current;

    const handleFocusIn = (event: FocusEvent) => {
      setActiveFocusElement(dialogElement, event.target as HTMLElement);
    };

    const handleFocusOut = () => {
      setActiveFocusElement(dialogElement, null);
    };

    dialogElement?.addEventListener("focusin", handleFocusIn);
    dialogElement?.addEventListener("focusout", handleFocusOut);

    return () => {
      dialogElement?.removeEventListener("focusin", handleFocusIn);
      dialogElement?.removeEventListener("focusout", handleFocusOut);
    };
  }, [show]);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      onBackdropClick?.();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements(dialogRef.current);
    if (!focusableElements.length) {
      return;
    }

    const activeIndex = focusableElements.indexOf(
      document.activeElement as HTMLElement
    );

    event.preventDefault();

    if (activeIndex === -1) {
      focusableElements.at(event.shiftKey ? -1 : 0)?.focus();
      return;
    }

    const nextIndex = event.shiftKey
      ? (activeIndex - 1 + focusableElements.length) % focusableElements.length
      : (activeIndex + 1) % focusableElements.length;

    focusableElements[nextIndex]?.focus();
  };

  if (!show) return null;
  const overlayZClass = overlayClassName.includes("tw-z-")
    ? ""
    : "tw-z-[10010]";

  const overlay = (
    <div
      className={`tw-fixed tw-inset-0 ${overlayZClass} tw-flex tw-items-center tw-justify-center tw-bg-black/50 ${overlayClassName}`.trim()}
      onClick={onBackdropClick}
      role="dialog"
      aria-modal
    >
      <div
        ref={dialogRef}
        className={`${dialogBase} ${dialogClassName}`.trim()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
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
        <style jsx global>{`
          button[data-confirm-focused="true"],
          a[data-confirm-focused="true"],
          input[data-confirm-focused="true"],
          select[data-confirm-focused="true"],
          textarea[data-confirm-focused="true"],
          [tabindex][data-confirm-focused="true"] {
            outline: 3px solid rgba(255, 255, 255, 0.98) !important;
            outline-offset: 4px !important;
            box-shadow:
              0 0 0 8px rgba(82, 139, 255, 0.8),
              0 0 28px rgba(82, 139, 255, 0.95),
              0 0 42px rgba(255, 255, 255, 0.35) !important;
            filter: brightness(1.28) saturate(1.16) !important;
            transform: translateY(-2px) scale(1.03) !important;
          }
        `}</style>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(overlay, document.body);
  }
  return overlay;
}
