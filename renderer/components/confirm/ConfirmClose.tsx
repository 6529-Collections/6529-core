"use client";

import React from "react";
import {
  ConfirmModalShell,
  confirmBtnDanger,
  confirmBtnPrimary,
  confirmBtnSecondary,
} from "@/components/shared/ConfirmModalShell";

interface ConfirmProps {
  show: boolean;
  onQuit: () => void;
  onRunBackground: () => void;
  onCancel: () => void;
}

const ConfirmClose: React.FC<ConfirmProps> = ({
  show,
  onQuit,
  onRunBackground,
  onCancel,
}) => (
  <ConfirmModalShell
    show={show}
    title="Close 6529 Desktop"
    onBackdropClick={onCancel}
    footer={
      <>
        <button type="button" onClick={onCancel} className={confirmBtnSecondary}>
          Cancel
        </button>
        <button
          type="button"
          onClick={onRunBackground}
          className={confirmBtnPrimary}
        >
          Run in Background
        </button>
        <button type="button" onClick={onQuit} className={confirmBtnDanger}>
          Quit
        </button>
      </>
    }
  />
);

export default ConfirmClose;
