import { DELEGATIONS_IFACE } from "../../../../shared/abis/delegations";
import { NEVER_DATE } from "../../../../electron-constants";
import { mapInChunks } from "./map-in-chunks";
import { solidityPackedKeccak256 } from "ethers";
import type { NativeDelegationRegistration } from "../../../db/entities/IDelegation";

export interface RegistrationLogRef {
  block: number;
  logIndex: number;
  delegator: string;
  collection: string;
  delegate: string;
  useCase: number;
  allTokens: boolean;
  tokenId: bigint;
  timestamp: number;
}

export interface DelegationStateQuery {
  block: number;
  delegator: string;
  collection: string;
  useCase: number;
}

export interface DelegationStateEntry {
  delegator: string;
  delegate: string;
  registeredAt: bigint;
  expiry: bigint;
  allTokens: boolean;
  tokenId: bigint;
}

export interface DelegationStateReader {
  readDelegates(query: DelegationStateQuery): Promise<string[]>;
  readEntry(
    query: DelegationStateQuery,
    delegate: string,
    index: number,
  ): Promise<DelegationStateEntry>;
}

export type ContractCall = (
  to: string,
  data: string,
  blockTag: number,
) => Promise<string>;

export function delegationGlobalHash(
  delegator: string,
  collection: string,
  delegate: string,
  useCase: number,
): string {
  return solidityPackedKeccak256(
    ["address", "address", "address", "uint256"],
    [delegator, collection, delegate, useCase],
  );
}

/** Read a recent state snapshot; no registration-block eth_call is needed. */
export function createDelegationStateReader(
  call: ContractCall,
  contractAddress: string,
): DelegationStateReader {
  return {
    async readDelegates(query) {
      const raw = await call(
        contractAddress,
        DELEGATIONS_IFACE.encodeFunctionData("retrieveDelegationAddresses", [
          query.delegator,
          query.collection,
          query.useCase,
        ]),
        query.block,
      );
      const [delegates] = DELEGATIONS_IFACE.decodeFunctionResult(
        "retrieveDelegationAddresses",
        raw,
      );
      return Array.from(delegates as string[]);
    },
    async readEntry(query, delegate, index) {
      const raw = await call(
        contractAddress,
        DELEGATIONS_IFACE.encodeFunctionData("globalDelegationHashes", [
          delegationGlobalHash(
            query.delegator,
            query.collection,
            delegate,
            query.useCase,
          ),
          BigInt(index),
        ]),
        query.block,
      );
      const result = DELEGATIONS_IFACE.decodeFunctionResult(
        "globalDelegationHashes",
        raw,
      );
      return {
        delegator: result.delegatorAddress,
        delegate: result.delegationAddress,
        registeredAt: BigInt(result.registeredDate),
        expiry: BigInt(result.expiryDate),
        allTokens: Boolean(result.allTokens),
        tokenId: BigInt(result.tokens),
      };
    },
  };
}

/**
 * Logs retain every registration since the last revocation, in chain order.
 * The contract appends the same slots and deletes all of them on revocation.
 * Match the whole surviving list, including expired and oversized-token slots,
 * before accepting expiry. Safe, manager and batch calls use the same storage.
 * Expiry is immutable for a surviving slot, so verified groups can be saved
 * between batches while the event scan catches up to another recent snapshot.
 */
export async function reconcileRegistrationExpiries(
  registrations: NativeDelegationRegistration[],
  snapshotBlock: number,
  reader: DelegationStateReader,
): Promise<NativeDelegationRegistration[]> {
  if (!registrations.length) return [];
  const first = registrations[0];
  const query: DelegationStateQuery = {
    block: snapshotBlock,
    delegator: first.from_address,
    collection: first.collection,
    useCase: first.use_case,
  };
  const byDelegate = new Map<string, NativeDelegationRegistration[]>();
  for (const registration of registrations) {
    if (
      registration.from_address !== query.delegator ||
      registration.collection !== query.collection ||
      registration.use_case !== query.useCase ||
      registration.block > snapshotBlock
    )
      throw new Error("Registration group does not match the state snapshot");
    const key = registration.to_address.toLowerCase();
    const entries = byDelegate.get(key) ?? [];
    entries.push(registration);
    byDelegate.set(key, entries);
  }
  const delegates = await reader.readDelegates(query);
  const reads: { registration: NativeDelegationRegistration; index: number }[] =
    [];
  for (const [delegate, entries] of byDelegate) {
    entries.sort((a, b) => a.block - b.block || a.log_index - b.log_index);
    const stored = delegates.filter(
      (address) => address.toLowerCase() === delegate,
    ).length;
    if (stored !== entries.length) {
      throw new Error(
        `Delegation state/log count mismatch at snapshot ${snapshotBlock}: expected ${entries.length}, found ${stored}`,
      );
    }
    entries.forEach((registration, index) =>
      reads.push({ registration, index }),
    );
  }
  return mapInChunks(reads, 5, async ({ registration, index }) => {
    const entry = await reader.readEntry(query, registration.to_address, index);
    if (
      entry.delegator.toLowerCase() !== registration.from_address ||
      entry.delegate.toLowerCase() !== registration.to_address ||
      entry.registeredAt !== BigInt(registration.registered_at) ||
      entry.allTokens !== registration.all_tokens ||
      entry.tokenId !== BigInt(registration.token_id)
    ) {
      throw new Error(
        `Delegation state/log entry mismatch at ${registration.block}:${registration.log_index} (snapshot ${snapshotBlock})`,
      );
    }
    return { ...registration, expiry: toExpirySeconds(entry.expiry) };
  });
}

// Deliberately cap age at 64 blocks, leaving margin inside AWS's 128-block
// state window. The next worker attempt catches up durable logs and uses a
// fresh snapshot after an aged batch fails, without publishing guesses.
export function assertRecentDelegationSnapshot(
  snapshotBlock: number,
  latestBlock: number,
) {
  if (latestBlock < snapshotBlock || latestBlock - snapshotBlock > 64) {
    throw new Error(
      "Delegation state snapshot is no longer recent; retry to resume with a fresh snapshot",
    );
  }
}

/** Check at dispatch and completion, including pruning errors during a slow call. */
export async function readRecentDelegationState<T>(
  snapshotBlock: number,
  latestBlock: () => Promise<number>,
  read: () => Promise<T>,
): Promise<T> {
  assertRecentDelegationSnapshot(snapshotBlock, await latestBlock());
  let result: T;
  try {
    result = await read();
  } catch (error) {
    // Prefer the retriable age error over a pruning/decode/count error if the
    // state window expired while a queued or in-flight request was running.
    assertRecentDelegationSnapshot(snapshotBlock, await latestBlock());
    throw error;
  }
  assertRecentDelegationSnapshot(snapshotBlock, await latestBlock());
  return result;
}

/** Guard injected readers as well as the production RPC dispatch boundary. */
export function guardRecentDelegationReader(
  reader: DelegationStateReader,
  latestBlock: () => Promise<number>,
): DelegationStateReader {
  return {
    readDelegates: (query) =>
      readRecentDelegationState(query.block, latestBlock, () =>
        reader.readDelegates(query),
      ),
    readEntry: (query, delegate, index) =>
      readRecentDelegationState(query.block, latestBlock, () =>
        reader.readEntry(query, delegate, index),
      ),
  };
}

export function toExpirySeconds(expiry: bigint): number {
  if (expiry === BigInt(0) || expiry > BigInt(Number.MAX_SAFE_INTEGER)) {
    return NEVER_DATE;
  }
  return Number(expiry);
}
