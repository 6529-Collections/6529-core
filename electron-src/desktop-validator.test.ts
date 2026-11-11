import assert from "node:assert/strict";
import test from "node:test";
import {
  interpretValidatorStatus,
  openDesktopValidator,
} from "./desktop-validator";

const cycleRoot =
  "0xb82dbe7bbe8e17aff22e43cc349351b3f95c733fcd56bf3237592b023c55b998";
const signedToday = {
  format: 1,
  release: "0.1.0-rc.14",
  role: "SIGNER",
  today: 20767,
  day: { state: "IN_CERTIFICATE", signed: true },
  cycles: [
    { day: 20766, cycle_root: "0x" + "a".repeat(64) },
    { day: 20767, cycle_root: cycleRoot },
  ],
};

test("returns today's counted signature, result and next signing time from live status", () => {
  assert.deepEqual(interpretValidatorStatus(JSON.stringify(signedToday)), {
    service: "running",
    health: "all-good",
    release: "0.1.0-rc.14",
    signing: "counted",
    nextSignatureAt: 1794356100,
    resultRoot: cycleRoot,
  });
});

test("reports the signing accounts and counted TDH share for today's result", () => {
  const certificate = {
    cycle_day: signedToday.today,
    cycle_root: cycleRoot,
    signing_accounts: 157,
    signed_keys: 165,
    signed_weight: 422_186_635,
    w: 466_218_645,
    raw_registered_tdh: 500_000_000,
  };
  const withCertificate = (overrides: Partial<typeof certificate> = {}) =>
    interpretValidatorStatus(
      JSON.stringify({
        ...signedToday,
        cycles: [
          {
            day: signedToday.today,
            cycle_root: cycleRoot,
            certificate: { ...certificate, ...overrides },
          },
        ],
      }),
    );

  const status = withCertificate();
  assert.equal(status.service, "running");
  assert.deepEqual(status.networkAgreement, {
    signingAccounts: 157,
    signedTdhShare: 422_186_635 / 466_218_645,
  });

  for (const overrides of [
    { cycle_day: signedToday.today - 1 },
    { cycle_root: "0x" + "a".repeat(64) },
    { w: 0 },
    { signing_accounts: -1 },
    { signed_weight: certificate.w + 1 },
  ]) {
    const incomplete = withCertificate(overrides);
    assert.equal(incomplete.service, "running");
    assert.equal(incomplete.networkAgreement, undefined);
  }
});

test("keeps a signature visible while distinguishing routine and required updates", () => {
  const withUpdate = (state: string, autoOn = false) =>
    JSON.stringify({
      ...signedToday,
      update: { state, newer: true, auto: { on: autoOn } },
    });
  assert.deepEqual(interpretValidatorStatus(withUpdate("URGENT"), 5), {
    service: "running",
    health: "update-needed",
    release: "0.1.0-rc.14",
    signing: "counted",
    nextSignatureAt: undefined,
    resultRoot: cycleRoot,
  });
  assert.match(
    JSON.stringify(interpretValidatorStatus(withUpdate("AVAILABLE"))),
    /"health":"update-available"/,
  );
  assert.match(
    JSON.stringify(interpretValidatorStatus(withUpdate("URGENT", true))),
    /"health":"update-available"/,
  );
});

test("never shows a stopped validator's cached signature as live", () => {
  assert.deepEqual(interpretValidatorStatus(JSON.stringify(signedToday), 3), {
    service: "stopped",
  });
});

test("does not reuse another day's result or call a sent signature counted", () => {
  const status = interpretValidatorStatus(
    JSON.stringify({
      ...signedToday,
      today: 20768,
      day: { state: "SENT", signed: true },
    }),
  );
  assert.equal(status.service, "running");
  assert.equal(status.signing, "signed");
  assert.equal(status.resultRoot, undefined);
});

test("distinguishes a running node without a signature from an unreadable status", () => {
  const running = interpretValidatorStatus(
    '{"format":1,"day":{"signed":false}}',
  );
  assert.equal(running.service, "running");
  assert.equal(running.signing, "not-signed");
  assert.deepEqual(
    interpretValidatorStatus(JSON.stringify(signedToday), "EACCES"),
    { service: "unavailable" },
  );
  assert.deepEqual(interpretValidatorStatus("invalid JSON"), {
    service: "unavailable",
  });
});

const installation = {
  appPath: "/Applications/6529 Validator.app",
  cliPath: "/Applications/6529 Validator.app/Contents/Resources/validator",
};

test("opens the installed app when Electron returns an empty error string", async () => {
  let openedApp: string | undefined;
  await openDesktopValidator(
    {
      openPath: async (appPath) => {
        openedApp = appPath;
        return "";
      },
      openExternal: async () => assert.fail("Opened the download page"),
    },
    async () => installation,
  );
  assert.equal(openedApp, installation.appPath);
});

test("opens the official download page when Validator is missing", async () => {
  let openedUrl: string | undefined;
  await openDesktopValidator(
    {
      openPath: async () => assert.fail("Opened a local app"),
      openExternal: async (url) => {
        openedUrl = url;
      },
    },
    async () => undefined,
  );
  assert.equal(openedUrl, "https://6529.io/validator");
});

test("reports an OS launch failure without opening the download page", async () => {
  await assert.rejects(
    openDesktopValidator(
      {
        openPath: async () => "Permission denied",
        openExternal: async () => assert.fail("Opened the download page"),
      },
      async () => installation,
    ),
    /6529 Validator could not be opened/,
  );
});
