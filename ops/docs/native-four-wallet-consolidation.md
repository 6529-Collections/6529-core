# Native four-wallet consolidation index

Core's native SQLite delegation index and TDH worker follow backend
[#2148](https://github.com/6529-Collections/6529seize-backend/pull/2148)
(head `c041a853d0bc1ebbd0c181492a8f6d2592c05dd2`) for grouping and directional
registration times. Safe/batch token scope and expiry normalization follow
[#2151](https://github.com/6529-Collections/6529seize-backend/pull/2151)
(head `2ed34d62125145fc9ad634a3f3715b731d9f7d5c`). These backend changes are
independent rollout dependencies; native parity does not replace their deployment
or the frontend rollout. The referenced #2151 head includes the matching same-block sub-delegation
revocation filter and oversized-token state-read placeholder fixes, preserving
parity with Core for manager rows and same-block expiry resolution. This change requires no renderer subtree sync or desktop
version change.

## Grouping contract

Confirmed reciprocal pairs form a full mesh, with at most four wallets per group.
Pairs are processed newest block first, with lexicographic pair-key ties. A wallet
can belong to only one group. Two/three-wallet groups retain existing eligibility.

Growth beyond three requires a member connected to every other member by pairs
whose *both* directional registration timestamps are at or after
the selected backend’s configured activation cutoff, inclusive (production launch: 2026-10-15 00:00:00 UTC). All six directions
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

The first NFTDelegation worker run with `index_version != 2` replays logs from
the contract deployment block (17114433) into shadow consolidation tables and
`native_delegation_registrations_replay`. Every surviving registration retains
its block, log index, registration timestamp and exact token scope. The public
`delegations` table keeps its existing key; the additional registration ledger
retains duplicate same-block entries and oversized token IDs for state matching.
Existing live rows and displayed TDH remain intact throughout the upgrade.
Normal entity synchronization adds the ledger tables and checkpoint fields.

Historical scanning uses only `eth_getLogs` and block headers. Once logs catch
up, the worker resolves expiry from the contract's stored entries at a recent
block, using `retrieveDelegationAddresses` and indexed `globalDelegationHashes`
reads. The contract appends entries on registration and deletes all entries for
the delegator/collection/delegate/use-case key on revocation. The log replay
applies those operations in block/log order, including same-block revocations
and subsequent renewals. It matches each surviving entry's registration time,
addresses, token ID and all-token flag before accepting expiry. Expired entries
remain stored until revoked and retain their actual expiry; they are not treated
as currently authorized just because a getter returns them.

Each chunk commits shadow rows and its checkpoint atomically. Reconciliation
processes at most 20 delegator/collection/use-case groups per batch, using one
pinned recent block per batch. If a long scan or interruption ages the target by
more than 32 blocks, logs catch up before further state calls. A batch exceeding
64 blocks of age is rejected, safely inside AWS's 128-block state window.
Each state request checks age at dispatch and completion, including RPC failures
after pruning, so a slow or queued read reports the resumable snapshot-age error
instead of misclassifying expired state as a slot-count or metadata mismatch.
Snapshot hashes are checked around state reads. Before catch-up and each scan
chunk's commit, the previous saved checkpoint hash is rechecked so a canonical
new endpoint cannot overwrite evidence of orphaned staged history. Saved hashes detect
a changed chain checkpoint and initiate automatic recovery rather than publishing
mixed history. A temporarily unavailable block or hash preserves replay progress
and asks for a retry; it does not require Reset. The checkpoint hash also commits
to its ancestors through each block's parent hash, so a canonical reorg below the
checkpoint changes that hash. State/count/scope/time mismatches stop reconciliation
without publishing guessed values.

Scanning extends the saved checkpoint from `checkpoint.block + 1`; committed
chunks are not overwritten by overlapping rescans. Each chunk captures its end
block hash before fetching logs and rechecks it and the previous checkpoint
before the atomic event/checkpoint commit. A changed uncommitted range is
retried; a changed committed ancestor restores a verified recovery point. Deleting only ledger rows
in a re-mined range would not undo revocations or consolidation changes, so it
is not a substitute for this checkpoint protection.

Normal scanning targets 16 blocks behind the actual chain head (roughly three
minutes on Ethereum), instead of committing the newest block. Snapshot-age
checks still use the actual head and retain the 64-block state-window cap.
The worker retains up to 32 durable recovery points near the scan tip, including
the complete staged consolidation, delegation, registration/expiry and checkpoint
state. On a checkpoint mismatch it verifies an older anchor against the RPC,
restores that entire state in one transaction, and resumes the tail on the next
scheduled run. This also reverses revoked entries and consolidation changes;
it never simply replaces a saved block hash. TDH waits until verified state is
republished and a full recalculation is requested after recovery.

An older installation already stopped on a changed hash has no recovery points.
If no retained anchor can be verified, the worker automatically restarts shadow
history once, without deleting live index rows, token holdings or other app data.
That fallback can take as long as the initial replay. It is also the fallback
for a reorg deeper than all retained points. Manual Reset is not required.
Unavailable or inconsistent RPC responses remain retryable and do not authorize
resetting history. The new recovery table is created by normal schema sync;
healthy version-two indexes do not need another version upgrade/replay.

Each reconciliation iteration reads at most 20 tuple groups with concurrency
five, preserving verified progress and catching logs up when the checkpoint
ages by more than 32 blocks. This bounds group count, not elapsed time or the
number of entries within one group. The 64-block safety cap cannot guarantee
completion for arbitrarily slow RPCs or arbitrarily large groups; an aged batch
fails closed and retries from durable progress with a fresh snapshot.

Verified expiry is immutable for a surviving registration slot, so matched
groups are durable across interruptions and newer snapshot blocks. Later log
catch-up deletes revoked slots and marks new registrations pending; it never
applies a revoked registration's expiry to its replacement. After every pending
group is verified, one transaction replaces live consolidation, delegation and
registration-ledger tables, advances the live checkpoint, and clears shadow
state. TDH waits for the initial upgrade; ordinary scope/expiry updates do not
invalidate token-holding TDH. Consolidation changes durably mark recalculation.

Existing version-zero/one databases rebuild the version-two index.
Even an early tester who completed the version-one replay must perform one full
version-two rebuild; completing that earlier replay does not avoid this upgrade.
A partial older-format replay restarts only its shadow state once, preserving
live rows.
Subsequent version-two interruptions resume from saved scan/reconciliation
progress. An explicit NFTDelegation Reset clears shadow progress and marks the
index unready while preserving live rows until its replacement is complete.
Fresh installs, Reset, existing upgrades and incremental runs use the same
archive-free scan/reconciliation path.

The ordinary scheduled/manual TDH run rebuilds all wallet/group results after
upgrade. Existing displayed TDH can remain stale until that run; operators can
manually start TDH after replay rather than wait for its daily schedule. If
NFTDelegation is disabled, enable or manually run it to perform the upgrade.

## RPC and storage limits

Historical contract state is not required. The selected mainnet RPC must serve
historical logs/block headers and ordinary recent `eth_call`; this supports the
AWS full-node service behind the default RPC. Scope comes directly from logs,
and expiry comes from matched surviving contract entries, independent of Safe,
batch or manager outer transaction calldata. A failed recent RPC call leaves
live rows and saved progress intact for the next run. The index reconstructs
current surviving registrations, not expiry snapshots for already-revoked
historical registrations. Four-wallet timestamps remain historical block times.

Core preserves backend #2151's representation: all-token scope stores token zero;
false/zero values are written explicitly; zero or beyond-safe-integer expiry maps
to `NEVER_DATE`. The existing delegation table stores the last representable
registration per (block, from, to, collection, use case), rather than all token-specific entries
sharing that key. Reconciliation sorts the complete ledger by block/log index,
regenerates each group's public rows from the verified entries, and only then
deduplicates that legacy key. Token-specific IDs above the backend signed-INT
ceiling are logged and excluded from emitted rows rather than widened or truncated; their
positions remain in the surviving-registration ledger so other entries still
match their own contract slot and expiry. Sub-delegation registrations use the same ordered replay and scope/expiry
reconciliation; registrations revoked later in the same block are excluded,
while later re-registrations survive.
Consolidation eligibility continues to use the backend's confirmed-pair contract,
rather than ordinary delegation expiry/token scope. Ordinary delegation scope
and expiry changes do not alter token ownership, holding age or TDH boosts, so
only consolidation changes invalidate TDH during incremental indexing. Core reads the selected backend’s activation policy; there is no separate native cutoff to update.

## Environment activation policy

Core reads `consolidation.max_wallets`, `ungated_max_wallets` and `four_wallet_activation_at` from `/api/settings` on its selected backend before calculating TDH. Test-backend requests use the existing private staging authentication configuration. Neither the renderer nor native grouping supplies a launch-date fallback. If settings are unavailable or malformed, a manual/full TDH run waits and preserves its prior results; event indexing can continue while reconsolidation remains marked for recalculation.

A calculation uses one policy snapshot for its holding-time and grouping work, including incremental reconsolidation and missing-wallet rows. The maximum (4) and ungated boundary (3) remain fixed in backend code; there is no native copy or new secret. The same request supplies all three values; routine delegation polling without reconsolidation does not fetch settings. TDH block completion records the backend URL, normalized cutoff and both wallet limits. When they differ, an incremental calculation becomes a full calculation so every wallet is regrouped under the same policy. Existing databases gain the nullable completion field through the normal Core entity synchronization.

Production launch is intended for 2026-10-15 00:00 UTC; staging may use an earlier cutoff to test four-wallet behavior before launch. Configuration belongs to the backend environment. Both environments read the same mainnet contract, so test with dedicated wallets and renew any pre-production-cutoff links after the production cutoff before expecting them to count in production.

### First calculation and policy failures

The first calculation for an existing TDH block without a `consolidation_policy_key` is a full calculation, even if triggered by a small consolidation change. The missing key is not evidence that the old groups follow the new policy. This is the same full regrouping requirement raised by the index upgrade, not a separate automatic second run.

The settings request passes an abort signal to `fetch` and has a 15-second timeout covering headers and response-body processing. Network failure, timeout or invalid policy defers TDH; it never supplies an old or production-date fallback. A failed full run is retried by the next TDH schedule (00:15 daily) or by manually requesting Recalculate TDH Now. A failed event-driven reconsolidation marks TDH for recalculation; a later full run or a new consolidation-triggered calculation applies it. Indexing can continue meanwhile.

The backend emits canonical whole-second UTC timestamps with `.000Z`; native parsing also accepts the equivalent `Z` form. Other offsets or fractional formats are deliberately outside the shared policy contract. A future contract-format change must update the backend and both clients together rather than silently widening native acceptance.

The workers capture a policy separately for each calculation. If configuration changes between runs, displayed groups retain the completed run’s policy until the next calculation detects the changed key and fully regroups. Active calculations retain their own snapshot, so they do not mix cutoffs mid-run.

## Deterministic TDH ranking

Wallet and consolidated ranks use the same ordering as backend #2148.
Overall rank sorts descending by boosted TDH, TDH, Gradient TDH and NextGen
TDH. Each collection sorts descending by its boosted TDH, TDH, balance and
then total wallet/group balance. Remaining ties use lowercase wallet or
consolidation key in ascending plain lexical order; equal identities compare
as equal. Collection ranks remain `-1` for zero boosted collection scores.
Per-Meme owner ranks use token TDH, total boosted TDH and the same identity
ordering. Gradient and NextGen token ranks retain descending token TDH and
ascending numeric token ID.

Raw wallet candidates are included when TDH or total balance is positive, or
the resolved consolidation has multiple wallets. Empty standalone wallets are
excluded; funded zero-score wallets and empty members of a consolidation stay.
The next full calculation replaces old raw/group TDH rows, naturally removing
previously included empty singleton rows. No ownership or delegation repair is
needed for this ranking change. Partial calculations still recalculate only
affected holdings, but rebuild token rank arrays and persist global rank shifts
for all retained rows using the complete current token catalogs.

Scores, boosts, holding ages, merged edition-day arrays and the positive-score
Merkle leaves are unchanged by ranking. Compare Core and backend results only
at the same TDH block and consolidation policy after both use these tie rules.
