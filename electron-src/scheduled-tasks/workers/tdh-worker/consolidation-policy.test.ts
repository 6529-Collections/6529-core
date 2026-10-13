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
        {
          consolidation: {
            max_wallets: 4,
            ungated_max_wallets: 3,
            four_wallet_activation_at: cutoff,
          },
        },
        "https://example.com/api/settings",
      ).activationTimestamp,
      Date.parse(cutoff) / 1000,
    );
  }
});
it("isolates policy identity by backend even when dates match", () => {
  const settings = {
    consolidation: {
      max_wallets: 4,
      ungated_max_wallets: 3,
      four_wallet_activation_at: "2026-10-15T00:00:00Z",
    },
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
    {
      consolidation: {
        max_wallets: 4,
        ungated_max_wallets: 3,
        four_wallet_activation_at: "2026-02-30T00:00:00Z",
      },
    },
  ])
    assert.throws(() => parseConsolidationPolicy(value, "staging"));
  await assert.rejects(loadConsolidationPolicy(undefined));
});

it("loads both backend limits and includes them in the saved policy identity", () => {
  const consolidation = {
    max_wallets: 4,
    ungated_max_wallets: 3,
    four_wallet_activation_at: "2026-10-15T00:00:00Z",
  };
  const policy = parseConsolidationPolicy({ consolidation }, "staging");
  assert.equal(policy.maxWallets, 4);
  assert.equal(policy.ungatedMaxWallets, 3);
  assert.notEqual(
    policy.key,
    parseConsolidationPolicy(
      { consolidation: { ...consolidation, max_wallets: 3 } },
      "staging",
    ).key,
  );
  assert.notEqual(
    policy.key,
    parseConsolidationPolicy(
      { consolidation: { ...consolidation, ungated_max_wallets: 2 } },
      "staging",
    ).key,
  );
  for (const limits of [
    {},
    { max_wallets: 4 },
    { max_wallets: "4", ungated_max_wallets: 3 },
    { max_wallets: 4.5, ungated_max_wallets: 3 },
    { max_wallets: 2, ungated_max_wallets: 3 },
  ]) {
    assert.throws(() =>
      parseConsolidationPolicy(
        {
          consolidation: {
            four_wallet_activation_at: consolidation.four_wallet_activation_at,
            ...limits,
          },
        },
        "staging",
      ),
    );
  }
});
