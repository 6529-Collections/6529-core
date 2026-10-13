import { Log } from "ethers";
import { DELEGATIONS_IFACE } from "../../../../shared/abis/delegations";
import { MEMES_CONTRACT } from "../../../../shared/abis/memes";
import {
  DELEGATION_ALL_ADDRESS,
  USE_CASE_CONSOLIDATION,
  USE_CASE_PRIMARY_ADDRESS,
} from "../../../../electron-constants";
import {
  ConsolidationEvent,
  DelegationEvent,
  EventType,
} from "../../../db/entities/IDelegation";
import type { RegistrationLogRef } from "./delegation-registration-expiry";
import { MAX_STORABLE_DELEGATION_TOKEN_ID } from "./delegation-row";
import { mapInChunks } from "./map-in-chunks";

export interface NativeDelegationScan {
  consolidations: ConsolidationEvent[];
  registrations: DelegationEvent[];
  revocations: DelegationEvent[];
  registrationLogs: RegistrationLogRef[];
}

/** Decode history using only logs and block timestamps, never old state. */
export async function mapDelegationLogs(
  logs: Log[],
  blockTimestamp: (block: number) => Promise<number>,
  warn: (message: string) => void,
): Promise<NativeDelegationScan> {
  const scan: NativeDelegationScan = {
    consolidations: [],
    registrations: [],
    revocations: [],
    registrationLogs: [],
  };
  const ordered = logs
    .slice()
    .sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
  for (const log of ordered) {
    const parsed = DELEGATIONS_IFACE.parseLog(log);
    if (!parsed) continue;
    const register = [
      "RegisterDelegation",
      "RegisterDelegationUsingSubDelegation",
    ].includes(parsed.name);
    const revoke = [
      "RevokeDelegation",
      "RevokeDelegationUsingSubDelegation",
    ].includes(parsed.name);
    if (!register && !revoke) continue;
    const from = String(
      parsed.args.delegator ?? parsed.args.from,
    ).toLowerCase();
    const to = String(parsed.args.delegationAddress).toLowerCase();
    const collection = String(parsed.args.collectionAddress).toLowerCase();
    const useCase = Number(parsed.args.useCase);
    if (from === to && useCase !== USE_CASE_PRIMARY_ADDRESS) continue;
    const event: ConsolidationEvent = {
      block: log.blockNumber,
      log_index: log.index,
      type: register ? EventType.REGISTER : EventType.REVOKE,
      wallet1: from,
      wallet2: to,
    };
    if (useCase === USE_CASE_CONSOLIDATION) {
      if ([MEMES_CONTRACT, DELEGATION_ALL_ADDRESS].includes(collection))
        scan.consolidations.push(event);
      continue;
    }
    const delegation: DelegationEvent = {
      ...event,
      use_case: useCase,
      collection,
    };
    if (revoke) {
      scan.revocations.push(delegation);
      continue;
    }
    const allTokens = Boolean(parsed.args.allTokens);
    const tokenId = allTokens ? BigInt(0) : BigInt(parsed.args._tokenId);
    scan.registrationLogs.push({
      block: log.blockNumber,
      logIndex: log.index,
      delegator: from,
      collection,
      delegate: to,
      useCase,
      allTokens,
      tokenId,
      timestamp: 0,
    });
    if (tokenId > MAX_STORABLE_DELEGATION_TOKEN_ID) {
      warn(
        `Skipping token ID ${tokenId} outside native/backend token_id range at ${log.blockNumber}:${log.index}`,
      );
      continue;
    }
    delegation.all_tokens = allTokens;
    delegation.token_id = Number(tokenId);
    scan.registrations.push(delegation);
  }
  const blocks = [
    ...new Set([
      ...scan.consolidations.map((event) => event.block),
      ...scan.registrationLogs.map((event) => event.block),
    ]),
  ];
  const timestamps = new Map(
    await mapInChunks(blocks, 5, async (block) => {
      const timestamp = await blockTimestamp(block);
      if (!Number.isSafeInteger(timestamp) || timestamp <= 0)
        throw new Error(`Missing timestamp for block ${block}`);
      return [block, timestamp] as const;
    }),
  );
  scan.consolidations.forEach((event) => {
    event.timestamp = timestamps.get(event.block)!;
  });
  scan.registrationLogs.forEach((event) => {
    event.timestamp = timestamps.get(event.block)!;
  });
  return scan;
}
