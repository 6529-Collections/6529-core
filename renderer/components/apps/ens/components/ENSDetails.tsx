import { useState } from "react";
import { Card, Button, Modal, Form } from "react-bootstrap";
import {
  useEnsAddress,
  useEnsResolver,
  useEnsText,
  useAccount,
  useChainId,
  useReadContract,
} from "wagmi";
import styles from "./ENSDetails.module.scss";
import { ENS_CONTRACTS } from "../constants";
import { ENS_CONTROLLER_ABI } from "../abis";

interface Props {
  ensName: string;
}

interface RegistrationModalProps {
  show: boolean;
  onHide: () => void;
  ensName: string;
}

function ENSRegistrationModal({
  show,
  onHide,
  ensName,
}: RegistrationModalProps) {
  const [duration, setDuration] = useState(1); // Years

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Add registration logic
    onHide();
  };

  return (
    <Modal show={show} onHide={onHide} centered className={styles.modal}>
      <Modal.Header closeButton className={styles.modalHeader}>
        <Modal.Title>Register {ensName}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label className={styles.formLabel}>
              Registration Duration (Years)
            </Form.Label>
            <Form.Select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className={styles.input}
            >
              <option value={1}>1 Year</option>
              <option value={2}>2 Years</option>
              <option value={3}>3 Years</option>
            </Form.Select>
          </Form.Group>

          <div className={styles.disclaimer}>
            <small>
              Registration includes a .eth name and basic DNS functionality.
              You'll need to pay gas fees and the registration cost.
            </small>
          </div>

          <Button
            type="submit"
            className={styles.registerButton}
            disabled={!duration}
          >
            Register {ensName}
          </Button>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

export function ENSDetails({ ensName }: Props) {
  const { address: userAddress, isConnected } = useAccount();
  /**
   * Convert chainId from BigInt to number (or string).
   * This prevents BigInt from getting into the query key.
   */
  const chainIdRaw = useChainId();
  const chainId = Number(chainIdRaw);

  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const contracts = ENS_CONTRACTS[chainId as keyof typeof ENS_CONTRACTS];

  // Basic ENS reads:
  const { data: address } = useEnsAddress({ name: ensName });
  const { data: resolver } = useEnsResolver({ name: ensName });
  const { data: avatar } = useEnsText({ name: ensName, key: "avatar" });

  const isValidName = (name: string) => {
    const normalized = name.toLowerCase();
    return (
      /^[a-z0-9-]+\.eth$/.test(normalized) &&
      normalized.length > 3 &&
      normalized.length < 63
    );
  };

  // Check name availability
  const { data: isAvailable } = useReadContract({
    address: contracts?.controller as `0x${string}`,
    abi: ENS_CONTROLLER_ABI,
    functionName: "available",
    args: [ensName.replace(".eth", "")],
    chainId,
    scopeKey: `available-${ensName}-${chainId}`,
    query: {
      enabled: Boolean(ensName && !address && isValidName(ensName)),
    },
  });

  // Add console.log to debug
  console.log({
    address,
    isAvailable,
    contracts,
    chainId,
    ensName: ensName.replace(".eth", ""),
  });

  const handleRegisterClick = () => {
    setShowRegisterModal(true);
  };

  return (
    <>
      <Card className={styles.detailsCard}>
        <Card.Body>
          <h3 className={styles.ensName}>{ensName}</h3>

          {avatar && (
            <div className={styles.avatarContainer}>
              <img src={avatar} alt={ensName} className={styles.avatar} />
            </div>
          )}

          <div className={styles.detailsGrid}>
            <div className={styles.detailItem}>
              <span className={styles.label}>Address</span>
              <span className={styles.value}>
                {address ? address : "Not registered"}
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.label}>Resolver</span>
              <span className={styles.value}>
                {resolver
                  ? `${resolver.slice(0, 6)}...${resolver.slice(-4)}`
                  : "No resolver"}
              </span>
            </div>
          </div>

          {isAvailable && (
            <div className={styles.registerContainer}>
              <Button
                onClick={handleRegisterClick}
                className={styles.registerButton}
              >
                Register {ensName}
              </Button>
            </div>
          )}
        </Card.Body>
      </Card>

      <ENSRegistrationModal
        show={showRegisterModal}
        onHide={() => setShowRegisterModal(false)}
        ensName={ensName}
      />
    </>
  );
}
