import assert from "node:assert/strict";
import { it } from "node:test";
import { TDH, ConsolidatedTDH } from "../../../db/entities/ITDH";
import { MEMES_CONTRACT } from "../../../../shared/abis/memes";
import { calculateRanks } from "./tdh";
import {
  canonicalTdhIdentity,
  compareCollectionTdh,
  compareMemeOwnerTdh,
  compareOverallTdh,
  compareTokenTdh,
  shouldIncludeWalletTdh,
} from "./tdh-ranking";

function row(identity: string, consolidated = false) {
  return Object.assign(consolidated ? new ConsolidatedTDH() : new TDH(), {
    ...(consolidated
      ? { consolidation_key: identity, wallets: identity.split("-") }
      : { wallet: identity }),
    tdh: 30,
    boosted_tdh: 30,
    balance: 3,
    memes_tdh: 10,
    boosted_memes_tdh: 10,
    memes_balance: 1,
    gradients_tdh: 10,
    boosted_gradients_tdh: 10,
    gradients_balance: 1,
    nextgen_tdh: 10,
    boosted_nextgen_tdh: 10,
    nextgen_balance: 1,
    memes: [
      {
        id: 1,
        tdh: 10,
        balance: 1,
        hodl_rate: 1,
        tdh__raw: 10,
        days_held_per_edition: [10],
      },
    ],
    gradients: [],
    nextgen: [],
    memes_ranks: [],
    gradients_ranks: [],
    nextgen_ranks: [],
  });
}

it("uses lowercase lexical identities and returns zero for true equality", () => {
  assert.equal(canonicalTdhIdentity({ wallet: "0xABC" }), "0xabc");
  assert.equal(
    canonicalTdhIdentity({ wallet: "z", consolidation_key: "B-A" }),
    "b-a",
  );
  assert.equal(canonicalTdhIdentity({ wallets: ["B", "a"] }), "a-b");
  const a = row("0xA");
  const b = row("0xa");
  assert.equal(compareOverallTdh(a, b), 0);
  for (const collection of ["memes", "gradients", "nextgen"] as const)
    assert.equal(compareCollectionTdh(collection, a, b), 0);
  assert.equal(compareMemeOwnerTdh(1, a, b), 0);
  assert.equal(compareTokenTdh({ id: "10", tdh: 1 }, { id: 10, tdh: 1 }), 0);
  assert.equal(compareTokenTdh({ id: 2, tdh: 1 }, { id: 10, tdh: 1 }), -8);
});

it("honors every overall and collection descending criterion in both directions", () => {
  for (const field of [
    "boosted_tdh",
    "tdh",
    "gradients_tdh",
    "nextgen_tdh",
  ] as const) {
    const higher = row("z");
    const lower = row("a");
    higher[field]++;
    assert.ok(compareOverallTdh(higher, lower) < 0, field);
    assert.ok(compareOverallTdh(lower, higher) > 0, field);
  }
  for (const collection of ["memes", "gradients", "nextgen"] as const) {
    for (const field of [
      `boosted_${collection}_tdh`,
      `${collection}_tdh`,
      `${collection}_balance`,
      "balance",
    ] as const) {
      const higher = row("z");
      const lower = row("a");
      higher[field]++;
      assert.ok(compareCollectionTdh(collection, higher, lower) < 0, field);
      assert.ok(compareCollectionTdh(collection, lower, higher) > 0, field);
    }
  }
  const higher = row("z");
  const lower = row("a");
  higher.memes[0].tdh++;
  assert.ok(compareMemeOwnerTdh(1, higher, lower) < 0);
  assert.ok(compareMemeOwnerTdh(1, lower, higher) > 0);
  higher.memes[0].tdh--;
  higher.boosted_tdh++;
  assert.ok(compareMemeOwnerTdh(1, higher, lower) < 0);
  assert.ok(compareMemeOwnerTdh(1, lower, higher) > 0);
});

for (const consolidated of [false, true]) {
  it(`assigns ${consolidated ? "consolidated" : "raw wallet"} ranks independently of input order, including per-Meme ties`, async () => {
    const makeRows = () => {
      const a = row("A", consolidated);
      const b = row("b", consolidated);
      const funded = row("funded", consolidated);
      const member = row("member", consolidated);
      b.balance = 4;
      for (const zero of [funded, member]) {
        zero.tdh = zero.boosted_tdh = 0;
        for (const collection of ["memes", "gradients", "nextgen"] as const)
          zero[`${collection}_tdh`] = zero[`boosted_${collection}_tdh`] = 0;
        zero.memes = [];
      }
      funded.balance = 1;
      member.balance = 0;
      return [a, b, funded, member];
    };
    const summarize = (rows: ReturnType<typeof row>[]) =>
      rows
        .map((r) => ({
          id: canonicalTdhIdentity(r),
          overall: r.tdh_rank,
          memes: r.tdh_rank_memes,
          gradients: r.tdh_rank_gradients,
          nextgen: r.tdh_rank_nextgen,
          memeRanks: r.memes_ranks,
        }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const first = makeRows();
    const second = makeRows().reverse();
    const nfts = [{ id: 1, contract: MEMES_CONTRACT }];
    await calculateRanks([], [], first, nfts);
    await calculateRanks([], [], second, nfts);
    assert.deepEqual(summarize(first), summarize(second));
    const a = first.find((r) => canonicalTdhIdentity(r) === "a")!;
    const b = first.find((r) => canonicalTdhIdentity(r) === "b")!;
    assert.equal(a.tdh_rank, 1);
    assert.equal(b.tdh_rank, 2);
    for (const collection of ["memes", "gradients", "nextgen"] as const) {
      assert.equal(b[`tdh_rank_${collection}`], 1);
      assert.equal(a[`tdh_rank_${collection}`], 2);
      for (const zero of first.filter((r) => r.boosted_tdh === 0))
        assert.equal(zero[`tdh_rank_${collection}`], -1);
    }
    assert.deepEqual(a.memes_ranks, [{ id: 1, rank: 1 }]);
    assert.deepEqual(b.memes_ranks, [{ id: 1, rank: 2 }]);
    // Re-ranking persisted rows rebuilds arrays and updates unaffected ranks.
    b.boosted_tdh = 31;
    await calculateRanks([], [], first, nfts);
    assert.equal(b.tdh_rank, 1);
    assert.equal(a.tdh_rank, 2);
    assert.deepEqual(b.memes_ranks, [{ id: 1, rank: 1 }]);
    assert.deepEqual(a.memes_ranks, [{ id: 1, rank: 2 }]);
  });
}

it("excludes only empty singleton candidates while retaining scored, funded and multiwallet members", () => {
  assert.equal(shouldIncludeWalletTdh(0, 0, 1), false);
  assert.equal(shouldIncludeWalletTdh(1, 0, 1), true);
  assert.equal(shouldIncludeWalletTdh(0, 1, 1), true);
  assert.equal(shouldIncludeWalletTdh(0, 0, 2), true);
  assert.equal(shouldIncludeWalletTdh(0, 0, 4), true);
});
