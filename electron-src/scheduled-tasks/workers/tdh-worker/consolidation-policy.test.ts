import assert from "node:assert/strict";
import { it } from "node:test";
import {
  loadConsolidationPolicy,
  parseConsolidationPolicy,
} from "./consolidation-policy";

it("uses the selected backend's UTC cutoff, including an earlier staging date", () => {
  for (const date of ["2026-10-15", "2026-10-12"]) {
    const cutoff = `${date}T00:00:00Z`;
    assert.equal(
      parseConsolidationPolicy(
        { consolidation: { four_wallet_activation_at: cutoff } },
        "https://example.com/api/settings",
      ).activationTimestamp,
      Date.parse(cutoff) / 1000,
    );
  }
});
it("isolates policy identity by backend even when dates match", () => {
  const settings = {
    consolidation: { four_wallet_activation_at: "2026-10-15T00:00:00Z" },
  };
  assert.notEqual(
    parseConsolidationPolicy(settings, "prod").key,
    parseConsolidationPolicy(settings, "staging").key,
  );
});
it("rejects missing and malformed policies without substituting a launch date", async () => {
  for (const value of [
    null,
    {},
    { consolidation: {} },
    { consolidation: { four_wallet_activation_at: "2026-02-30T00:00:00Z" } },
  ])
    assert.throws(() => parseConsolidationPolicy(value, "staging"));
  await assert.rejects(loadConsolidationPolicy(undefined));
});
