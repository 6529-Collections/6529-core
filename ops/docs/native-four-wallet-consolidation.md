# Native four-wallet consolidation index

Core's native SQLite delegation index and TDH worker follow backend
[#2148](https://github.com/6529-Collections/6529seize-backend/pull/2148)
(head `c041a853d0bc1ebbd0c181492a8f6d2592c05dd2`) for grouping and directional
registration times. Safe/batch token scope and historical expiry reads follow
[#2151](https://github.com/6529-Collections/6529seize-backend/pull/2151)
(head `b4b7c80b5128c2e8010abec6d340e54aba137f5c`). These backend changes are
independent rollout dependencies; native parity does not replace their deployment
or the frontend rollout. The referenced #2151 head still needs the corresponding
same-block sub-delegation revocation filter and oversized-token state-read
placeholder fixes, which Core includes to avoid stale manager rows and stalled
indexing. This change requires no renderer subtree sync or desktop
version change.

## Grouping contract

Confirmed reciprocal pairs form a full mesh, with at most four wallets per group.
Pairs are processed newest block first, with lexicographic pair-key ties. A wallet
can belong to only one group. Two/three-wallet groups retain existing eligibility.

Growth beyond three requires a member connected to every other member by pairs
whose *both* directional registration timestamps are at or after
2026-10-15 00:00:00 UTC (`1792022400` Unix seconds), inclusive. All six directions
incident to that member must qualify; old links among the other three can remain.
There is no permanently designated fourth wallet. Passing the date alone does not
activate an old four-wallet mesh. NULL legacy times never qualify, and indexing
wall-clock time is never used as registration time.

Renewals refresh the corresponding directional time. Pair ordering blocks and
revocation transitions match #2148, including its asymmetric renewal ordering:
renewing the first stored direction keeps the pair's block, while registering the
reverse direction stamps it with that event's block. A revocation retains only
the surviving direction's original registration time. Events are applied in block
and log order, including manager and batch calls.

Newer AD and BD with missing CD can produce ABD + C from an old ABC group.
Intermediate return links and manager transactions can change grouping before a
four-wallet mesh is complete. TDH partial recalculation includes the entire
confirmed connected component and former TDH groups, so splits/reshuffles remove
stale groups. Internal transfers between all four members retain acquisition
age; card balances, sets, boosts, ranks and Merkle keys use the resulting group.

## Existing database upgrade

The first NFTDelegation worker run with `index_version != 1` automatically replays
logs from the contract deployment block (17114433) into `consolidations_replay`
and `delegations_replay`. Nullable timestamp columns and a default-zero index
version are added by the existing TypeORM schema synchronization. Existing live
rows and displayed TDH remain intact during the upgrade. TDH calculations defer
until the upgraded index is ready.

Each replay chunk commits its rows and `nft_delegation_replay_blocks` checkpoint
in one transaction. A failure or app shutdown leaves live rows intact; the next
run resumes after the last committed chunk. Expiry/state mismatch or missing
block time fails the chunk before its checkpoint advances. Once replay reaches
the captured chain head, one transaction replaces both live tables, advances the
live checkpoint, sets `index_version = 1`, marks full TDH recalculation needed,
and clears shadow state. No startup migration guesses registration times from
`created_at`, the old pair block, or the time of indexing.

The ordinary scheduled/manual TDH run rebuilds all wallet/group results after
replay. Existing displayed TDH can remain stale until that run; operators can
manually start TDH after replay rather than wait for its normal daily schedule.
If NFTDelegation is disabled, enable or manually run it to perform the upgrade.
An explicit NFTDelegation Reset clears replay progress and sets version zero,
while preserving live rows until the replacement replay completes. It does not
itself scan the chain.

## RPC and storage limits

The selected native RPC must support historical `eth_call` at registration blocks
back to deployment. Scope comes from each log; expiry comes from that log's
matching end-of-block contract entry, so Safe, batch and manager transactions
work without decoding outer transaction calldata. Same-block revoked entries are
excluded, and later registrations are matched in log order. Unavailable archive
state stops replay/indexing with a worker error; it never silently defaults a
restricted delegation to all tokens or unlimited expiry. Change to an
archive-capable RPC and rerun NFTDelegation to resume.

Core preserves backend #2151's representation: all-token scope stores token zero;
false/zero values are written explicitly; zero or beyond-safe-integer expiry maps
to `NEVER_DATE`. The existing delegation table stores the last registration per
(block, from, to, collection, use case), rather than all token-specific entries
sharing that key. Token-specific IDs above the backend signed-INT ceiling are
logged and excluded from emitted rows rather than widened or truncated; their
positions remain in the historical-state read plan so other entries in that
block still resolve correctly. Sub-delegation registrations revoked later in
the same block are also excluded, while later re-registrations survive.
Consolidation eligibility continues to use the backend's confirmed-pair contract,
rather than ordinary delegation expiry/token scope. Ordinary delegation scope
and expiry changes do not alter token ownership, holding age or TDH boosts, so
only consolidation changes invalidate TDH during incremental indexing. Backend
and Core must use the same activation constant if the proposed rollout date
changes.
