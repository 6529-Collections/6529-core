import React from "react";
import { Button, Modal } from "react-bootstrap";
import styles from "./Confirm.module.scss";

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
}) => {
  return (
    <Modal show={show} onHide={onHide} backdrop keyboard={false} centered>
      <div className={styles["modalHeader"]}>
        <Modal.Title>{title}</Modal.Title>
      </div>
      <Modal.Body className={styles["modalContent"]}>
        <p className="mt-2 mb-2">{message}</p>
      </Modal.Body>
      <Modal.Footer className={styles["modalContent"]}>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onConfirm}>
          Confirm
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default Confirm;
