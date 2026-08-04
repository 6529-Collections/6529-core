---
name: sync-desktop-renderer
description: Sync the 6529 web frontend into the 6529-core Electron renderer subtree, preserve desktop-only behavior, resolve pull-web conflicts, update duplicated desktop config, and keep desktop version metadata aligned with main. Use when Codex is asked to bring the Electron desktop app up to date with recent or current 6529.io frontend changes.
---

# Sync Desktop Renderer

Bring `renderer/` to the current `6529-Collections/6529seize-frontend` main while keeping the Electron app's local runtime model intact.

## Ground Rules

- Keep root `ops/` outside `renderer/`; future `git subtree pull --prefix=renderer` runs can overwrite renderer-local operational docs.
- Verify the current web SHA before claiming the desktop is current:

```powershell
git ls-remote https://github.com/6529-Collections/6529seize-frontend.git refs/heads/main
```

- On this Windows Codex host, prefer the guarded direct command because the repo `bin/6529` shim can fail on CRLF/shebang handling:

```powershell
$env:SEIZE_6529_COMMAND='1'; pnpm run pull-web
```

- If a merge is left open, finish resolving and commit before pulling another web delta.
- Run `pull-web` only from the long-lived `pull-web` branch. The command fails
  closed on any other branch.
- Never change the desktop version during a `pull-web` sync. Before committing,
  compare root `package.json` and related version metadata with current `main`
  and restore any version drift from `main`.
- Change the desktop version only for an explicitly requested release. Create
  a new branch from `main` named for the version, update the version and release
  from that branch, then merge that release branch back to `main`. Do not infer
  release/version work from a renderer sync, release-candidate wording, PR
  creation, or a push.

## Conflict Policy

Take upstream web code for normal frontend features, pages, tests, services, styles, and generated renderer lockfile changes.

Preserve or reapply desktop-specific behavior in these areas:

