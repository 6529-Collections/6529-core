# Alchemy NFT API deprecation TODO

Status: Open

Deadline: September 30, 2026

Audit basis: `main` at `d3053270bbe780addc14b563b5b57f64effdcc67`

Alchemy will stop serving ten deprecated NFT API endpoint families on the
deadline above. Core has no native Electron call to a deprecated NFT endpoint,
but its imported `renderer/` contains the frontend's V3
`searchContractMetadata` path. A released desktop build with that renderer can
lose free-text NFT collection search after the deadline.

Sources:

- [Alchemy deprecation notice](https://www.alchemy.com/docs/changelog/2026/8/18)
- [V3 `getContractMetadata`](https://www.alchemy.com/docs/reference/nft-api-endpoints/nft-api-endpoints/nft-metadata-endpoints/get-contract-metadata-v-3)
- [Current NFT API endpoint inventory](https://www.alchemy.com/docs/reference/nft-api-endpoints)

## Ownership and audit result

- `renderer-source.json` identifies `6529seize-frontend` as the source of the
  renderer subtree. The affected files under `renderer/` match the frontend
  call path and must be fixed in FE first, then imported through Core's
  documented `pull-web` workflow.
- `renderer/app/api/alchemy/collections/route.ts` and
  `renderer/services/alchemy/collections.ts` call V3
  `searchContractMetadata`.
- `renderer/hooks/useAlchemyNftQueries.ts` uses that local route and falls back
  to backend `/alchemy-proxy/collections`. The fallback shares the existing
  FE/BE response-envelope mismatch documented in those repositories' TODOs.
- `renderer/components/nft-picker/hooks/useNftSearch.ts` exposes the affected
  keyword search to xTDH grant selection and Meme Card Set configuration.
- Native code under `electron-src/` and shared root code do not call any NFT
  API endpoint named in the deprecation notice. Root `next.config.ts` only
  supplies `ALCHEMY_API_KEY` to renderer runtime configuration; it does not
  choose an endpoint.
- The other nine deprecated endpoint families are absent. Application concepts
  named airdrop, rarity, sales, spam, and local NFT queries are unrelated to
  the removed Alchemy methods.

## Required TODOs

### 1. Do not fork the renderer solution in Core

- [ ] Complete and merge the FE decision for collection discovery:
  address-only lookup through V3 `getContractMetadata`, or a separately chosen
  keyword-search source.
- [ ] Complete the coordinated backend proxy change before removing a fallback
  still used by a shipping renderer.
- [ ] Do not hand-edit the imported renderer to make an independent Core-only
  fix. That would diverge from FE and be overwritten by the next subtree sync.

### 2. Import the FE migration

- [ ] On Core's long-lived `pull-web` branch, start from current Core `main` and
  run the repository's `6529 pull-web` workflow after the FE migration lands.
- [ ] Verify `renderer-source.json` records the exact FE commit containing the
  migration.
- [ ] Resolve only genuine desktop adaptations and apply any relevant incoming
  renderer config changes to Core's root `next.config.ts`; do not restore the
  deprecated endpoint during conflict resolution.
- [ ] Confirm the synced renderer no longer contains
  `searchContractMetadata` or another endpoint from Alchemy's removal list.

### 3. Validate the desktop result

- [ ] Run Core's compile/type-check validation and desktop renderer-contract
  guard for the sync. No desktop package build or publish is required merely
  for this migration TODO.
- [ ] Exercise the selected collection input behavior in both renderer
  consumers: xTDH grant selection and Meme Card Set configuration.
- [ ] Verify both local renderer API handling and backend proxy fallback use
  the same request and response contract.
- [ ] If address-only behavior is selected, verify invalid text never reaches
  `getContractMetadata` and that valid checksummed/lowercase addresses still
  resolve metadata.
- [ ] If keyword discovery is retained, verify the new provider works in the
  packaged desktop runtime and does not depend on a browser-only secret or
  unsupported network path.

### 4. Release before the deadline

- [ ] Merge the renderer-sync PR to Core `main` with enough lead time for the
  normal desktop release process.
- [ ] Publish a desktop version containing the synced migration before
  September 30, 2026; updating FE/BE alone does not update already installed
  desktop bundles.
- [ ] After release, verify the shipped version no longer sends
  `searchContractMetadata` requests.

## Exactness and logic assessment

- Core's changes should match FE **by source commit**, not by independently
  reimplementing the logic. `renderer-source.json` is the provenance check.
- The supported `getContractMetadata` route is an exact replacement only for
  an address lookup. It cannot preserve free-text suggestions, result lists,
  pagination, or list-level spam filtering.
- Core-specific work is therefore sync, desktop validation, and release. The
  underlying product/API decision and implementation belong to FE and BE.
- There is no evidence that native Electron indexing, transactions, TDH, or
  local NFT persistence needs an Alchemy NFT API migration for this notice.
