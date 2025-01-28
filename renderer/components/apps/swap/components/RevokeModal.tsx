import { Modal, Button } from "react-bootstrap";
import { TokenPair } from "../types";
import styles from "./RevokeModal.module.scss";

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
    <Modal show={show} onHide={onHide} centered className={styles.revokeModal}>
      <Modal.Header closeButton>
        <Modal.Title>Revoke Token Approval</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className={styles.description}>
          This will revoke the approval for {pair.inputToken.symbol} to be spent
          by the Uniswap protocol. You'll need to approve again for future
          swaps.
        </p>
        <div className={styles.warning}>
          <div className={styles.warningIcon}>⚠️</div>
          <div className={styles.warningText}>
            Only revoke if you don't plan to make any more swaps soon. Revoking
            and re-approving will cost additional gas fees.
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={onRevoke}
          disabled={loading}
          className={styles.revokeButton}
        >
          {loading ? "Revoking..." : "Revoke Approval"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
