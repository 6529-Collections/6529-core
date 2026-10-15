import assert from "node:assert/strict";
import { it } from "node:test";
import { NativeDelegationRegistration } from "../../../db/entities/IDelegation";
import {
  assertRecentDelegationSnapshot,
  createDelegationStateReader,
  DelegationStateEntry,
  DelegationStateReader,
  reconcileRegistrationExpiries,
  toExpirySeconds,
  guardRecentDelegationReader,
  readRecentDelegationState,
} from "./delegation-registration-expiry";
import { DELEGATIONS_IFACE } from "../../../../shared/abis/delegations";
import { NEVER_DATE } from "../../../../electron-constants";

const a = "0x1000000000000000000000000000000000000001",
  b = "0x2000000000000000000000000000000000000002";
const registration = (
  block: number,
  logIndex: number,
  token = "0",
  allTokens = false,
): NativeDelegationRegistration => ({
  block,
  log_index: logIndex,
  from_address: a,
  to_address: b,
  collection: a,
  use_case: 2,
  registered_at: 1000 + block,
  token_id: token,
  all_tokens: allTokens,
  expiry: null,
});
const entry = (
  r: NativeDelegationRegistration,
  expiry: bigint,
): DelegationStateEntry => ({
  delegator: r.from_address,
  delegate: r.to_address,
  registeredAt: BigInt(r.registered_at),
  tokenId: BigInt(r.token_id),
  allTokens: r.all_tokens,
  expiry,
});
const reader = (entries: DelegationStateEntry[]): DelegationStateReader => ({
  readDelegates: async (query) => {
    assert.equal(query.block, 10000);
    return entries.map((e) => e.delegate);
  },
  readEntry: async (query, _delegate, index) => {
    assert.equal(query.block, 10000);
    return entries[index];
  },
});

it("matches old, same-block, expired and oversized slots at one recent block", async () => {
  const registrations = [
    registration(1, 1),
    registration(2, 0, "2147483648"),
    registration(2, 1, "7"),
    registration(3, 1, "0", true),
  ];
  const result = await reconcileRegistrationExpiries(
    registrations.slice().reverse(),
    10000,
    reader(registrations.map((r, i) => entry(r, BigInt(i + 1)))),
  );
  assert.deepEqual(
    result.map((r) => r.expiry),
    [1, 2, 3, 4],
  );
});

it("rejects stale slot counts, timestamps, token scope and failed calls without guessed expiry", async () => {
  const r = registration(1, 0, "7");
  await assert.rejects(
    reconcileRegistrationExpiries([r], 10000, reader([])),
    /count mismatch/,
  );
  for (const change of [
    { registeredAt: BigInt(99) },
    { allTokens: true },
    { tokenId: BigInt(8) },
    { delegate: a },
  ]) {
    await assert.rejects(
      reconcileRegistrationExpiries(
        [r],
        10000,
        reader([{ ...entry(r, BigInt(10)), ...change }]),
      ),
      /mismatch/,
    );
  }
  await assert.rejects(
    reconcileRegistrationExpiries([r], 10000, {
      readDelegates: async () => {
        throw new Error("RPC unavailable");
      },
      readEntry: async () => entry(r, BigInt(10)),
    }),
    /RPC unavailable/,
  );
  assert.equal(r.expiry, null);
});

it("decodes live contract registration time, scope and expiry using the recent block tag", async () => {
  const reader = createDelegationStateReader(async (_to, data, block) => {
    assert.equal(block, 10000);
    const call = DELEGATIONS_IFACE.parseTransaction({ data })!;
    if (call.name === "retrieveDelegationAddresses")
      return DELEGATIONS_IFACE.encodeFunctionResult(call.name, [[b]]);
    assert.equal(call.name, "globalDelegationHashes");
    return DELEGATIONS_IFACE.encodeFunctionResult(call.name, [
      a,
      b,
      1001,
      3000,
      false,
      7,
    ]);
  }, a);
  assert.equal(
    (
      await reconcileRegistrationExpiries(
        [registration(1, 0, "7")],
        10000,
        reader,
      )
    )[0].expiry,
    3000,
  );
});

it("bounds state reads inside the full-node window and retains never-expiry normalization", () => {
  assertRecentDelegationSnapshot(100, 164);
  assert.throws(
    () => assertRecentDelegationSnapshot(100, 165),
    /no longer recent/,
  );
  assert.throws(
    () => assertRecentDelegationSnapshot(100, 99),
    /no longer recent/,
  );
  assert.equal(toExpirySeconds(BigInt(0)), NEVER_DATE);
  assert.equal(
    toExpirySeconds(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1)),
    NEVER_DATE,
  );
  assert.equal(toExpirySeconds(BigInt(1234)), 1234);
});

it("rejects mixed delegators, collections, use cases and future logs before any state lookup", async () => {
  const first = registration(1, 0);
  for (const change of [
    { from_address: b },
    { collection: b },
    { use_case: 3 },
    { block: 10001 },
  ]) {
    await assert.rejects(
      reconcileRegistrationExpiries(
        [first, { ...registration(2, 1), ...change }],
        10000,
        {
          readDelegates: async () => {
            throw new Error("unexpected state lookup");
          },
          readEntry: async () => {
            throw new Error("unexpected entry lookup");
          },
        },
      ),
      /group does not match/,
    );
  }
});

it("returns the retriable age error when a slow state call returns empty data or fails after pruning", async () => {
  for (const fails of [false, true]) {
    let head = 164;
    const guarded = guardRecentDelegationReader(
      {
        readDelegates: async () => {
          head = 229;
          if (fails) throw new Error("historical state unavailable");
          return [];
        },
        readEntry: async () => {
          throw new Error("unexpected entry call");
        },
      },
      async () => head,
    );
    await assert.rejects(
      reconcileRegistrationExpiries([registration(1, 0)], 100, guarded),
      /no longer recent/,
    );
  }
  let dispatched = false;
  await assert.rejects(
    readRecentDelegationState(
      100,
      async () => 165,
      async () => {
        dispatched = true;
        return "0x";
      },
    ),
    /no longer recent/,
  );
  assert.equal(dispatched, false);
  const rpcError = new Error("RPC temporarily unavailable");
  await assert.rejects(
    readRecentDelegationState(
      100,
      async () => 100,
      async () => {
        throw rpcError;
      },
    ),
    (error) => error === rpcError,
  );
});