- `renderer/services/auth/session-v2.utils.ts`: Electron must use `client_type=desktop` and route native-session login, refresh, logout, and connection sharing through `window.nativeAuth` so refresh tokens stay in the main process.
- `renderer/components/auth/AuthProvider.tsx`, `renderer/components/auth/AuthSignModal.tsx`, `renderer/components/shared/ConfirmModalShell.tsx`, `renderer/components/shared/modal-layers.ts`, `renderer/components/core/eth-scanner/RpcProviderModal.tsx`, `renderer/components/core/eth-scanner/Workers.tsx`: auth cancellation must remain available while signing, invalidate the in-flight signature, dismiss immediately, and remain dismissed while disconnect settles. The auth prompt must use the shared renderer shell below the Core wallet unlock/request layer; never make it a native HTML `<dialog>`, because Chromium top-layer dialogs hide nested Core wallet prompts. Unrelated administration dialogs must explicitly use the non-wallet layer below authentication rather than inheriting the wallet-request fallback.
- `renderer/wagmiConfig/seedWalletConnector.ts`, `renderer/wagmiConfig/seedWalletConnectionState.ts`, `renderer/components/auth/SeizeConnectProvider.tsx`: each Core seed-wallet connector must accept persisted connection state only for its own valid address and the shared supported-chain set, register request callbacks before dispatch, and reject pending requests on disconnect. Requested, persisted, switched, and provider chain selection must use that one chain contract so an unsupported chain can never be reported while mainnet RPC is used. Keep the Electron-tested connection-state module free of `viem`, `ox`, and other frontend dependency source. Adding a profile from either a Core seed-wallet or app-wallet connector must open the connector chooser immediately without first disconnecting the local wallet.
- `renderer/components/shared/core-wallet-modal-layout.ts`, `renderer/contexts/SeizeConnectModalContext.tsx`, `renderer/components/auth/SeizeConnectProvider.tsx`, `renderer/components/header/user/HeaderUserConnectModal.tsx`, `renderer/components/header/user/connector-modal-layout.ts`, `renderer/components/header/user/seed-wallet-selection-state.ts`: keep the connector chooser and Core request prompt on the same responsive envelope (`40rem` maximum width, `min(78dvh, 40rem)` maximum height), without a fixed height or taller wallet rows. Show `Connected · Active` on the disabled active Core wallet and `Connected · Switch` on another authenticated wallet; switching must reuse the authenticated account instead of starting a new connection. Keep chooser state outside `SeizeConnectProvider`, but mount the chooser UI inside `SeizeConnectContext.Provider` before wallet rows read active-account state.
- `renderer/components/confirm/ConfirmSeedWalletRequest.tsx`, `renderer/components/confirm/seed-wallet-request-layout.ts`: keep only the Core request body scrolling while its header and actions remain fixed inside the shared responsive envelope.
- `renderer/components/auth/SeizeConnectProvider.tsx`: cancelling or failing a new-wallet connection must restore the last authenticated profile state after the provider disconnects.
- `renderer/app/layout.tsx`, `renderer/components/providers/AppRouteProviders.tsx`, `renderer/components/providers/app-route-provider-features.ts`, `renderer/components/monitoring/AwsRumProvider.tsx`: `/browser-connector` must retain the wallet infrastructure needed for connection transfer while disabling app-global wallet-auth prompts, Quick Direct Messages, cookie consent/Mixpanel, version toasts, and AWS RUM.
- `renderer/components/error/Error.tsx`: the route error fallback must stay independent of `TitleProvider` and other application providers so it can render the original failure when provider initialization throws.
- `renderer/components/header/share/HeaderQRScanner.tsx`: desktop QR behavior, avoiding mobile-only scanner assumptions.
- `renderer/components/eula/EULAConsentContext.tsx`: Electron/local consent behavior.
- `renderer/components/ipfs/IPFSContext.tsx`: Electron bridge/local IPFS support.
- `renderer/config/env.schema.ts`: desktop optional IPFS env and media resolver defaults.
- `renderer/config/securityHeaders.ts`, `renderer/lib/media/ipfs-gateways.ts`, root `next.config.ts`: local IPFS gateway, media resolver, CSP, and image host compatibility.
- `renderer/components/drops/view/item/content/media/UnsupportedMediaLink.tsx`: external-browser handling and decentralized media normalization.
- `renderer/styles/seize-bootstrap.scss`: keep the explicit `../node_modules/bootstrap/scss/bootstrap` import if bare `bootstrap/scss/bootstrap` fails under Turbopack/Sass on the Windows pnpm install.

## Root Config Sync

The desktop root `next.config.ts` duplicates some renderer config because Electron builds the renderer locally. After taking web updates, check whether these concepts need to exist in both places:

- media resolver endpoint and hostname
- IPFS gateway allowlists and loopback development gateways
- Arweave gateway host additions
- CSP `connect-src`, `media-src`, and `frame-src`
- Next image `remotePatterns`
- public env passthrough for renderer runtime values

For packaged builds, `next.config.ts` must be able to load both:

- `renderer/config/env.schema.runtime.cjs`, generated by `build-env-schema` and included by electron-builder.
- `main/config/__PUBLIC_RUNTIME.json`, generated by `scripts/bake-public-runtime.ts` and included through `main/**/*`.
- `main/config/__PRIVATE_RUNTIME.json`, generated by `scripts/bake-public-runtime.ts` for main-process-only desktop secrets such as the Test backend `STAGING_API_KEY`. Do not copy this into renderer/public runtime config.

If either side drifts, production can either fall back to permissive env parsing or fail with a Zod missing-env error before the local Next server starts.

## Validation Before Moving On

After conflict resolution:

```powershell
git diff --name-only --diff-filter=U
rg -n "^(<<<<<<<|>>>>>>>)" next.config.ts package.json renderer -S
git status --short --branch
$env:SEIZE_6529_COMMAND='1'; pnpm run guard:desktop-renderer-contract
```

Use `codex-diff-check`, not raw `git diff --check`, for whitespace checks on this Windows worktree.
