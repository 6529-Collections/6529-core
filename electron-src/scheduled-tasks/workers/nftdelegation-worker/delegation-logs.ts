import { Log } from "ethers";
import { DELEGATIONS_IFACE } from "../../../../shared/abis/delegations";
import { MEMES_CONTRACT } from "../../../../shared/abis/memes";
import {
  DELEGATION_ALL_ADDRESS,
  USE_CASE_CONSOLIDATION,
  USE_CASE_PRIMARY_ADDRESS,
  USE_CASE_SUB_DELEGATION,
} from "../../../../electron-constants";
import {
  ConsolidationEvent,
  DelegationEvent,
  EventType,
} from "../../../db/entities/IDelegation";
import {
  DelegationStateReader,
  RegistrationLogRef,
  RevocationLogRef,
  resolveRegistrationExpiries,
} from "./delegation-registration-expiry";
import { MAX_STORABLE_DELEGATION_TOKEN_ID } from "./delegation-row";
import { mapInChunks } from "./map-in-chunks";

export interface NativeDelegationScan {
  consolidations: ConsolidationEvent[];
  registrations: DelegationEvent[];
  revocations: DelegationEvent[];
}

/** Decode logs in chain order, independently of transaction sender/calldata. */
export async function mapDelegationLogs(
  logs: Log[],
  reader: DelegationStateReader,
  blockTimestamp: (block: number) => Promise<number>,
  warn: (message: string) => void,
): Promise<NativeDelegationScan> {
  const scan: NativeDelegationScan = {
    consolidations: [],
    registrations: [],
    revocations: [],
  };
  // Keep every on-chain entry in the read plan, even if its token ID cannot
  // be emitted into the native table, so same-block storage positions align.
  const pending: { event: DelegationEvent | null; ref: RegistrationLogRef }[] =
    [];
  const revocations: RevocationLogRef[] = [];
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
    const ref: RevocationLogRef = {
      block: log.blockNumber,
      logIndex: log.index,
      delegator: from,
      collection,
      delegate: to,
      useCase,
    };
    if (revoke) {
      scan.revocations.push(delegation);
      revocations.push(ref);
      continue;
    }
    if (useCase === USE_CASE_SUB_DELEGATION) {
      scan.registrations.push(delegation);
      continue;
    }
    const allTokens = Boolean(parsed.args.allTokens);
    const tokenId = allTokens ? BigInt(0) : BigInt(parsed.args._tokenId);
    if (tokenId > MAX_STORABLE_DELEGATION_TOKEN_ID) {
      warn(
        `Skipping token ID ${tokenId} outside native/backend token_id range at ${log.blockNumber}:${log.index}`,
      );
      pending.push({ event: null, ref: { ...ref, allTokens, tokenId } });
      continue;
    }
    delegation.all_tokens = allTokens;
    delegation.token_id = Number(tokenId);
    scan.registrations.push(delegation);
    pending.push({ event: delegation, ref: { ...ref, allTokens, tokenId } });
  }
  const expiries = await resolveRegistrationExpiries(
    pending.map((p) => p.ref),
    revocations,
    reader,
  );
  const revoked = new Set<DelegationEvent>();
  pending.forEach(({ event }, i) => {
    if (!event) return;
    if (expiries[i] === null) revoked.add(event);
    else event.expiry = expiries[i]!;
  });
  scan.registrations = scan.registrations.filter(
    (event) =>
      !revoked.has(event) &&
      !(
        event.use_case === USE_CASE_SUB_DELEGATION &&
        revocations.some(
          (revocation) =>
            revocation.block === event.block &&
            revocation.delegator === event.wallet1 &&
            revocation.delegate === event.wallet2 &&
            revocation.collection === event.collection &&
            revocation.useCase === event.use_case &&
            revocation.logIndex > event.log_index!,
        )
      ),
  );

  const blocks = Array.from(
    new Set(scan.consolidations.map((event) => event.block)),
  );
  const times = await mapInChunks(blocks, 5, async (block) => {
    const timestamp = await blockTimestamp(block);
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0)
      throw new Error(`Missing timestamp for block ${block}`);
    return timestamp;
  });
  const timestamps = new Map(blocks.map((block, i) => [block, times[i]]));
  scan.consolidations.forEach((event) => {
    event.timestamp = timestamps.get(event.block)!;
  });
  return scan;
}
