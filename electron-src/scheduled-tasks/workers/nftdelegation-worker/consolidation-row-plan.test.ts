import assert from "node:assert/strict";
import { it } from "node:test";
import { Consolidation, EventType } from "../../../db/entities/IDelegation";
import { planConsolidationEvent } from "./consolidation-row-plan";

it("preserves each direction's block time through renewal, revoke and re-registration", () => {
  const event = (
    wallet1: string,
    timestamp: number,
    type = EventType.REGISTER,
  ) => ({
    wallet1,
    wallet2: wallet1 === "a" ? "b" : "a",
    block: timestamp,
    timestamp,
    type,
  });
  let row = planConsolidationEvent(event("a", 100), null, null).save[0];
  row = planConsolidationEvent(event("b", 200), null, row).save[0];
  assert.equal(row.confirmed, true);
  assert.equal(row.wallet1_registered_at, 100);
  assert.equal(row.wallet2_registered_at, 200);
  row = planConsolidationEvent(event("a", 300), row, null).save[0];
  assert.equal(row.block, 200); // Backend keeps ordering block for first-direction renewal.
  assert.equal(row.wallet1_registered_at, 300);
  row = planConsolidationEvent(event("a", 400, EventType.REVOKE), row, null)
    .save[0];
  assert.equal(row.wallet1, "b");
  assert.equal(row.confirmed, false);
  assert.equal(row.wallet1_registered_at, 200);
  assert.equal(row.wallet2_registered_at, null);
  row = planConsolidationEvent(event("a", 500), null, row).save[0];
  assert.equal(row.confirmed, true);
  assert.equal(row.wallet1_registered_at, 200);
  assert.equal(row.wallet2_registered_at, 500);
});

it("never invents a timestamp for an unknown legacy opposite direction", () => {
  const legacy = Object.assign(new Consolidation(), {
    wallet1: "a",
    wallet2: "b",
    block: 10,
    confirmed: true,
    wallet1_registered_at: null,
    wallet2_registered_at: null,
  });
  const updated = planConsolidationEvent(
    {
      wallet1: "a",
      wallet2: "b",
      block: 20,
      timestamp: 200,
      type: EventType.REGISTER,
    },
    legacy,
    null,
  ).save[0];
  assert.equal(updated.wallet1_registered_at, 200);
  assert.equal(updated.wallet2_registered_at, null);
});
