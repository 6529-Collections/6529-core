// components/ENSDetails.tsx
import { useState, useEffect } from "react";
import { Card, Button, Modal, Form } from "react-bootstrap";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
  useEnsText,
  useEnsAddress,
  useBalance,
} from "wagmi";
import { serialize } from "wagmi";
import { formatEther } from "viem";
import {
  ENS_CONTRACTS,
  MIN_REGISTRATION_DURATION,
  MAX_REGISTRATION_DURATION,
} from "../constants";
import { ENS_CONTROLLER_ABI } from "../abis";
import styles from "./ENSDetails.module.scss";
interface ENSDetailsProps {
  ensName: string;
}

export function ENSDetails({ ensName }: ENSDetailsProps) {
  const chainIdBigInt = useChainId();
  const chainId = Number(chainIdBigInt);

  // Basic reads with wagmi:
  const { data: ensOwner } = useEnsAddress({ name: ensName, chainId });
  const { data: avatar } = useEnsText({
    name: ensName,
    key: "avatar",
    chainId,
  });

  // Contract addresses
  const contracts = ENS_CONTRACTS[chainId as keyof typeof ENS_CONTRACTS];
  const controllerAddress = contracts?.controller as `0x${string}` | undefined;

  const publicClient = usePublicClient({ chainId });

  console.log("Public client:", publicClient, chainId, controllerAddress);
  const [isAvailable, setIsAvailable] = useState<boolean | undefined>(false);

  // Basic check for name validity
  const isValidName = (name: string) => {
    return /^[-a-z0-9]+\.(eth)$/.test(name.toLowerCase()) && name.length >= 3;
  };

  useEffect(() => {
    async function checkAvailability() {
      if (!ensName || !isValidName(ensName) || ensOwner || !controllerAddress) {
        setIsAvailable(false);
        return;
      }
      try {
        const result = await publicClient?.readContract({
          address: controllerAddress,
          abi: ENS_CONTROLLER_ABI,
          functionName: "available",
          args: [ensName.replace(".eth", "")],
        });
        setIsAvailable(Boolean(result));
      } catch (error) {
        console.error("Error checking name availability:", error);
        setIsAvailable(false);
      }
    }

    checkAvailability();
  }, [ensName, ensOwner, publicClient, controllerAddress]);

  // Modal state
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  // Debug info
  console.log(
    "ENS Details debug:",
    serialize({
      chainId,
      ensName,
      ensOwner,
      isAvailable,
      controllerAddress,
    })
  );

  return (
    <>
      <Card className={styles.detailsCard}>
        <Card.Body>
          <h3 className={styles.ensName}>{ensName}</h3>

          {avatar && (
            <div className={styles.avatarContainer}>
              <img src={avatar} alt="ENS Avatar" className={styles.avatar} />
            </div>
          )}

          <div className={styles.detailsGrid}>
            <div className={styles.detailItem}>
              <span className={styles.label}>Address:</span>
              <span className={styles.value}>
                {ensOwner || "Not registered"}
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.label}>Status:</span>
              <span className={styles.value}>
                {isAvailable ? "Available" : ensOwner ? "Owned" : "Unknown"}
              </span>
            </div>
          </div>

          {isAvailable && (
            <div className={styles.registerContainer}>
              <Button
                variant="primary"
                onClick={() => setShowRegisterModal(true)}
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

/* ------------------------------------------------------------------
   Registration Modal: Handles commit/wait/register flow 
------------------------------------------------------------------ */
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
  const { address: userAddress } = useAccount();
  const { data: balance } = useBalance({
    address: userAddress,
  });
  const chainIdBigInt = useChainId();
  const chainId = Number(chainIdBigInt);
  const publicClient = usePublicClient({ chainId });
  const walletClient = useWalletClient({ chainId });

  const [durationYears, setDurationYears] = useState(1);
  const [isRegistering, setIsRegistering] = useState(false);

  const controllerAddress =
    ENS_CONTRACTS[chainId as keyof typeof ENS_CONTRACTS]?.controller;
  const resolverAddress =
    ENS_CONTRACTS[chainId as keyof typeof ENS_CONTRACTS]?.publicResolver;

  // Generate a random secret
  function generateSecret(): `0x${string}` {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    return ("0x" +
      Array.from(randomBytes, (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("")) as `0x${string}`;
  }

  async function registerENS() {
    try {
      if (!walletClient.data || !publicClient) {
        alert("Wallet not connected or public client unavailable.");
        return;
      }
      if (!controllerAddress || !resolverAddress) {
        alert("No valid ENS controller/resolver on this chain.");
        return;
      }
      if (!userAddress) {
        alert("No user address found. Connect your wallet first.");
        return;
      }

      setIsRegistering(true);

      // 1) Duration
      const durationInSeconds = BigInt(durationYears * 365 * 24 * 60 * 60);
      if (
        durationInSeconds < MIN_REGISTRATION_DURATION ||
        durationInSeconds > MAX_REGISTRATION_DURATION
      ) {
        throw new Error(
          `Duration must be between 28 days and 1 year. You chose ${durationYears} year(s).`
        );
      }

      // 2) Rent price
      const price = await publicClient.readContract({
        address: controllerAddress as `0x${string}`,
        abi: ENS_CONTROLLER_ABI,
        functionName: "rentPrice",
        args: [ensName.replace(".eth", ""), durationInSeconds],
      });
      console.log(`Rent price for ${ensName}: ${price.toString()} wei`);

      // Check user balance
      const userBalance = await publicClient.getBalance({
        address: walletClient.data.account.address,
      });
      console.log("User test ETH balance:", userBalance.toString());

      // 3) Make commitment
      const secret = generateSecret();
      const emptyData: `0x${string}`[] = [];
      // Set reverseRecord based on network
      const reverseRecord = chainId === 1; // true for mainnet, false for others
      const ownerControlledFuses = 0;
      const label = ensName.replace(".eth", "");

      // We'll console.log all commit parameters
      console.log("Commit parameters =>", {
        name: label,
        owner: userAddress,
        duration: durationInSeconds.toString(),
        secret: secret,
        resolver: resolverAddress,
        data: emptyData,
        reverseRecord,
        ownerControlledFuses,
      });

      const commitment = await publicClient.readContract({
        address: controllerAddress as `0x${string}`,
        abi: ENS_CONTROLLER_ABI,
        functionName: "makeCommitment",
        args: [
          label,
          userAddress,
          durationInSeconds,
          secret,
          resolverAddress as `0x${string}`,
          emptyData,
          reverseRecord,
          ownerControlledFuses,
        ],
      });

      const { request: commitRequest } = await publicClient.simulateContract({
        address: controllerAddress as `0x${string}`,
        abi: ENS_CONTROLLER_ABI,
        functionName: "commit",
        account: walletClient.data.account,
        args: [commitment],
      });

      const commitTxHash = await walletClient.data.writeContract(commitRequest);
      const commitReceipt = await publicClient.waitForTransactionReceipt({
        hash: commitTxHash,
      });
      console.log("Commit transaction mined:", commitTxHash);

      // 4) Wait minCommitmentAge
      const commitBlockNumber = commitReceipt.blockNumber;
      const commitBlock = await publicClient.getBlock({
        blockNumber: commitBlockNumber,
      });
      const commitBlockTimestamp = Number(commitBlock.timestamp);

      const minCommitmentAge = (await publicClient.readContract({
        address: controllerAddress as `0x${string}`,
        abi: ENS_CONTROLLER_ABI,
        functionName: "minCommitmentAge",
      })) as bigint;

      const minCommitmentAgeNum = Number(minCommitmentAge);

      // Add buffer depending on chain
      const extraBuffer = chainId === 11155111 ? 60 : 10; // e.g., 60 more seconds on Sepolia
      const requiredOnChainSeconds = minCommitmentAgeNum + extraBuffer;

      while (true) {
        const currentBlock = await publicClient.getBlock();
        const currentTimestamp = Number(currentBlock.timestamp);
        const delta = currentTimestamp - commitBlockTimestamp;
        console.log(
          `On-chain seconds since commit: ${delta}; need >= ${requiredOnChainSeconds}`
        );
        if (delta >= requiredOnChainSeconds) break;
        await new Promise((r) => setTimeout(r, 5000));
      }

      console.log("Sufficient on-chain time passed; calling register...");

      // (Optional) final availability check
      const stillAvailable = await publicClient.readContract({
        address: controllerAddress as `0x${string}`,
        abi: ENS_CONTROLLER_ABI,
        functionName: "available",
        args: [label],
      });
      if (!stillAvailable) {
        throw new Error("NameNotAvailable: Another user registered it.");
      }

      // We'll console.log all register parameters
      console.log("Register parameters =>", {
        name: label,
        owner: userAddress,
        duration: durationInSeconds.toString(),
        secret,
        resolver: resolverAddress,
        data: emptyData,
        reverseRecord,
        ownerControlledFuses,
        value: price.toString() + " wei", // Payment for rentPrice
      });

      const { request: registerRequest } = await publicClient.simulateContract({
        address: controllerAddress as `0x${string}`,
        abi: ENS_CONTROLLER_ABI,
        functionName: "register",
        account: walletClient.data.account,
        args: [
          label,
          userAddress,
          durationInSeconds,
          secret,
          resolverAddress as `0x${string}`,
          emptyData,
          reverseRecord,
          ownerControlledFuses,
        ],
        value: price,
      });

      const registerTxHash = await walletClient.data.writeContract(
        registerRequest
      );
      const registerReceipt = await publicClient.waitForTransactionReceipt({
        hash: registerTxHash,
      });
      console.log("Registration complete:", registerReceipt);

      window.seedConnector.showToast({
        type: "success",
        message: `Successfully registered ${ensName}!`,
      });
      onHide();
    } catch (err: any) {
      console.error("Registration error:", err);
      let msg = "Registration failed. ";

      // Attempt to parse known revert reasons
      if (err.message?.includes("CommitmentTooNew")) {
        msg += "Please wait longer after committing.";
      } else if (err.message?.includes("CommitmentTooOld")) {
        msg += "Commitment has expired, please try again.";
      } else if (err.message?.includes("InsufficientValue")) {
        msg += "Insufficient payment amount (or insufficient balance).";
      } else if (err.message?.includes("NameNotAvailable")) {
        msg += "Name is no longer available.";
      } else {
        msg += err.message || "Unknown error.";
      }
      alert(msg);
    } finally {
      setIsRegistering(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerENS();
  };

  return (
    <Modal show={show} onHide={onHide} centered className={styles.modal}>
      <Modal.Header closeButton className={styles.modalHeader}>
        <Modal.Title>Register {ensName}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className={styles.processInfo}>
          <h6 className={styles.processTitle}>Registration Process</h6>
          {balance && (
            <div className={styles.balanceInfo}>
              <span className={styles.balanceLabel}>Your Balance:</span>
              <span className={styles.balanceValue}>
                {Number(formatEther(balance.value)).toFixed(4)} {balance.symbol}
              </span>
            </div>
          )}
          <ol className={styles.processList}>
            <li>
              <strong>Commit Phase:</strong> First transaction to commit your
              intention to register. This helps prevent front-running.
            </li>
            <li>
              <strong>Waiting Period:</strong> Please expect a waiting period of
              around {chainId === 11155111 ? "60" : "10"} seconds after the
              commit transaction.
            </li>
            <li>
              <strong>Registration Phase:</strong> Second transaction to
              complete the registration and secure your ENS name.
            </li>
          </ol>
          <div className={styles.costNote}>
            <svg
              className={styles.infoIcon}
              viewBox="0 0 24 24"
              width="16"
              height="16"
            >
              <path
                fill="currentColor"
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
              />
            </svg>
            Please ensure you have sufficient{" "}
            {chainId === 1 ? "ETH" : "test ETH"} to cover both:
            <ul>
              <li>Registration fee (varies by name length and duration)</li>
              <li>Gas fees for both transactions</li>
            </ul>
          </div>
        </div>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label>Registration Duration (in years)</Form.Label>
            <Form.Select
              value={durationYears}
              onChange={(e) => setDurationYears(Number(e.target.value))}
            >
              <option value={1}>1 year</option>
              <option value={2}>2 years</option>
              <option value={3}>3 years</option>
            </Form.Select>
          </Form.Group>

          <Button variant="primary" type="submit" disabled={isRegistering}>
            {isRegistering ? "Processing..." : "Register"}
          </Button>
        </Form>
      </Modal.Body>
    </Modal>
  );
}
