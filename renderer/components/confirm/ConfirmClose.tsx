"use client";

import React, { useRef } from "react";
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
}) => {
  const quitButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <ConfirmModalShell
      show={show}
      title="Close 6529 Desktop"
      initialFocusRef={quitButtonRef}
      onBackdropClick={onCancel}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className={confirmBtnSecondary}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onRunBackground}
            className={confirmBtnPrimary}
          >
            Run in Background
          </button>
          <button
            ref={quitButtonRef}
            type="button"
            onClick={onQuit}
            className={confirmBtnDanger}
          >
            Quit
          </button>
        </>
      }
    />
  );
};

export default ConfirmClose;
