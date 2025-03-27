// renderer/components/apps/ens/components/MyENSNames.tsx

import { useMyENSNames } from "../hooks/useMyENSNames";
import { Spinner, Alert, Button } from "react-bootstrap";
import { useAccount } from "wagmi";
import { RefreshCw, Calendar, Award } from "lucide-react";

export function MyENSNames() {
  const { address, isConnected } = useAccount();
  const { ensNames, isLoading, error, refetch } = useMyENSNames();

  if (!isConnected) {
    return (
      <div className="tw-bg-zinc-900/30 tw-backdrop-blur-sm tw-rounded-lg tw-border tw-border-zinc-800/50 tw-p-8 tw-shadow-lg tw-text-center">
        <h3 className="tw-text-xl tw-text-zinc-300 tw-mb-4">
          Connect Your Wallet
        </h3>
        <p className="tw-text-zinc-400 tw-mb-4">
          Connect your wallet to view your ENS names.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="tw-flex tw-justify-center tw-items-center tw-py-12">
        <Spinner animation="border" role="status" className="tw-text-zinc-400">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        variant="danger"
        className="tw-bg-red-900/30 tw-border-red-800 tw-text-white"
      >
        <h4>Error loading your ENS names</h4>
        <p>{error.message}</p>
        <Button
          variant="outline-light"
          size="sm"
          onClick={() => refetch()}
          className="tw-mt-2"
        >
          <RefreshCw size={14} className="tw-mr-2" />
          Try Again
        </Button>
      </Alert>
    );
  }

  if (ensNames.length === 0) {
    return (
      <div className="tw-bg-zinc-900/30 tw-backdrop-blur-sm tw-rounded-lg tw-border tw-border-zinc-800/50 tw-p-8 tw-shadow-lg tw-text-center">
        <h3 className="tw-text-xl tw-text-zinc-300 tw-mb-4">
          No ENS Names Found
        </h3>
        <p className="tw-text-zinc-400 tw-mb-4">
          The wallet address{" "}
          <span className="tw-font-mono tw-text-sm">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </span>{" "}
          doesn't own any ENS names.
        </p>
        <Button
          variant="secondary"
          onClick={() => refetch()}
          className="tw-bg-zinc-700 hover:tw-bg-zinc-600 tw-border-0"
        >
          <RefreshCw size={16} className="tw-mr-2" />
          Refresh
        </Button>
      </div>
    );
  }

  // Sort: Primary name first, then alphabetically
  const sortedNames = [...ensNames].sort((a, b) => {
    if (a.isPrimary) return -1;
    if (b.isPrimary) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <div className="tw-flex tw-justify-between tw-items-center tw-mb-6">
        <h3 className="tw-text-xl tw-font-bold tw-text-white">
          Your ENS Names
        </h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => refetch()}
          className="tw-bg-zinc-700 hover:tw-bg-zinc-600 tw-border-0"
        >
          <RefreshCw size={14} className="tw-mr-2" />
          Refresh
        </Button>
      </div>

      <div className="tw-grid tw-gap-4 tw-animate-fadeIn">
        {sortedNames.map((ens) => (
          <div
            key={ens.id}
            className="tw-bg-zinc-900/80 tw-border tw-border-zinc-800 tw-rounded-lg tw-p-5 tw-shadow-lg"
          >
            <div className="tw-flex tw-justify-between tw-items-start tw-mb-4">
              <h4 className="tw-text-lg tw-font-bold tw-text-white">
                {ens.name}
              </h4>
              {ens.isPrimary && (
                <span className="tw-bg-blue-600 tw-text-white tw-text-xs tw-px-2 tw-py-1 tw-rounded tw-font-medium tw-flex tw-items-center">
                  <Award size={12} className="tw-mr-1" />
                  Primary
                </span>
              )}
            </div>

            <div className="tw-grid tw-gap-3 tw-text-sm">
              <div className="tw-flex tw-items-center">
                <Calendar size={16} className="tw-text-zinc-500 tw-mr-2" />
                <div className="tw-flex tw-flex-col">
                  <span className="tw-text-zinc-400 tw-text-xs">
                    Registered:
                  </span>
                  <span className="tw-text-zinc-200">
                    {new Date(ens.registrationDate).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {ens.expiryDate && (
                <div className="tw-flex tw-items-center">
                  <Calendar size={16} className="tw-text-zinc-500 tw-mr-2" />
                  <div className="tw-flex tw-flex-col">
                    <span className="tw-text-zinc-400 tw-text-xs">
                      Expires:
                    </span>
                    <span className="tw-text-zinc-200">
                      {new Date(ens.expiryDate).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="tw-mt-6 tw-text-center tw-text-zinc-400 tw-text-sm">
        <p>These are the ENS names associated with your wallet address.</p>
        <p className="tw-mt-1">
          Primary ENS name is used for reverse resolution.
        </p>
      </div>
    </div>
  );
}
