import assert from "node:assert/strict";
import test from "node:test";
import { interpretValidatorStatus } from "./desktop-validator";

const signedToday = JSON.stringify({
  format: 1,
  day: { state: "IN_CERTIFICATE", signed: true },
});

test("shows today's signature even if the live validator reports a warning", () => {
  assert.equal(interpretValidatorStatus(signedToday), "signed");
  assert.equal(interpretValidatorStatus(signedToday, 5), "signed");
});

test("never shows a stopped validator's cached signature as live", () => {
  assert.equal(interpretValidatorStatus(signedToday, 3), "stopped");
});

test("distinguishes a running node without a signature from an unreadable status", () => {
  assert.equal(
    interpretValidatorStatus('{"format":1,"day":{"signed":false}}'),
    "running",
  );
  assert.equal(interpretValidatorStatus(signedToday, "EACCES"), "unavailable");
  assert.equal(interpretValidatorStatus("invalid JSON"), "unavailable");
});
