"use client";

import React from "react";
import {
  ConfirmModalShell,
  confirmBtnPrimary,
  confirmBtnSecondary,
} from "@/components/shared/ConfirmModalShell";

interface ConfirmProps {
  show: boolean;
  onHide: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

const Confirm: React.FC<ConfirmProps> = ({
  show,
  onHide,
  onConfirm,
  title,
  message,
}) => (
  <ConfirmModalShell
    show={show}
    title={title}
    onBackdropClick={onHide}
    footer={
      <>
        <button type="button" onClick={onHide} className={confirmBtnSecondary}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} className={confirmBtnPrimary}>
          Confirm
        </button>
      </>
    }
  >
    <p className="tw-m-0 tw-mt-2 tw-mb-2">{message}</p>
  </ConfirmModalShell>
);

export default Confirm;
