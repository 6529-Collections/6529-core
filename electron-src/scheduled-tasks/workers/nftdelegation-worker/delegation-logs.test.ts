import assert from "node:assert/strict";
import { it } from "node:test";
import { Log } from "ethers";
import { DELEGATIONS_IFACE } from "../../../../shared/abis/delegations";
import { MEMES_CONTRACT } from "../../../../shared/abis/memes";
import { NEVER_DATE } from "../../../../electron-constants";
import { mapDelegationLogs } from "./delegation-logs";
import {
  DelegationStateEntry,
  DelegationStateReader,
  toExpirySeconds,
} from "./delegation-registration-expiry";

const a = "0x1000000000000000000000000000000000000001";
const b = "0x2000000000000000000000000000000000000002";
function log(name: string, values: unknown[], index: number): Log {
  const encoded = DELEGATIONS_IFACE.encodeEventLog(
    DELEGATIONS_IFACE.getEvent(name)!,
    values,
  );
  return {
    ...encoded,
    blockNumber: 100,
    index,
    transactionHash: "Safe-or-batch",
    address: "unused",
  } as unknown as Log;
}
const entry = (
  expiry: number,
  allTokens: boolean,
  tokenId: number,
): DelegationStateEntry => ({
  delegator: a,
  delegate: b,
  expiry: BigInt(expiry),
  allTokens,
  tokenId: BigInt(tokenId),
});
const reader = (entries: DelegationStateEntry[]): DelegationStateReader => ({
  readDelegates: async () => entries.map((e) => e.delegate),
  readEntry: async (_query, _delegate, index) => entries[index],
});
const timestamp = async () => 1792022400;
const warn = () => {};

it("reads Safe/batch scope from each log and expiry from its own historical entry", async () => {
  const logs = [
    log("RegisterDelegation", [a, MEMES_CONTRACT, b, 2, false, 0], 1),
    log(
      "RegisterDelegationUsingSubDelegation",
      [a, b, MEMES_CONTRACT, b, 2, true, 99],
      2,
    ),
  ];
  const result = await mapDelegationLogs(
    logs.reverse(),
    reader([entry(1000, false, 0), entry(2000, true, 0)]),
    timestamp,
    warn,
  );
  assert.deepEqual(
    result.registrations.map((e) => [
      e.wallet1,
      e.expiry,
      e.all_tokens,
      e.token_id,
    ]),
    [
      [a, 1000, false, 0],
      [a, 2000, true, 0],
    ],
  );
});

it("drops same-block revoked registrations and matches later re-registration", async () => {
  const result = await mapDelegationLogs(
    [
      log("RegisterDelegation", [a, MEMES_CONTRACT, b, 2, false, 7], 0),
      log("RevokeDelegation", [a, MEMES_CONTRACT, b, 2], 1),
      log("RegisterDelegation", [a, MEMES_CONTRACT, b, 2, false, 8], 2),
    ],
    reader([entry(3000, false, 8)]),
    timestamp,
    warn,
  );
  assert.equal(result.registrations.length, 1);
  assert.equal(result.registrations[0].token_id, 8);
  assert.equal(result.registrations[0].expiry, 3000);
  assert.equal(result.revocations.length, 1);
});

it("keeps consolidation logs ordered and stamps actual block seconds, failing closed", async () => {
  const logs = [
    log("RegisterDelegation", [a, MEMES_CONTRACT, b, 999, true, 0], 0),
    log("RevokeDelegation", [a, MEMES_CONTRACT, b, 999], 1),
  ];
  const result = await mapDelegationLogs(
    logs.reverse(),
    reader([]),
    timestamp,
    warn,
  );
  assert.deepEqual(
    result.consolidations.map((e) => [e.type, e.timestamp]),
    [
      [0, 1792022400],
      [1, 1792022400],
    ],
  );
  await assert.rejects(
    mapDelegationLogs(logs, reader([]), async () => NaN, warn),
    /Missing timestamp/,
  );
});

it("fails on missing historical state, never silently widening a delegation", async () => {
  const logs = [
    log("RegisterDelegation", [a, MEMES_CONTRACT, b, 2, false, 42], 0),
  ];
  await assert.rejects(
    mapDelegationLogs(logs, reader([]), timestamp, warn),
    /Expected 1 stored/,
  );
  await assert.rejects(
    mapDelegationLogs(
      logs,
      {
        readDelegates: async () => {
          throw new Error("archive unavailable");
        },
        readEntry: async () => entry(1, false, 42),
      },
      timestamp,
      warn,
    ),
    /archive unavailable/,
  );
  assert.equal(toExpirySeconds(BigInt(0)), NEVER_DATE);
  assert.equal(
    toExpirySeconds(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1)),
    NEVER_DATE,
  );
});
