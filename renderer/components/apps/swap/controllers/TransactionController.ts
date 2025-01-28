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
  status: "idle" | "confirming" | "success" | "error";
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
      status: "idle",
      stage: "idle",
      loading: false,
      error: null,
    };
  }

  private updateStatus(status: Partial<TransactionStatus>) {
    this.currentStatus = {
      ...this.currentStatus,
      ...status,
      stage: status.stage ?? this.currentStatus.stage,
    };
    this.callbacks.onStatusChange(this.currentStatus);
  }

  async monitorTransaction(hash: string): Promise<void> {
    try {
      this.updateStatus({
        status: "confirming",
        stage: "confirming",
        loading: true,
        hash: hash as `0x${string}`,
      });

      const receipt = await this.provider.waitForTransaction(hash, 1, 60000);

      if (receipt.status === 1) {
        this.updateStatus({
          status: "success",
          stage: "success",
          loading: false,
          error: null,
          hash: hash as `0x${string}`,
        });

        this.callbacks.onSuccess();
      } else {
        this.updateStatus({
          status: "error",
          stage: "idle",
          loading: false,
          error: "Transaction reverted",
        });
      }
    } catch (error: any) {
      this.updateStatus({
        status: "error",
        stage: "idle",
        loading: false,
        error: error.message,
      });
      throw error;
    }
  }
}
