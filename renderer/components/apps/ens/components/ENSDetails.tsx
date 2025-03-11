// components/ENSDetails.tsx
import { useState, useEffect } from "react";
import { Card, Button, Badge } from "react-bootstrap";
import { useChainId, usePublicClient, useEnsText, useEnsAddress } from "wagmi";
import { ENS_CONTRACTS } from "../constants";
import { ENS_CONTROLLER_ABI } from "../abis";
import { ENSRegistrationModal } from "./ENSRegistrationModal";

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

  const [isAvailable, setIsAvailable] = useState<boolean | undefined>(false);

  // Basic check for name validity
  const isValidName = (name: string) => {
    return /^[-a-z0-9]+\.(eth)$/.test(name.toLowerCase()) && name.length >= 3;
  };

  useEffect(() => {
    async function checkAvailability() {
      if (!ensName || !isValidName(ensName) || !controllerAddress) {
        setIsAvailable(false);
        return;
      }

      try {
        const label = ensName.replace(".eth", "");
        const result = await publicClient?.readContract({
          address: controllerAddress,
          abi: ENS_CONTROLLER_ABI,
          functionName: "available",
          args: [label],
        });

        setIsAvailable(Boolean(result));
      } catch (error) {
        console.error("Error checking name availability:", error);
        setIsAvailable(false);
      }
    }

    checkAvailability();
  }, [ensName, ensOwner, publicClient, controllerAddress]);

  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const handleRegistrationSuccess = () => {
    setIsAvailable(false);
  };

  return (
    <>
      <Card className="tw-bg-zinc-900/80 tw-border tw-border-zinc-800 tw-rounded-xl tw-text-white tw-backdrop-blur-md tw-shadow-xl tw-overflow-hidden tw-transition-all tw-duration-300 tw-animate-fadeIn">
        <div className="tw-bg-gradient-to-r tw-from-black/50 tw-to-zinc-900/50 tw-h-16 tw-relative">
          <div className="tw-absolute tw-inset-0 tw-flex tw-items-center tw-justify-center">
            <h3 className="tw-text-2xl tw-font-bold tw-text-white tw-drop-shadow-md">
              {ensName}
            </h3>
          </div>
        </div>

        <Card.Body className="tw-p-6">
          {avatar && (
            <div className="tw-text-center tw-mb-6 tw--mt-12">
              <img
                src={avatar}
                alt="ENS Avatar"
                className="tw-w-24 tw-h-24 tw-rounded-full tw-border-4 tw-border-zinc-900 tw-shadow-xl tw-mx-auto tw-object-cover"
              />
            </div>
          )}

          <div className="tw-grid tw-gap-5 tw-mt-4">
            <div className="tw-flex tw-flex-col tw-gap-2">
              <span className="tw-text-white/60 tw-text-sm tw-uppercase tw-tracking-wider tw-font-medium">
                Address:
              </span>
              <span className="tw-font-mono tw-break-all tw-bg-black/20 tw-p-2 tw-rounded-md tw-text-sm">
                {ensOwner || "Not registered"}
              </span>
            </div>

            <div className="tw-flex tw-flex-col tw-gap-2">
              <span className="tw-text-white/60 tw-text-sm tw-uppercase tw-tracking-wider tw-font-medium">
                Status:
              </span>
              <div>
                {isAvailable ? (
                  <Badge
                    bg="success"
                    className="tw-bg-zinc-700 tw-text-white tw-font-normal tw-py-1.5 tw-px-3"
                  >
                    Available
                  </Badge>
                ) : ensOwner ? (
                  <Badge
                    bg="danger"
                    className="tw-bg-zinc-800 tw-text-white tw-font-normal tw-py-1.5 tw-px-3"
                  >
                    Owned and Configured
                  </Badge>
                ) : (
                  <Badge
                    bg="warning"
                    className="tw-bg-zinc-600 tw-text-white tw-font-normal tw-py-1.5 tw-px-3"
                  >
                    Registered but Not Configured
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {isAvailable && (
            <div className="tw-mt-8 tw-text-center">
              <Button
                variant="primary"
                onClick={() => setShowRegisterModal(true)}
                className="tw-bg-zinc-800 hover:tw-bg-zinc-700 tw-border-0 tw-py-3 tw-px-8 tw-text-lg tw-rounded-lg tw-transition-all tw-shadow-lg hover:tw-shadow-xl"
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
        onRegistrationSuccess={handleRegistrationSuccess}
      />
    </>
  );
}
