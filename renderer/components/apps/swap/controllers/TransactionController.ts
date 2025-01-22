import { ethers } from "ethersv5";
import { TransactionReceipt } from "@ethersproject/abstract-provider";

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
  hash?: `0x${string}`;
}

interface TransactionCallbacks {
  onStatusChange: (status: TransactionStatus) => void;
  onSuccess: () => void;
  onError: (error: string) => void;
  showToast: (toast: { type: string; message: string }) => void;
}

export class TransactionController {
  private provider: ethers.providers.Provider;
  private callbacks: TransactionCallbacks;
  private currentStatus: TransactionStatus;

  constructor(
    provider: ethers.providers.Provider,
    callbacks: TransactionCallbacks
  ) {
    this.provider = provider;
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

  async monitorTransaction(hash: string): Promise<void> {
    try {
      this.updateStatus({
        stage: "confirming",
        loading: true,
        hash: hash as `0x${string}`,
      });

      console.debug("[Transaction] Monitoring transaction:", { hash });

      const receipt = await this.provider.waitForTransaction(hash, 1, 60000);

      if (receipt.status === 1) {
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
