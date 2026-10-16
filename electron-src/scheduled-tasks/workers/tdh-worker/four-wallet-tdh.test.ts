import assert from "node:assert/strict";
import { it } from "node:test";
import { Transaction } from "../../../db/entities/ITransaction";
import { MEMES_CONTRACT } from "../../../../shared/abis/memes";
import { consolidateTransactions, getTokenTdh } from "./tdh";
import { consolidateTDHForWallets } from "./tdh-worker.consolidation";
import { DataSource } from "typeorm";
import { TDH } from "../../../db/entities/ITDH";

const seconds = (day: number) => Date.UTC(2026, 0, day) / 1000;
const wallets = ["a", "b", "c", "d"];
const transactions = [
  ["outside", "a", 1],
  ["a", "b", 3],
  ["b", "c", 5],
  ["c", "d", 7],
].map(([from, to, day], i) =>
  Object.assign(new Transaction(), {
    from_address: from,
    to_address: to,
    transaction_date: seconds(Number(day)),
    token_count: 1,
    transaction: `tx${i}`,
    contract: MEMES_CONTRACT,
    token_id: 1,
  }),
);

it("preserves holding age through internal transfers across all four wallets without double counting", () => {
  const deduped = consolidateTransactions([
    ...transactions,
    ...transactions,
  ]) as Transaction[];
  assert.equal(deduped.length, 4);
  const tdh = wallets.map((wallet) =>
    getTokenTdh(new Date(seconds(11) * 1000), 1, 1, wallet, wallets, deduped),
  );
  assert.deepEqual(
    tdh.map((entry) => entry?.balance ?? 0),
    [0, 0, 0, 1],
  );
  assert.equal(tdh[3]?.tdh__raw, 10);
  const separate = getTokenTdh(
    new Date(seconds(11) * 1000),
    1,
    1,
    "d",
    ["d"],
    deduped.filter((t) => t.to_address === "d"),
  );
  assert.equal(separate?.tdh__raw, 4);
});

it("aggregates four native wallet TDH rows into one consolidation including shared cards", async () => {
  const links = wallets.flatMap((wallet1, i) =>
    wallets.slice(i + 1).map((wallet2) => ({
      wallet1,
      wallet2,
      block: 100,
      wallet1_registered_at: 1792022400,
      wallet2_registered_at: 1792022400,
    })),
  );
  const db = { query: async () => links } as unknown as DataSource;
  const rows = wallets.map((wallet) =>
    Object.assign(new TDH(), {
      wallet,
      block: 100,
      tdh: 10,
      tdh__raw: 10,
      balance: 1,
      memes_tdh: 10,
      memes_tdh__raw: 10,
      memes_balance: 1,
      gradients_tdh: 0,
      gradients_tdh__raw: 0,
      gradients_balance: 0,
      nextgen_tdh: 0,
      nextgen_tdh__raw: 0,
      nextgen_balance: 0,
      memes: [
        {
          id: 1,
          balance: 1,
          hodl_rate: 1,
          tdh: 10,
          tdh__raw: 10,
          days_held_per_edition: [10],
        },
      ],
      gradients: [],
      nextgen: [],
    }),
  );
  const { consolidatedTdh } = await consolidateTDHForWallets(db, rows, 1, {
    activationTimestamp: Date.parse("2026-10-15T00:00:00Z") / 1000,
    maxWallets: 4,
    ungatedMaxWallets: 3,
    key: "test",
  });
  assert.equal(consolidatedTdh.length, 1);
  const result = consolidatedTdh[0];
  assert.deepEqual(result.wallets.slice().sort(), wallets);
  assert.equal(result.tdh__raw, 40);
  assert.equal(result.memes[0].balance, 4);
  assert.equal(result.memes[0].tdh__raw, 40);
  assert.deepEqual(result.memes[0].days_held_per_edition, [10, 10, 10, 10]);
  assert.equal(result.memes_cards_sets, 4);
});
