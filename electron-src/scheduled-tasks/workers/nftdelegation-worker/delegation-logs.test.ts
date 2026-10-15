import assert from "node:assert/strict";
import { it } from "node:test";
import { Log } from "ethers";
import { DELEGATIONS_IFACE } from "../../../../shared/abis/delegations";
import { MEMES_CONTRACT } from "../../../../shared/abis/memes";
import { mapDelegationLogs } from "./delegation-logs";

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
const timestamp = async () => 1792022400;
const warn = () => {};

it("decodes Safe/batch scope and retains every slot without reading historical state", async () => {
  const result = await mapDelegationLogs(
    [
      log(
        "RegisterDelegationUsingSubDelegation",
        [a, b, MEMES_CONTRACT, b, 2, true, 99],
        2,
      ),
      log("RegisterDelegation", [a, MEMES_CONTRACT, b, 2, false, 0], 1),
    ],
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
      [a, undefined, false, 0],
      [a, undefined, true, 0],
    ],
  );
  assert.deepEqual(
    result.registrationLogs.map((r) => [r.logIndex, r.tokenId, r.timestamp]),
    [
      [1, BigInt(0), 1792022400],
      [2, BigInt(0), 1792022400],
    ],
  );
});

it("retains registration/revoke/re-registration order for the durable replay", async () => {
  const result = await mapDelegationLogs(
    [
      log("RegisterDelegation", [a, MEMES_CONTRACT, b, 2, false, 7], 0),
      log("RevokeDelegation", [a, MEMES_CONTRACT, b, 2], 1),
      log("RegisterDelegation", [a, MEMES_CONTRACT, b, 2, false, 8], 2),
    ],
    timestamp,
    warn,
  );
  assert.deepEqual(
    result.registrationLogs.map((r) => [r.logIndex, r.tokenId]),
    [
      [0, BigInt(7)],
      [2, BigInt(8)],
    ],
  );
  assert.equal(result.revocations[0].log_index, 1);
});

it("keeps consolidation logs ordered and stamps actual block seconds, failing closed", async () => {
  const logs = [
    log("RegisterDelegation", [a, MEMES_CONTRACT, b, 999, true, 0], 0),
    log("RevokeDelegation", [a, MEMES_CONTRACT, b, 999], 1),
  ];
  const result = await mapDelegationLogs(logs.reverse(), timestamp, warn);
  assert.deepEqual(
    result.consolidations.map((e) => [e.type, e.timestamp]),
    [
      [0, 1792022400],
      [1, 1792022400],
    ],
  );
  await assert.rejects(
    mapDelegationLogs(logs, async () => NaN, warn),
    /Missing timestamp/,
  );
});

it("retains oversized token entries for later live-state matching without emitting them", async () => {
  const oversized = 2_147_483_648;
  for (const tokens of [
    [oversized, 7],
    [7, oversized],
  ]) {
    const warnings: string[] = [];
    const result = await mapDelegationLogs(
      tokens.map((token, index) =>
        log(
          "RegisterDelegation",
          [a, MEMES_CONTRACT, b, 2, false, token],
          index,
        ),
      ),
      timestamp,
      (m) => warnings.push(m),
    );
    assert.deepEqual(
      result.registrationLogs.map((r) => r.tokenId),
      tokens.map(BigInt),
    );
    assert.equal(result.registrations.length, 1);
    assert.equal(result.registrations[0].token_id, 7);
    assert.equal(warnings.length, 1);
  }
});

it("preserves manager delegator identity and scope for use case 998", async () => {
  const result = await mapDelegationLogs(
    [
      log("RegisterDelegation", [a, MEMES_CONTRACT, b, 998, false, 7], 0),
      log(
        "RevokeDelegationUsingSubDelegation",
        [a, b, MEMES_CONTRACT, b, 998],
        1,
      ),
      log("RegisterDelegation", [a, MEMES_CONTRACT, b, 998, true, 0], 2),
    ],
    timestamp,
    warn,
  );
  assert.equal(result.revocations[0].wallet1, a);
  assert.deepEqual(
    result.registrationLogs.map((r) => [r.delegator, r.logIndex, r.allTokens]),
    [
      [a, 0, false],
      [a, 2, true],
    ],
  );
});
