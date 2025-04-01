import { Modal, Button } from "react-bootstrap";
import { TokenPair } from "../types";
import { useState } from "react";
import { Loader2 } from "lucide-react";

type TransactionStatus = "idle" | "pending" | "success" | "error";

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
  loading: initialLoading,
}: RevokeModalProps) {
  const [status, setStatus] = useState<TransactionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialLoading);

  const handleRevoke = async () => {
    try {
      setLoading(true);
      setStatus("pending");
      setError(null);

      await onRevoke();

      setStatus("success");

      // Auto-close after success (3 seconds)
      setTimeout(() => {
        if (status === "success") {
          handleClose();
        }
      }, 3000);
    } catch (err) {
      console.error("Revoke error:", err);
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Failed to revoke approval"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Only allow closing if not in pending state
    if (status !== "pending") {
      setStatus("idle");
      setError(null);
      onHide();
    }
  };

  return (
    <Modal
      show={show}
      onHide={handleClose}
      centered
      contentClassName="tw-bg-[rgba(26,26,26,0.95)] tw-backdrop-blur-[20px] tw-border tw-border-[rgba(255,255,255,0.1)] tw-rounded-2xl tw-text-white"
      backdrop="static" // Prevent closing by clicking outside when transaction is pending
    >
      <Modal.Header
        closeButton={status !== "pending"}
        className="tw-border-b tw-border-b-[rgba(255,255,255,0.1)] tw-p-5 [&_.btn-close]:tw-filter [&_.btn-close]:tw-invert [&_.btn-close]:tw-grayscale [&_.btn-close]:tw-brightness-[200%]"
      >
        <Modal.Title className="tw-text-xl tw-font-semibold">
          {status === "success"
            ? "Approval Revoked"
            : status === "error"
            ? "Revocation Failed"
            : "Revoke Token Approval"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="tw-p-6">
        {status === "idle" && (
          <>
            <p className="tw-text-[rgba(255,255,255,0.9)] tw-mb-5 tw-text-[0.95rem] tw-leading-relaxed">
              This will revoke the approval for {pair.inputToken.symbol} to be
              spent by the Uniswap protocol. You'll need to approve again for
              future swaps.
            </p>
            <div className="tw-flex tw-gap-4 tw-p-4 tw-bg-[rgba(255,59,48,0.1)] tw-border tw-border-[rgba(255,59,48,0.2)] tw-rounded-xl">
              <div className="tw-text-xl">⚠️</div>
              <div className="tw-text-[rgba(255,255,255,0.8)] tw-text-[0.9rem] tw-leading-relaxed">
                Only revoke if you don't plan to make any more swaps soon.
                Revoking and re-approving will cost additional gas fees.
              </div>
            </div>
          </>
        )}

        {status === "pending" && (
          <div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-py-6">
            <Loader2
              size={48}
              className="tw-text-[#ffb019] tw-animate-spin tw-mb-4"
            />
            <p className="tw-text-[rgba(255,255,255,0.9)] tw-text-center tw-text-[0.95rem]">
              Revoking approval for {pair.inputToken.symbol}...
            </p>
            <p className="tw-text-[rgba(255,255,255,0.6)] tw-text-center tw-text-sm tw-mt-2">
              Please confirm the transaction in your wallet and wait for it to
              be processed.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-py-6">
            <div className="tw-w-12 tw-h-12 tw-rounded-full tw-bg-[rgba(52,199,89,0.2)] tw-flex tw-items-center tw-justify-center tw-mb-4">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M20 6L9 17L4 12"
                  stroke="#34C759"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="tw-text-[rgba(255,255,255,0.9)] tw-text-center tw-text-[0.95rem]">
              Successfully revoked approval for {pair.inputToken.symbol}
            </p>
            <p className="tw-text-[rgba(255,255,255,0.6)] tw-text-center tw-text-sm tw-mt-2">
              You'll need to approve again for future swaps.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="tw-flex tw-flex-col tw-items-start tw-justify-center tw-py-2">
            <div className="tw-flex tw-gap-4 tw-p-4 tw-bg-[rgba(255,59,48,0.1)] tw-border tw-border-[rgba(255,59,48,0.2)] tw-rounded-xl tw-w-full tw-mb-4">
              <div className="tw-text-xl">❌</div>
              <div className="tw-text-[rgba(255,255,255,0.8)] tw-text-[0.9rem] tw-leading-relaxed">
                <p className="tw-font-medium tw-text-[#ff3b30] tw-mb-1">
                  Transaction Failed
                </p>
                <p className="tw-text-[rgba(255,255,255,0.8)]">
                  {error ||
                    "There was an error revoking your approval. Please try again."}
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer className="tw-border-t tw-border-t-[rgba(255,255,255,0.1)] tw-p-5">
        {status === "idle" && (
          <>
            <Button
              variant="secondary"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleRevoke}
              disabled={loading}
              className="tw-bg-[rgb(255,59,48)] tw-border-[rgb(255,59,48)] hover:tw-bg-[rgb(230,53,43)] hover:tw-border-[rgb(230,53,43)] active:tw-bg-[rgb(204,47,38)] active:tw-border-[rgb(204,47,38)]"
            >
              {loading ? "Revoking..." : "Revoke Approval"}
            </Button>
          </>
        )}

        {status === "pending" && (
          <Button
            variant="secondary"
            disabled
            className="tw-opacity-50 tw-cursor-not-allowed"
          >
            Transaction in Progress...
          </Button>
        )}

        {status === "success" && (
          <Button
            variant="primary"
            onClick={handleClose}
            className="tw-bg-[#34C759] tw-border-[#34C759] hover:tw-bg-[#2eb350] hover:tw-border-[#2eb350]"
          >
            Close
          </Button>
        )}

        {status === "error" && (
          <>
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleRevoke}
              className="tw-bg-[rgb(255,59,48)] tw-border-[rgb(255,59,48)] hover:tw-bg-[rgb(230,53,43)] hover:tw-border-[rgb(230,53,43)] active:tw-bg-[rgb(204,47,38)] active:tw-border-[rgb(204,47,38)]"
            >
              Try Again
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}
