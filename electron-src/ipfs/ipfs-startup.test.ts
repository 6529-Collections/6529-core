import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createReadyLineDetector,
  IPFS_BOOTSTRAP_NODES,
  IpfsStartupCancelledError,
  IpfsStartupSteps,
  runIpfsStartup,
} from "./ipfs-startup";

interface FakeOptions {
  initialized?: boolean;
  attach?: boolean;
  failCommand?: (args: readonly string[]) => boolean;
  cancelAfter?: string;
}

function createFakeSteps(options: FakeOptions = {}) {
  const events: string[] = [];
  let running = 0;
  let maxConcurrent = 0;
  let cancelled = false;

  const steps: IpfsStartupSteps = {
    isRepoInitialized: () => options.initialized ?? true,
    runCommand: async (args) => {
      const name = args.join(" ");
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      events.push(`start ${name}`);
      // Yield so overlapping commands would be visible in maxConcurrent.
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      events.push(`end ${name}`);
      if (options.cancelAfter === name) {
        cancelled = true;
      }
      if (options.failCommand?.(args)) {
        throw new Error(`${name} failed`);
      }
    },
    stopLeftoverDaemon: async () => {
      events.push("stop leftover");
    },
    writeConfig: () => {
      events.push("write config");
    },
    attachToRunningDaemon: async () => {
      events.push("attach");
      return options.attach ?? false;
    },
    startDaemon: async () => {
      events.push("daemon");
    },
    isCancelled: () => cancelled,
    log: { info: () => undefined, warn: () => undefined },
  };

  return { steps, events, maxConcurrent: () => maxConcurrent };
}

describe("IPFS startup sequence", () => {
  it("awaits init before any other repository command on a fresh profile", async () => {
    const fake = createFakeSteps({ initialized: false });
    await runIpfsStartup(fake.steps);

    assert.deepEqual(fake.events.slice(0, 2), ["start init", "end init"]);
    assert.equal(fake.events[2], "stop leftover");
  });

  it("skips init when the repository already exists", async () => {
    const fake = createFakeSteps({ initialized: true });
    await runIpfsStartup(fake.steps);

    assert.ok(!fake.events.includes("start init"));
  });

  it("runs the bootstrap commands one after another, then writes config and starts the daemon", async () => {
    const fake = createFakeSteps();
    await runIpfsStartup(fake.steps);

    assert.equal(fake.maxConcurrent(), 1);
    assert.deepEqual(fake.events, [
      "stop leftover",
      "start bootstrap rm --all",
      "end bootstrap rm --all",
      ...IPFS_BOOTSTRAP_NODES.flatMap((node) => [
        `start bootstrap add ${node}`,
        `end bootstrap add ${node}`,
      ]),
      "write config",
      "attach",
      "daemon",
    ]);
  });

  it("still writes the trusted config and starts the daemon when a bootstrap command fails", async () => {
    const fake = createFakeSteps({
      failCommand: (args) => args[0] === "bootstrap" && args[1] === "add",
    });
    await runIpfsStartup(fake.steps);

    assert.ok(fake.events.includes("write config"));
    assert.equal(fake.events.at(-1), "daemon");
    // The second add never starts after the first one fails.
    assert.equal(
      fake.events.filter((event) => event.startsWith("start bootstrap add"))
        .length,
      1,
    );
  });

  it("rejects when init fails, so the caller can mark IPFS unavailable", async () => {
    const fake = createFakeSteps({
      initialized: false,
      failCommand: (args) => args[0] === "init",
    });

    await assert.rejects(runIpfsStartup(fake.steps), /init failed/);
    assert.ok(!fake.events.includes("daemon"));
  });

  it("does not spawn a daemon when an existing one answers", async () => {
    const fake = createFakeSteps({ attach: true });
    await runIpfsStartup(fake.steps);

    assert.equal(fake.events.at(-1), "attach");
  });

  it("stops before spawning the daemon when the app starts quitting", async () => {
    const fake = createFakeSteps({ cancelAfter: "bootstrap rm --all" });

    await assert.rejects(
      runIpfsStartup(fake.steps),
      (error) => error instanceof IpfsStartupCancelledError,
    );
    assert.ok(!fake.events.includes("daemon"));
    assert.ok(!fake.events.includes("write config"));
  });
});

describe("IPFS daemon readiness line", () => {
  it("matches the readiness line inside one chunk", () => {
    const detect = createReadyLineDetector();
    assert.equal(detect("Initializing daemon...\n"), false);
    assert.equal(detect("Daemon is ready\n"), true);
  });

  it("matches the readiness line split across chunks", () => {
    const detect = createReadyLineDetector();
    assert.equal(detect("Gateway server listening\nDaemon is r"), false);
    assert.equal(detect("eady\n"), true);
  });
});
