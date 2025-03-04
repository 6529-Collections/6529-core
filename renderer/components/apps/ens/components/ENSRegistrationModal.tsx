import { useState, useEffect } from "react";
import {
  Modal,
  Form,
  Button,
  ProgressBar,
  Spinner,
  Alert,
} from "react-bootstrap";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
  useBalance,
} from "wagmi";
import { formatEther } from "viem";
import {
  ENS_CONTRACTS,
  MIN_REGISTRATION_DURATION,
  MAX_REGISTRATION_DURATION,
} from "../constants";
import { ENS_CONTROLLER_ABI } from "../abis";

interface ENSRegistrationModalProps {
  show: boolean;
  onHide: () => void;
  ensName: string;
  onRegistrationSuccess?: () => void;
}

// Define registration steps
type RegistrationStep =
  | "initial" // Initial state - form display
  | "committing" // Sending commit transaction
  | "waiting" // Waiting for commit to be ready
  | "registering" // Sending registration transaction
  | "complete" // Registration complete
  | "error"; // Error state

export function ENSRegistrationModal({
  show,
  onHide,
  ensName,
  onRegistrationSuccess,
}: ENSRegistrationModalProps) {
  const { address: userAddress } = useAccount();
  const { data: balance } = useBalance({
    address: userAddress,
  });
  const chainIdBigInt = useChainId();
  const chainId = Number(chainIdBigInt);
  const publicClient = usePublicClient({ chainId });
  const walletClient = useWalletClient({ chainId });

  const [durationYears, setDurationYears] = useState(1);
  const [currentStep, setCurrentStep] = useState<RegistrationStep>("initial");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [waitingProgress, setWaitingProgress] = useState(0);
  const [secret, setSecret] = useState<`0x${string}` | null>(null);
  const [estimatedPrice, setEstimatedPrice] = useState<bigint | null>(null);
  const [waitingTimeTotal, setWaitingTimeTotal] = useState(0);
  const [waitingTimeElapsed, setWaitingTimeElapsed] = useState(0);

  const controllerAddress =
    ENS_CONTRACTS[chainId as keyof typeof ENS_CONTRACTS]?.controller;
  const resolverAddress =
    ENS_CONTRACTS[chainId as keyof typeof ENS_CONTRACTS]?.publicResolver;

  // Reset state when modal is opened
  useEffect(() => {
    if (show) {
      setCurrentStep("initial");
      setErrorMessage(null);
      setWaitingProgress(0);
      setSecret(null);
      setEstimatedPrice(null);
      setWaitingTimeElapsed(0);
      setWaitingTimeTotal(0);
    }
  }, [show]);

  // Fetch estimated price when duration changes
  useEffect(() => {
    async function fetchEstimatedPrice() {
      if (!publicClient || !controllerAddress || currentStep !== "initial")
        return;

      try {
        const durationInSeconds = BigInt(durationYears * 365 * 24 * 60 * 60);
        const price = await publicClient.readContract({
          address: controllerAddress as `0x${string}`,
          abi: ENS_CONTROLLER_ABI,
          functionName: "rentPrice",
          args: [ensName.replace(".eth", ""), durationInSeconds],
        });
        setEstimatedPrice(price as bigint);
      } catch (error) {
        console.error("Error fetching price estimate:", error);
      }
    }

    fetchEstimatedPrice();
  }, [durationYears, publicClient, controllerAddress, ensName, currentStep]);

  // Progress bar update for waiting period
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (currentStep === "waiting" && waitingTimeTotal > 0) {
      interval = setInterval(() => {
        setWaitingTimeElapsed((prev) => {
          const newValue = prev + 1;
          const progress = Math.min((newValue / waitingTimeTotal) * 100, 100);
          setWaitingProgress(progress);

          if (newValue >= waitingTimeTotal) {
            clearInterval(interval!);
          }

          return newValue;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentStep, waitingTimeTotal]);

  // Generate a random secret
  function generateSecret(): `0x${string}` {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    return ("0x" +
      Array.from(randomBytes, (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("")) as `0x${string}`;
  }

  async function startRegistration() {
    try {
      if (!walletClient.data || !publicClient) {
        setErrorMessage("Wallet not connected or public client unavailable.");
        setCurrentStep("error");
        return;
      }
      if (!controllerAddress || !resolverAddress) {
        setErrorMessage("No valid ENS controller/resolver on this chain.");
        setCurrentStep("error");
        return;
      }
      if (!userAddress) {
        setErrorMessage("No user address found. Connect your wallet first.");
        setCurrentStep("error");
        return;
      }

      // 1) Duration validation
      const durationInSeconds = BigInt(durationYears * 365 * 24 * 60 * 60);
      if (
        durationInSeconds < MIN_REGISTRATION_DURATION ||
        durationInSeconds > MAX_REGISTRATION_DURATION
      ) {
        setErrorMessage(
          `Duration must be between 28 days and 1 year. You chose ${durationYears} year(s).`
        );
        setCurrentStep("error");
        return;
      }

      // 2) Rent price
      const price = await publicClient.readContract({
        address: controllerAddress as `0x${string}`,
        abi: ENS_CONTROLLER_ABI,
        functionName: "rentPrice",
        args: [ensName.replace(".eth", ""), durationInSeconds],
      });
      setEstimatedPrice(price as bigint);

      // Check user balance
      const userBalance = await publicClient.getBalance({
        address: walletClient.data.account.address,
      });

      if (userBalance < (price as bigint)) {
        setErrorMessage(
          `Insufficient balance. You need at least ${formatEther(
            price as bigint
          )} ETH for the registration fee.`
        );
        setCurrentStep("error");
        return;
      }

      // 3) Make commitment
      setCurrentStep("committing");
      const newSecret = generateSecret();
      setSecret(newSecret);

      const emptyData: `0x${string}`[] = [];
      // Set reverseRecord based on network
      const reverseRecord = chainId === 1; // true for mainnet, false for others
      const ownerControlledFuses = 0;
      const label = ensName.replace(".eth", "");

      const commitment = await publicClient.readContract({
        address: controllerAddress as `0x${string}`,
        abi: ENS_CONTROLLER_ABI,
        functionName: "makeCommitment",
        args: [
          label,
          userAddress,
          durationInSeconds,
          newSecret,
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

      // 4) Wait minCommitmentAge
      setCurrentStep("waiting");
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

      // Set total waiting time for progress bar
      setWaitingTimeTotal(requiredOnChainSeconds);
      setWaitingTimeElapsed(0);

      // Wait for the required time
      while (true) {
        const currentBlock = await publicClient.getBlock();
        const currentTimestamp = Number(currentBlock.timestamp);
        const delta = currentTimestamp - commitBlockTimestamp;

        setWaitingTimeElapsed(delta);
        const progress = Math.min((delta / requiredOnChainSeconds) * 100, 100);
        setWaitingProgress(progress);

        if (delta >= requiredOnChainSeconds) break;
        await new Promise((r) => setTimeout(r, 5000));
      }

      // (Optional) final availability check
      const stillAvailable = await publicClient.readContract({
        address: controllerAddress as `0x${string}`,
        abi: ENS_CONTROLLER_ABI,
        functionName: "available",
        args: [label],
      });
      if (!stillAvailable) {
        setErrorMessage(
          "Name is no longer available. Another user registered it."
        );
        setCurrentStep("error");
        return;
      }

      // 5) Register
      setCurrentStep("registering");
      const { request: registerRequest } = await publicClient.simulateContract({
        address: controllerAddress as `0x${string}`,
        abi: ENS_CONTROLLER_ABI,
        functionName: "register",
        account: walletClient.data.account,
        args: [
          label,
          userAddress,
          durationInSeconds,
          newSecret,
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
      await publicClient.waitForTransactionReceipt({
        hash: registerTxHash,
      });

      // 6) Complete
      setCurrentStep("complete");
      window.seedConnector.showToast({
        type: "success",
        message: `Successfully registered ${ensName}!`,
      });

      // Call the success callback to update parent state
      if (onRegistrationSuccess) {
        onRegistrationSuccess();
      }
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

      setErrorMessage(msg);
      setCurrentStep("error");
    }
  }

  // Handle modal close attempts
  const handleModalClose = () => {
    // Prevent closing during active operations
    if (["committing", "waiting", "registering"].includes(currentStep)) {
      return;
    }

    // Allow closing in initial, complete, or error states
    onHide();
  };

  // Render different content based on current step
  const renderModalContent = () => {
    switch (currentStep) {
      case "initial":
        return (
          <>
            <div className="tw-flex tw-flex-col tw-gap-4">
              <h6 className="tw-text-lg tw-font-semibold tw-text-white">
                Registration Process
              </h6>
              {balance && (
                <div className="tw-flex tw-justify-between tw-items-center">
                  <span className="tw-text-gray-300 tw-text-sm">
                    Your Balance:
                  </span>
                  <span className="tw-font-mono tw-text-white">
                    {Number(formatEther(balance.value)).toFixed(4)}{" "}
                    {balance.symbol}
                  </span>
                </div>
              )}
              {estimatedPrice && (
                <div className="tw-bg-black/20 tw-rounded-lg tw-p-3 tw-my-4 tw-flex tw-flex-col tw-gap-1">
                  <span className="tw-text-gray-300 tw-text-sm">
                    Estimated Cost:
                  </span>
                  <span className="tw-text-xl tw-font-semibold tw-text-blue-400">
                    {Number(formatEther(estimatedPrice)).toFixed(4)} ETH
                  </span>
                  <small className="tw-text-gray-400 tw-text-xs tw-mt-1">
                    (plus gas fees for two transactions)
                  </small>
                </div>
              )}
              <ol className="tw-list-decimal tw-pl-5 tw-space-y-3">
                <li>
                  <strong>Commit Phase:</strong> First transaction to commit
                  your intention to register. This helps prevent front-running.
                </li>
                <li>
                  <strong>Waiting Period:</strong> Please expect a waiting
                  period of around {chainId === 11155111 ? "60" : "10"} seconds
                  after the commit transaction.
                </li>
                <li>
                  <strong>Registration Phase:</strong> Second transaction to
                  complete the registration and secure your ENS name.
                </li>
              </ol>
              <div className="tw-bg-blue-900/20 tw-rounded-lg tw-p-3 tw-flex tw-items-start tw-gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="tw-h-5 tw-w-5 tw-text-blue-400 tw-mt-0.5 tw-flex-shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                Please ensure you have sufficient{" "}
                {chainId === 1 ? "ETH" : "test ETH"} to cover both:
                <ul className="tw-list-disc tw-pl-5">
                  <li>Registration fee (varies by name length and duration)</li>
                  <li>Gas fees for both transactions</li>
                </ul>
              </div>
            </div>
            <Form
              onSubmit={(e) => {
                e.preventDefault();
                startRegistration();
              }}
              className="tw-mt-4"
            >
              <Form.Group className="tw-mb-3">
                <Form.Label>Registration Duration (in years)</Form.Label>
                <Form.Select
                  value={durationYears}
                  onChange={(e) => setDurationYears(Number(e.target.value))}
                  className="tw-bg-gray-800 tw-text-white tw-border-gray-700"
                >
                  <option value={1}>1 year</option>
                  <option value={2}>2 years</option>
                  <option value={3}>3 years</option>
                </Form.Select>
              </Form.Group>

              <Button
                variant="primary"
                type="submit"
                className="tw-bg-blue-500 hover:tw-bg-blue-600 tw-border-0 tw-py-2 tw-px-4 tw-rounded"
              >
                Start Registration
              </Button>
            </Form>
          </>
        );

      case "committing":
        return (
          <div className="tw-flex tw-flex-col tw-gap-6">
            <h5 className="tw-text-xl tw-font-semibold tw-text-white">
              Step 1: Committing
            </h5>
            <div className="tw-flex tw-flex-col tw-gap-4">
              <p>Sending your commitment transaction to the blockchain...</p>
              <p>
                Please confirm the transaction in your wallet when prompted.
              </p>
              <div className="tw-flex tw-justify-center tw-my-6">
                <Spinner animation="border" role="status" variant="primary">
                  <span className="visually-hidden">Loading...</span>
                </Spinner>
              </div>
              <Alert
                variant="warning"
                className="tw-bg-zinc-800/70 tw-border-zinc-700 tw-text-zinc-300"
              >
                Please do not close this window or your browser during the
                registration process.
              </Alert>
            </div>
          </div>
        );

      case "waiting":
        return (
          <div className="tw-flex tw-flex-col tw-gap-6">
            <h5 className="tw-text-xl tw-font-semibold tw-text-white">
              Step 2: Waiting Period
            </h5>
            <div className="tw-flex tw-flex-col tw-gap-4">
              <p>
                Your commitment has been recorded on the blockchain. Now we need
                to wait for the required time period before proceeding to
                registration.
              </p>
              <p>
                Time remaining:{" "}
                {Math.max(waitingTimeTotal - waitingTimeElapsed, 0)} seconds
              </p>
              <ProgressBar
                now={waitingProgress}
                label={`${Math.round(waitingProgress)}%`}
                className="tw-h-6 tw-my-4 tw-bg-gray-800"
                variant="info"
              />
              <Alert
                variant="warning"
                className="tw-bg-zinc-800/70 tw-border-zinc-700 tw-text-zinc-300"
              >
                Please do not close this window or your browser during the
                waiting period.
              </Alert>
            </div>
          </div>
        );

      case "registering":
        return (
          <div className="tw-flex tw-flex-col tw-gap-6">
            <h5 className="tw-text-xl tw-font-semibold tw-text-white">
              Step 3: Registering
            </h5>
            <div className="tw-flex tw-flex-col tw-gap-4">
              <p>Sending your registration transaction to the blockchain...</p>
              <p>
                Please confirm the transaction in your wallet when prompted.
              </p>
              <div className="tw-flex tw-justify-center tw-my-6">
                <Spinner animation="border" role="status" variant="primary">
                  <span className="visually-hidden">Loading...</span>
                </Spinner>
              </div>
              <Alert
                variant="warning"
                className="tw-bg-zinc-800/70 tw-border-zinc-700 tw-text-zinc-300"
              >
                Please do not close this window or your browser during the
                registration process.
              </Alert>
            </div>
          </div>
        );

      case "complete":
        return (
          <div className="tw-flex tw-flex-col tw-gap-6">
            <h5 className="tw-text-xl tw-font-semibold tw-text-white">
              Registration Complete!
            </h5>
            <div className="tw-flex tw-flex-col tw-gap-4">
              <Alert
                variant="success"
                className="tw-bg-zinc-800/70 tw-border-zinc-700 tw-text-zinc-300"
              >
                <p>
                  Congratulations! You have successfully registered {ensName}.
                </p>
                <p>
                  The name is now yours and will be visible in your wallet and
                  ENS applications.
                </p>
              </Alert>
              <Button
                variant="primary"
                onClick={onHide}
                className="tw-min-w-[100px] tw-bg-zinc-700 hover:tw-bg-zinc-600 tw-border-0"
              >
                Close
              </Button>
            </div>
          </div>
        );

      case "error":
        return (
          <div className="tw-flex tw-flex-col tw-gap-6">
            <h5 className="tw-text-xl tw-font-semibold tw-text-white">
              Registration Error
            </h5>
            <div className="tw-flex tw-flex-col tw-gap-4">
              <Alert
                variant="danger"
                className="tw-bg-zinc-800/70 tw-border-zinc-700 tw-text-zinc-300"
              >
                <p>{errorMessage}</p>
              </Alert>
              <div className="tw-flex tw-gap-4 tw-mt-4">
                <Button
                  variant="secondary"
                  onClick={onHide}
                  className="tw-min-w-[100px] tw-bg-zinc-800 hover:tw-bg-zinc-700 tw-border-0"
                >
                  Close
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setCurrentStep("initial");
                    setErrorMessage(null);
                  }}
                  className="tw-min-w-[100px] tw-bg-zinc-700 hover:tw-bg-zinc-600 tw-border-0"
                >
                  Try Again
                </Button>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <Modal
      show={show}
      onHide={handleModalClose}
      centered
      size="lg"
      className="tw-bg-black/80"
      backdrop={
        ["committing", "waiting", "registering"].includes(currentStep)
          ? "static"
          : true
      }
      keyboard={!["committing", "waiting", "registering"].includes(currentStep)}
    >
      <Modal.Header
        closeButton={
          !["committing", "waiting", "registering"].includes(currentStep)
        }
        className="tw-bg-gradient-to-r tw-from-zinc-900 tw-to-black tw-border-0 tw-text-white tw-py-4"
      >
        <Modal.Title className="tw-font-bold tw-flex tw-items-center tw-gap-2">
          <span className="tw-bg-zinc-500 tw-w-2 tw-h-6 tw-rounded-full tw-inline-block tw-mr-2"></span>
          Register {ensName}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="tw-bg-zinc-900 tw-text-white tw-p-6">
        {renderModalContent()}
      </Modal.Body>
    </Modal>
  );
}
