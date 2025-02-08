import { useState, useEffect } from "react";
import { Card, Button, Modal, Form } from "react-bootstrap";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
  useEnsAddress,
  useEnsResolver,
  useEnsText,
} from "wagmi";
import { parseEther } from "viem"; // For Ether -> wei conversions if needed

import styles from "./ENSDetails.module.scss";
import { ENS_CONTRACTS } from "../constants";
import { ENS_CONTROLLER_ABI } from "../abis";
import { serialize } from "wagmi"; // If you need lossless BigInt serialization

interface Props {
  ensName: string;
}

/** For brevity, the RegistrationModal only triggers the `registerENS` call */
interface RegistrationModalProps {
  show: boolean;
  onHide: () => void;
  ensName: string;
  chainId: number;
  controllerAddress?: `0x${string}`;
}

/**
 * Registration Modal
 * - Gathers a duration
 * - Calls `registerENS()` on submit
 */
function ENSRegistrationModal({
  show,
  onHide,
  ensName,
  chainId,
  controllerAddress,
}: RegistrationModalProps) {
  const [duration, setDuration] = useState<number>(1);
  const publicClient = usePublicClient({ chainId });
  const walletClient = useWalletClient({ chainId });

  // Local state for transaction progress
  const [isRegistering, setIsRegistering] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  // Example function to register the ENS
  async function registerENS() {
    if (!walletClient.data || !publicClient) return;

    try {
      setIsRegistering(true);

      // 1. Simulate contract call to get the properly formatted request.
      const { request } = await publicClient.simulateContract({
        address: controllerAddress!,
        abi: ENS_CONTROLLER_ABI,
        functionName: "register", // Example method
        account: walletClient.data.account, // The signing account
        args: [
          ensName.replace(".eth", ""),
          walletClient.data.account.address,
          BigInt(duration),
        ],
        // If your ENS registration requires ETH, specify `value`:
        // value: parseEther("0.01"),
      });

      // 2. Send the transaction
      const hash = await walletClient.data.writeContract(request);
      setTxHash(hash);

      // 3. (Optional) Wait for the transaction to be mined
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.info("Registration transaction mined:", receipt);

      // 4. Close the modal or show success message
      onHide();
    } catch (error) {
      console.error("Error registering ENS:", error);
    } finally {
      setIsRegistering(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!controllerAddress) {
      alert("No valid controller address for this chain.");
      return;
    }
    registerENS();
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
            disabled={isRegistering || !controllerAddress}
          >
            {isRegistering ? "Registering..." : `Register ${ensName}`}
          </Button>
          {txHash && (
            <div className="mt-2">
              <small>Tx Hash: {txHash}</small>
            </div>
          )}
        </Form>
      </Modal.Body>
    </Modal>
  );
}

/**
 * ENSDetails
 * - Reads basic ENS info (address, resolver, avatar)
 * - Checks availability
 * - Triggers registration if available
 */
export function ENSDetails({ ensName }: Props) {
  const { address: userAddress } = useAccount();
  const chainIdBigInt = useChainId();

  // Convert BigInt chainId to a normal number to avoid serialization issues
  const chainId = Number(chainIdBigInt);

  // WAGMI v2: for reads, we can use useEnsAddress, useEnsResolver, etc.
  // Or we can do them manually with publicClient.readContract(...) if we prefer.
  const { data: ensOwner } = useEnsAddress({
    name: ensName,
    chainId,
  });
  const { data: ensResolver } = useEnsResolver({
    name: ensName,
    chainId,
  });
  const { data: avatar } = useEnsText({
    name: ensName,
    key: "avatar",
    chainId,
  });

  const isValidName = (name: string) => {
    const normalized = name.toLowerCase();
    return (
      /^[a-z0-9-]+\.eth$/.test(normalized) &&
      normalized.length > 3 &&
      normalized.length < 63
    );
  };

  // Get the controller address for the current chain from your constants
  const contracts = ENS_CONTRACTS[chainId as keyof typeof ENS_CONTRACTS];
  const controllerAddress = contracts?.controller as `0x${string}` | undefined;

  // We'll manually check availability below using `readContract`
  const publicClient = usePublicClient({ chainId });
  const [isAvailable, setIsAvailable] = useState<boolean | undefined>(
    undefined
  );

  useEffect(() => {
    // Only check availability if:
    // 1) We have a valid .eth name
    // 2) There's no current owner
    // 3) We actually have a valid controllerAddress
    if (
      !ensName ||
      !isValidName(ensName) ||
      ensOwner ||
      !controllerAddress ||
      !publicClient
    ) {
      setIsAvailable(false);
      return;
    }

    let isMounted = true;
    async function checkAvailable() {
      try {
        // Type assertion to ensure controllerAddress is not undefined
        const result = await publicClient?.readContract({
          address: controllerAddress as `0x${string}`, // We know it's defined due to the guard clause
          abi: ENS_CONTROLLER_ABI,
          functionName: "available",
          args: [ensName.replace(".eth", "")],
        });

        if (isMounted) {
          setIsAvailable(Boolean(result));
        }
      } catch (err) {
        console.error("Error checking availability:", err);
        if (isMounted) {
          setIsAvailable(false);
        }
      }
    }

    checkAvailable();
    return () => {
      isMounted = false;
    };
  }, [ensName, controllerAddress, ensOwner, publicClient]);

  // State for controlling the registration modal
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const handleRegisterClick = () => {
    setShowRegisterModal(true);
  };

  // (Optional) log debugging data with wagmi's `serialize`
  const debugData = {
    chainIdBigInt,
    chainId,
    ensName,
    ensOwner,
    ensResolver,
    isAvailable,
    controllerAddress,
  };
  console.log(
    "Debug data (lossless BigInt serialization):",
    serialize(debugData)
  );

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
                {ensOwner ?? "Not registered"}
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.label}>Resolver</span>
              <span className={styles.value}>
                {ensResolver
                  ? `${ensResolver.slice(0, 6)}...${ensResolver.slice(-4)}`
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
        chainId={chainId}
        controllerAddress={controllerAddress}
      />
    </>
  );
}
