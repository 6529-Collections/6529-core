export type QueuedStartRetry =
  | { status: "not-queued" }
  | { status: "blocked"; waitingMessage: string }
  | { status: "ready" };

export function getQueuedWorkerWaitingMessage(blockedReason: string): string {
  if (blockedReason.endsWith(" worker is running")) {
    return `Waiting for ${blockedReason.replace(" worker is running", " worker to finish")}`;
  }
  if (blockedReason === "Transactions worker is changing transaction history") {
    return "Waiting for transaction history update to finish";
  }
  return `Waiting for ${blockedReason}`;
}

export class WorkerStartQueue {
  private queued = false;

  public isQueued(): boolean {
    return this.queued;
  }

  public queue(blockedReason: string): string {
    return this.queueWaitingMessage(
      getQueuedWorkerWaitingMessage(blockedReason),
    );
  }

  public queueWaitingMessage(waitingMessage: string): string {
    this.queued = true;
    return waitingMessage;
  }

  public cancel() {
    this.queued = false;
  }

  public retry(
    workerActive: boolean,
    enabled: boolean,
    blockedReason: string | null,
  ): QueuedStartRetry {
    if (!this.queued || workerActive || !enabled) {
      return { status: "not-queued" };
    }
    if (blockedReason) {
      return {
        status: "blocked",
        waitingMessage: this.queue(blockedReason),
      };
    }
    this.queued = false;
    return { status: "ready" };
  }
}
