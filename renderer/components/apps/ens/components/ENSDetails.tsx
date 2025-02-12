import { useState, useEffect } from "react";
import { Card, Button, Modal, Form } from "react-bootstrap";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
  useEnsAddress,
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
  const [isRegistering, setIsRegistering] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  // Get the resolver directly from constants
  const resolverAddress = ENS_CONTRACTS[chainId as keyof typeof ENS_CONTRACTS]
    ?.publicResolver as `0x${string}`;

  // Generate a random secret
  function generateSecret(): `0x${string}` {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    return `0x${Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}` as `0x${string}`;
  }

  const MIN_REGISTRATION_DURATION = BigInt(28 * 24 * 60 * 60); // 28 days in seconds
  const MAX_REGISTRATION_DURATION = BigInt(365 * 24 * 60 * 60); // 1 year in seconds

  async function registerENS() {
    if (!walletClient.data || !publicClient || !resolverAddress) return;

    try {
      setIsRegistering(true);
      console.log("Using resolver:", resolverAddress);

      const durationInSeconds = BigInt(duration * 365 * 24 * 60 * 60);

      // Verify duration
      if (
        durationInSeconds < MIN_REGISTRATION_DURATION ||
        durationInSeconds > MAX_REGISTRATION_DURATION
      ) {
        throw new Error("Invalid registration duration");
      }

      // 1. Get price first
      const price = await publicClient.readContract({
        address: controllerAddress!,
        abi: ENS_CONTROLLER_ABI,
        functionName: "rentPrice",
        args: [ensName.replace(".eth", ""), durationInSeconds],
      });
      console.log("Registration price:", price.toString(), "wei");

      // Add this check before making the commitment
      if (
        resolverAddress !==
        ENS_CONTRACTS[chainId as keyof typeof ENS_CONTRACTS].publicResolver
      ) {
        console.warn("Resolver mismatch:", {
          using: resolverAddress,
          expected:
            ENS_CONTRACTS[chainId as keyof typeof ENS_CONTRACTS].publicResolver,
        });
      }

      // Generate commitment parameters
      const secret = generateSecret();
      const emptyData: `0x${string}`[] = [];
      const reverseRecord = true;
      const ownerControlledFuses = 0;

      // Log all parameters for debugging
      console.log("Registration parameters:", {
        name: ensName.replace(".eth", ""),
        owner: walletClient.data.account.address,
        duration: durationInSeconds.toString(),
        secret,
        resolver: resolverAddress,
        data: emptyData,
        reverseRecord,
        ownerControlledFuses,
        value: price.toString(),
      });

      // 2. Make commitment
      const commitment = await publicClient.readContract({
        address: controllerAddress!,
        abi: ENS_CONTROLLER_ABI,
        functionName: "makeCommitment",
        args: [
          ensName.replace(".eth", ""),
          walletClient.data.account.address,
          durationInSeconds,
          secret,
          resolverAddress,
          emptyData,
          reverseRecord,
          ownerControlledFuses,
        ],
      });

      // 3. Submit commitment
      const { request: commitRequest } = await publicClient.simulateContract({
        address: controllerAddress!,
        abi: ENS_CONTROLLER_ABI,
        functionName: "commit",
        account: walletClient.data.account,
        args: [commitment],
      });

      const commitHash = await walletClient.data.writeContract(commitRequest);
      const commitReceipt = await publicClient.waitForTransactionReceipt({
        hash: commitHash,
      });

      // 4. Wait for commitment age
      const minAge = await publicClient.readContract({
        address: controllerAddress!,
        abi: ENS_CONTROLLER_ABI,
        functionName: "minCommitmentAge",
      });

      const waitTime = (Number(minAge) + 5) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // 5. Verify commitment is still valid
      try {
        // Try simulating the registration first
        const { request } = await publicClient.simulateContract({
          address: controllerAddress!,
          abi: ENS_CONTROLLER_ABI,
          functionName: "register",
          account: walletClient.data.account,
          args: [
            ensName.replace(".eth", ""),
            walletClient.data.account.address,
            durationInSeconds,
            secret,
            resolverAddress,
            emptyData,
            reverseRecord,
            ownerControlledFuses,
          ],
          value: price,
        });

        // If simulation succeeds, send the actual transaction
        const hash = await walletClient.data.writeContract(request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log("Registration complete:", receipt);

        onHide();
      } catch (simError: any) {
        console.error("Simulation error details:", {
          error: simError,
          args: {
            name: ensName.replace(".eth", ""),
            owner: walletClient.data.account.address,
            duration: durationInSeconds.toString(),
            secret,
            resolver: resolverAddress,
            data: emptyData,
            reverseRecord,
            ownerControlledFuses,
            value: price.toString(),
          },
        });
        throw simError;
      }
    } catch (error: any) {
      console.error("Error registering ENS:", {
        error,
        message: error.message,
        details: error.details,
        cause: error.cause,
      });

      // More user-friendly error messages
      let errorMessage = "Registration failed: ";
      if (error.message.includes("CommitmentTooNew")) {
        errorMessage += "Please wait longer after committing";
      } else if (error.message.includes("CommitmentTooOld")) {
        errorMessage += "Commitment has expired, please try again";
      } else if (error.message.includes("InsufficientValue")) {
        errorMessage += "Insufficient payment amount";
      } else if (error.message.includes("NameNotAvailable")) {
        errorMessage += "Name is no longer available";
      } else {
        errorMessage += error.message;
      }

      alert(errorMessage);
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

    if (!isValidRegistration(ensName)) {
      alert(
        "Invalid ENS name. Names must be 3-63 characters long and contain only lowercase letters, numbers, and hyphens."
      );
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
    isAvailable,
    controllerAddress,
  };
  console.log(
    "Debug data (lossless BigInt serialization):",
    serialize(debugData)
  );

  console.log("ENS Resolution details:", {
    name: ensName,
    isAvailable,
    queriedResolver:
      ENS_CONTRACTS[chainId as keyof typeof ENS_CONTRACTS].publicResolver,
  });

  // Instead, get the resolver from constants
  const resolverAddress =
    ENS_CONTRACTS[chainId as keyof typeof ENS_CONTRACTS]?.publicResolver;

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
                {resolverAddress
                  ? `${resolverAddress.slice(0, 6)}...${resolverAddress.slice(
                      -4
                    )}`
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

function isValidRegistration(name: string): boolean {
  const nameWithoutSuffix = name.replace(".eth", "");

  // Check length (3-63 characters)
  if (nameWithoutSuffix.length < 3 || nameWithoutSuffix.length > 63) {
    return false;
  }

  // Only lowercase letters, numbers, and hyphens
  if (!/^[a-z0-9-]+$/.test(nameWithoutSuffix)) {
    return false;
  }

  // Cannot start or end with hyphen
  if (nameWithoutSuffix.startsWith("-") || nameWithoutSuffix.endsWith("-")) {
    return false;
  }

  return true;
}
