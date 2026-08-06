import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getQueuedWorkerWaitingMessage,
  WorkerStartQueue,
} from "./worker-start-queue";

describe("worker start queue", () => {
  it("keeps a blocked request queued until its blocker clears", () => {
    const queue = new WorkerStartQueue();

    assert.equal(
      queue.queue("NFTs worker is running"),
      "Waiting for NFTs worker to finish",
    );
    assert.equal(queue.isQueued(), true);
    assert.deepEqual(queue.retry(false, true, "NFTs worker is running"), {
      status: "blocked",
      waitingMessage: "Waiting for NFTs worker to finish",
    });
    assert.deepEqual(queue.retry(false, true, null), { status: "ready" });
    assert.equal(queue.isQueued(), false);
  });

  it("coalesces repeated queue requests and supports cancellation", () => {
    const queue = new WorkerStartQueue();

    queue.queue("NFTs worker is running");
    queue.queue("NFTs worker is running");
    assert.equal(queue.isQueued(), true);
    queue.cancel();
    assert.equal(queue.isQueued(), false);
    assert.deepEqual(queue.retry(false, true, null), {
      status: "not-queued",
    });
  });

  it("does not release a queue while its worker is active or disabled", () => {
    const queue = new WorkerStartQueue();
    queue.queue("NFTs worker is running");

    assert.deepEqual(queue.retry(true, true, null), {
      status: "not-queued",
    });
    assert.deepEqual(queue.retry(false, false, null), {
      status: "not-queued",
    });
    assert.equal(queue.isQueued(), true);
  });

  it("provides a specific transaction-mutation waiting message", () => {
    assert.equal(
      getQueuedWorkerWaitingMessage(
        "Transactions worker is changing transaction history",
      ),
      "Waiting for transaction history update to finish",
    );
  });

  it("preserves an exact checkpoint waiting message", () => {
    const queue = new WorkerStartQueue();
    const waitingMessage =
      "Waiting for Transactions to reach block 100 — currently 98";

    assert.equal(queue.queueWaitingMessage(waitingMessage), waitingMessage);
    assert.equal(queue.isQueued(), true);
  });
});
