export type QueuedStartRetry<T> =
  | { status: "not-queued" }
  | { status: "blocked"; waitingMessage: string }
  | { status: "ready"; intent?: T };

export function getQueuedWorkerWaitingMessage(blockedReason: string): string {
  if (blockedReason.endsWith(" worker is running")) {
    return `Waiting for ${blockedReason.replace(" worker is running", " worker to finish")}`;
  }
  if (blockedReason === "Transactions worker is changing transaction history") {
    return "Waiting for transaction history update to finish";
  }
  return `Waiting for ${blockedReason}`;
}

export class WorkerStartQueue<T = never> {
  private queued = false;
  private intent: T | undefined;

  public isQueued(): boolean {
    return this.queued;
  }

  public queue(blockedReason: string, intent?: T): string {
    return this.queueWaitingMessage(
      getQueuedWorkerWaitingMessage(blockedReason),
      intent,
    );
  }

  public queueWaitingMessage(waitingMessage: string, intent?: T): string {
    this.queued = true;
    this.intent = intent;
    return waitingMessage;
  }

  public cancel() {
    this.queued = false;
    this.intent = undefined;
  }

  public retry(
    workerActive: boolean,
    enabled: boolean,
    blockedReason: string | null,
  ): QueuedStartRetry<T> {
    if (!this.queued || workerActive || !enabled) {
      return { status: "not-queued" };
    }
    if (blockedReason) {
      return {
        status: "blocked",
        waitingMessage: getQueuedWorkerWaitingMessage(blockedReason),
      };
    }
    const intent = this.intent;
    this.queued = false;
    this.intent = undefined;
    return intent === undefined
      ? { status: "ready" }
      : { status: "ready", intent };
  }
}
