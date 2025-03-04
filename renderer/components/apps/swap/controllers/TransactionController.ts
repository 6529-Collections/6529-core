import type { PublicClient, Hash } from "viem";

export type TransactionStage =
  | "idle"
  | "approving"
  | "swapping"
  | "confirming"
  | "success"
  | "pending"
  | "complete";

export interface TransactionStatus {
  stage: TransactionStage;
  loading: boolean;
  error: string | null;
  hash?: Hash;
}

interface TransactionCallbacks {
  onStatusChange: (status: TransactionStatus) => void;
  onSuccess: () => void;
  onError: (error: string) => void;
  showToast: (toast: { type: string; message: string }) => void;
}

export class TransactionController {
  private client: PublicClient;
  private callbacks: TransactionCallbacks;
  private currentStatus: TransactionStatus;

  constructor(client: PublicClient, callbacks: TransactionCallbacks) {
    this.client = client;
    this.callbacks = callbacks;
    this.currentStatus = {
      stage: "idle",
      loading: false,
      error: null,
    };
  }

  private updateStatus(status: Partial<TransactionStatus>) {
    this.currentStatus = {
      ...this.currentStatus,
      ...status,
    };
    this.callbacks.onStatusChange(this.currentStatus);
  }

  async monitorTransaction(hash: Hash): Promise<void> {
    try {
      this.updateStatus({
        stage: "confirming",
        loading: true,
        hash,
      });

      console.debug("[Transaction] Monitoring transaction:", { hash });

      const receipt = await this.client.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 60_000,
      });

      if (receipt.status === "success") {
        console.debug("[Transaction] Transaction successful:", receipt);
        this.updateStatus({
          stage: "complete",
          loading: false,
        });

        this.callbacks.showToast({
          type: "success",
          message: "Transaction successful, hash: " + hash,
        });

        this.callbacks.onSuccess();
      } else {
        throw new Error("Transaction failed");
      }
    } catch (error: any) {
      console.error("[Transaction] Monitoring error:", error);

      if (error.message?.includes("Timed out")) {
        this.updateStatus({
          stage: "idle",
          loading: false,
          error: "Transaction timed out - check your wallet for status",
        });
      } else {
        this.updateStatus({
          stage: "idle",
          loading: false,
          error: error.message || "Transaction failed",
        });
      }

      this.callbacks.showToast({
        type: "error",
        message: error.message || "Transaction failed",
      });

      this.callbacks.onError(error.message || "Transaction failed");
    }
  }

  resetStatus(): void {
    this.currentStatus = {
      stage: "idle",
      loading: false,
      error: null,
    };
    this.callbacks.onStatusChange(this.currentStatus);
  }
}
