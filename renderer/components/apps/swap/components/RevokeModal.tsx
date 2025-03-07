import { Modal, Button } from "react-bootstrap";
import { TokenPair } from "../types";

interface RevokeModalProps {
  show: boolean;
  onHide: () => void;
  onRevoke: () => Promise<void>;
  pair: TokenPair;
  loading: boolean;
}

export function RevokeModal({
  show,
  onHide,
  onRevoke,
  pair,
  loading,
}: RevokeModalProps) {
  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      contentClassName="tw-bg-[rgba(26,26,26,0.95)] tw-backdrop-blur-[20px] tw-border tw-border-[rgba(255,255,255,0.1)] tw-rounded-2xl tw-text-white"
    >
      <Modal.Header
        closeButton
        className="tw-border-b tw-border-b-[rgba(255,255,255,0.1)] tw-p-5 [&_.btn-close]:tw-filter [&_.btn-close]:tw-invert [&_.btn-close]:tw-grayscale [&_.btn-close]:tw-brightness-[200%]"
      >
        <Modal.Title className="tw-text-xl tw-font-semibold">
          Revoke Token Approval
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="tw-p-6">
        <p className="tw-text-[rgba(255,255,255,0.9)] tw-mb-5 tw-text-[0.95rem] tw-leading-relaxed">
          This will revoke the approval for {pair.inputToken.symbol} to be spent
          by the Uniswap protocol. You'll need to approve again for future
          swaps.
        </p>
        <div className="tw-flex tw-gap-4 tw-p-4 tw-bg-[rgba(255,59,48,0.1)] tw-border tw-border-[rgba(255,59,48,0.2)] tw-rounded-xl">
          <div className="tw-text-xl">⚠️</div>
          <div className="tw-text-[rgba(255,255,255,0.8)] tw-text-[0.9rem] tw-leading-relaxed">
            Only revoke if you don't plan to make any more swaps soon. Revoking
            and re-approving will cost additional gas fees.
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer className="tw-border-t tw-border-t-[rgba(255,255,255,0.1)] tw-p-5">
        <Button variant="secondary" onClick={onHide} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={onRevoke}
          disabled={loading}
          className="tw-bg-[rgb(255,59,48)] tw-border-[rgb(255,59,48)] hover:tw-bg-[rgb(230,53,43)] hover:tw-border-[rgb(230,53,43)] active:tw-bg-[rgb(204,47,38)] active:tw-border-[rgb(204,47,38)]"
        >
          {loading ? "Revoking..." : "Revoke Approval"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
