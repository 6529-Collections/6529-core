import styles from "./Confirm.module.scss";
import React from "react";
import { Modal, Button } from "react-bootstrap";

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
  return (
    <Modal show={show} onHide={onCancel} backdrop keyboard={false} centered>
      <div className={styles.modalHeader}>
        <Modal.Title>Close 6529 Core</Modal.Title>
      </div>
      <Modal.Footer className={styles.modalContent}>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onRunBackground}>
          Run in Background
        </Button>
        <Button variant="danger" onClick={onQuit}>
          Quit
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ConfirmClose;
