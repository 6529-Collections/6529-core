"use client";

import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import Link from "next/link";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { t } from "@/i18n/messages";
import styles from "./TitleBar.module.css";

export default function DesktopUpdateModal({
  onClose,
  open,
  version,
}: {
  readonly onClose: () => void;
  readonly open: boolean;
  readonly version: string;
}) {
  const locale = useBrowserLocale();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="tailwind-scope tw-relative tw-z-[10000]"
    >
      <div className="tw-fixed tw-inset-0 tw-bg-black/60" aria-hidden="true" />
      <div className="tw-fixed tw-inset-0 tw-flex tw-items-center tw-justify-center tw-p-4">
        <DialogPanel
          className={`${styles["updateModalSurface"]} tw-w-[min(28rem,calc(100vw-2rem))]`}
        >
          <div className={styles["updateModalHeader"]}>
            <DialogTitle className="tw-m-0 tw-text-lg tw-font-semibold">
              {t(locale, "desktopUpdateModal.title")}
            </DialogTitle>
          </div>
          <div className={styles["updateModalBody"]}>
            <p className="tw-m-0">
              {t(locale, "desktopUpdateModal.versionAvailable", { version })}
            </p>
            <Link
              href="/core/core-info"
              onClick={onClose}
              className={styles["updateModalLink"]}
            >
              {t(locale, "desktopUpdateModal.appInfoAction")}
            </Link>
          </div>
          <div className={styles["updateModalFooter"]}>
            <button
              autoFocus
              type="button"
              onClick={onClose}
              className="tw-inline-flex tw-items-center tw-justify-center tw-rounded-md tw-border tw-border-solid tw-border-iron-600 tw-bg-iron-800 tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white desktop-hover:hover:tw-bg-iron-700"
            >
              {t(locale, "desktopUpdateModal.close")}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
