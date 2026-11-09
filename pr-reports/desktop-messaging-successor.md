# Desktop signed posts and encrypted messages

This focused successor to [Core #278](https://github.com/6529-Collections/6529-core/pull/278)
starts from main after the [#282 renderer sync](https://github.com/6529-Collections/6529-core/pull/282).
It uses the current imported frontend instead of merging the older messaging subtree.
Desktop version 0.3.16 is unchanged. The renderer and its source metadata come only
from the C+ renderer sync, [#287](https://github.com/6529-Collections/6529-core/pull/287),
merged into this branch.

## Extraction accounting

The reviewed source tip of #278 is `be969d6caf008b2d9cf82fbfdbf26af361969875`.

| Original change | Treatment in this PR |
| --- | --- |
| Renderer subtree `d78ff9f5d5`, source record `6c892283f4` | Superseded by the newer renderer already on main through #282; no subtree import here. |
| Sign-in guard adaptation `4f9e8341fe` | Current main already follows the current frontend sign-in implementation and cancellation contract; retained. |
| Build flags and CSP `cf3a24b3ea` | Shared flags in dev, all distribution targets and runtime baking; WASM policy follows the baked flag. Live app device grants now enabled in line with merged FE #4680. |
| Stable renderer origin `4e1645c9bd` | Reimplemented around main's owned listener and collision retries. Save only an actually bound first port; never overwrite a temporarily busy saved origin. Keep native profile recovery and startup gating. |
| Notification navigation `bca2204c0f` | Carry the content-free notification helper, safe internal target and restore/show/focus behavior. |
| EIP-712 connectors `d5540a1053` | Carry Core/browser signing and request display; preserve address/chain binding, cancellation and existing modal layers. Check requested root type; reject inherited type names. |
| Private connection setup `50f9988e97` | Carry envelope validation and native request/response types. Also forward the field at the current renderer-to-native call site. Preserve link fragments through main-process and renderer navigation, including a new setup link arriving on the same page; omit private URL details from logs. Reject decoded traversal, foreign paths and nested path encoding. |
| README/report `bb8e5a8521`, `50f9988e97` | Replace outdated rollout instructions with the current behavior and limitations. |
| Main merges `c8f3298501`, `be969d6caf` | Already inherited from current main. Do not revert newer port/profile/IPFS/Mac publishing changes or repeat version/dependency changes. |

## Behavior and boundaries

Signed-author indicators work independently of enrolling the viewer's own wallet.
Sending signed posts and encrypted DMs requires explicit device setup and an approved
wallet grant. Both Live and Test builds, including standalone renderer build/dev commands, include signed-message, encrypted-DM and
app-device-grant flags. Existing signed grant wording and cryptographic formats remain
frontend-owned and unchanged.

Refresh tokens remain encrypted in the main process. The optional setup envelope is
ciphertext; its unlock secret remains in the private link fragment. A repeated setup link uses its incoming query and unlock fragment rather than stale
page parameters. Cold-start links wait in memory for the owned renderer to install its navigation listener; page load alone does not release private credentials. Browser signing allows only one pending wallet request, and cancellation discards late results. JSON chain IDs retain their exact value through Core and browser signing. Native profile
recovery does not copy browser encryption databases between origins. A temporary
fallback port can therefore have no existing device/history; returning to the saved
origin restores access to that origin's storage. The FE website still marks its
browser-to-Desktop secure-share choice as unavailable; this PR does not change that
separate upstream rollout gate.

## C+ renderer: MLS 0x004E and grant v2 (D172)

Desktop's encrypted DMs are off on main, so this PR ships on top of the C+ renderer
sync (#287) and Desktop starts encrypted DMs directly on 0x004E (AES-256), with no
upgrade step. The renderer now asks for v2 grants: domain version `"2"` and
`uint16[] ciphersuites` in place of `uint16 ciphersuite`, for both `MlsDeviceGrant`
and the app `DeviceGrant` (`[78]` combined, `[]` signing only). The combined sign-in
requests `mls_ciphersuites=78` and signs a `urn:6529:mls-device-grant:v2:78:…`
resource as plain text; no Desktop code or contract pins the v1 strings.

- Core's typed-data parser copies field types and the message unchanged and only
  normalizes a domain `chainId`, which these domains do not have. The Electron suite
  signs the shared frontend/backend v2 vectors byte for byte with the Core seed wallet
  path, and checks that the browser connector passes the same domain, types and
  message to the browser wallet.
- The Core wallet confirmation shows the raw `ciphersuites` value with a readable note,
  for example `[78] (MLS 0x004E, AES-256)`, and no longer fails on a typed-data domain
  that has a chain ID.
- The C+ MLS module (`mls-wasm-530b38d27f820745.wasm`) is packaged with the renderer's
  public assets and matches its manifest; the production CSP allows WebAssembly only
  when the baked encrypted-DM flag is on.

Release Desktop only after the C+ backend and web releases are live in
production, and within one day of the web release, per the
[C+ release checklist](../renderer/ops/workstreams/e2ee-suite-0x004e/release-checklist.md#23-desktop-and-phone-within-1-day-of-web-live).
After 2026-12-02T00:00:00Z the server accepts only 0x004E, which a Desktop build
on the C+ renderer already uses.

## Packaged acceptance still needed

Rebuild locally, then check a known signed post's shield, explicit signed/encrypted
setup using a Core wallet and the browser connector, signed post creation, two-device
encrypted send/receive, restart with the same device/history, minimized notification
navigation, and Cancel/Escape during signing. If testing port contention, do not
re-enroll or clear origin storage. Verify only Desktop's own UI is loaded and return
to the saved origin before judging history persistence. Exercise plain connection
sharing too; secure link reception can be tested with a valid source-approved link
when the upstream gate permits it. Check receiving a second setup link while the
acceptance page is already open, and ensure the new code/fragment are retained. Also open a valid setup link with Desktop fully quit, then with its window closed in background mode.
