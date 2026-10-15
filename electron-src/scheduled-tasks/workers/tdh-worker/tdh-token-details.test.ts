import assert from "node:assert/strict";
import { it } from "node:test";
import { ConsolidatedTDH, TDH, type TokenTDH } from "../../../db/entities/ITDH";
import { MEMES_CONTRACT } from "../../../../shared/abis/memes";
import { NEXTGEN_CONTRACT } from "../../../../shared/abis/nextgen";
import { calculateRanks } from "./tdh";
import { consolidateCards } from "./tdh-worker.consolidation";

const token = (id: number, days: number[]): TokenTDH => ({
  id,
  balance: days.length,
  hodl_rate: 1,
  tdh: days.reduce((sum, day) => sum + day, 0),
  tdh__raw: days.reduce((sum, day) => sum + day, 0),
  days_held_per_edition: days,
});

it("merges every edition day across wallets and sorts numerically without changing token totals", () => {
  const shared = consolidateCards([token(167, [45])], [token(167, [15])]);
  assert.deepEqual(shared[0].days_held_per_edition, [15, 45]);
  assert.equal(shared[0].balance, 2);
  assert.equal(shared[0].tdh, 60);
  assert.equal(shared[0].tdh__raw, 60);
  const merged = consolidateCards(shared, [
    token(167, [100, 2]),
    token(99, [10]),
  ]);
  assert.deepEqual(
    merged.find((t) => t.id === 167)?.days_held_per_edition,
    [2, 15, 45, 100],
  );
  assert.equal(merged.find((t) => t.id === 167)?.balance, 4);
  assert.equal(merged.find((t) => t.id === 167)?.tdh, 162);
  assert.equal(merged.find((t) => t.id === 167)?.tdh__raw, 162);
  assert.deepEqual(
    merged.find((t) => t.id === 99),
    token(99, [10]),
  );
});

for (const kind of ["wallet", "consolidated"] as const) {
  it(`populates ${kind} NextGen ranks from a separate catalog with numeric token-ID matching`, async () => {
    const firstId = 10000000001;
    const secondId = 10000000002;
    const makeRow = (name: string, nextgen: any[], score: number) =>
      Object.assign(kind === "wallet" ? new TDH() : new ConsolidatedTDH(), {
        name,
        wallet: name,
        wallets: [name],
        balance: nextgen.length,
        tdh: score,
        tdh__raw: score,
        boosted_tdh: score,
        memes: [],
        memes_ranks: [],
        memes_tdh: 0,
        memes_balance: 0,
        boosted_memes_tdh: 0,
        gradients: [],
        gradients_ranks: [],
        gradients_tdh: 0,
        gradients_balance: 0,
        boosted_gradients_tdh: 0,
        nextgen,
        nextgen_ranks: [],
        nextgen_tdh: score,
        nextgen_tdh__raw: score,
        boosted_nextgen_tdh: score,
        nextgen_balance: nextgen.length,
      });
    const first = makeRow("first", [token(firstId, [45])], 45);
    const second = makeRow(
      "second",
      [{ ...token(secondId, [15]), id: String(secondId) }],
      15,
    );
    const zero = makeRow("zero", [token(firstId, [0])], 0);
    const absent = makeRow("absent", [], 0);
    const rows = [first, second, zero, absent];
    const scoresBefore = rows.map((r) => [
      r.tdh,
      r.tdh__raw,
      r.nextgen_tdh,
      r.nextgen_tdh__raw,
    ]);
    await calculateRanks(
      [],
      [{ ...token(firstId, [45]), id: String(firstId) }, token(secondId, [15])],
      rows,
      [{ contract: MEMES_CONTRACT, id: 167 }],
      [
        { id: firstId, contract: NEXTGEN_CONTRACT },
        { id: secondId, contract: NEXTGEN_CONTRACT },
      ],
    );
    assert.deepEqual(first.nextgen_ranks, [{ id: firstId, rank: 1 }]);
    assert.deepEqual(second.nextgen_ranks, [{ id: secondId, rank: 2 }]);
    assert.deepEqual(zero.nextgen_ranks, []);
    assert.deepEqual(absent.nextgen_ranks, []);
    assert.deepEqual(
      [first, second, zero, absent].map((r) => [
        r.tdh,
        r.tdh__raw,
        r.nextgen_tdh,
        r.nextgen_tdh__raw,
      ]),
      scoresBefore,
    );
    assert.equal(first.nextgen[0].balance, 1);
    assert.equal(first.nextgen[0].days_held_per_edition[0], 45);
  });
}
