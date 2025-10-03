import { ExtendedDrop } from "@/helpers/waves/drop.helpers";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import SecondaryButton from "../utils/button/SecondaryButton";
import { SingleWaveDropVote } from "../waves/drop/SingleWaveDropVote";
import ModalLayout from "../waves/memes/submission/layout/ModalLayout";

interface VotingModalProps {
  readonly drop: ExtendedDrop;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

const VotingModal: React.FC<VotingModalProps> = ({ drop, isOpen, onClose }) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    setReady(true);
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !ready) return null;

  return createPortal(
    // One single fixed layer pinned to the viewport
    <div
      className="tw-fixed tw-top-0 tw-left-0 tw-w-screen tw-h-screen tw-z-50 tw-bg-gray-500/75 tw-backdrop-blur-[1px] tw-flex tw-items-center tw-justify-center"
      onClick={onClose} // click outside closes
      aria-hidden="true">
      {/* modal card (stop click from bubbling to backdrop) */}
      <div
        className="tw-w-full tw-max-w-2xl"
        onClick={(e) => e.stopPropagation()}
        aria-hidden="false">
        <ModalLayout title="Vote for this artwork" onCancel={onClose}>
          <div className="tw-pb-6 tw-pt-1">
            <SingleWaveDropVote drop={drop} onVoteSuccess={onClose} />
            <div className="tw-mt-4 tw-flex tw-justify-end">
              <SecondaryButton onClicked={onClose}>Cancel</SecondaryButton>
            </div>
          </div>
        </ModalLayout>
      </div>
    </div>,
    document.body
  );
};

export default VotingModal;
