# Desktop signed posts and encrypted messages

This focused successor to [Core #278](https://github.com/6529-Collections/6529-core/pull/278)
starts from main after the [#282 renderer sync](https://github.com/6529-Collections/6529-core/pull/282).
It uses the current imported frontend instead of merging the older messaging subtree.
Desktop version 0.3.16 and renderer-source metadata are unchanged.

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
| Private connection setup `50f9988e97` | Carry envelope validation and native request/response types. Also forward the field at the current renderer-to-native call site. Preserve link fragments; redact query/fragment/credentials from relevant native logs. |
| README/report `bb8e5a8521`, `50f9988e97` | Replace outdated rollout instructions with the current behavior and limitations. |
| Main merges `c8f3298501`, `be969d6caf` | Already inherited from current main. Do not revert newer port/profile/IPFS/Mac publishing changes or repeat version/dependency changes. |

## Behavior and boundaries

Signed-author indicators work independently of enrolling the viewer's own wallet.
Sending signed posts and encrypted DMs requires explicit device setup and an approved
wallet grant. Both Live and Test builds include signed-message, encrypted-DM and
app-device-grant flags. Existing signed grant wording and cryptographic formats remain
frontend-owned and unchanged.

Refresh tokens remain encrypted in the main process. The optional setup envelope is
ciphertext; its unlock secret remains in the private link fragment. Native profile
recovery does not copy browser encryption databases between origins. A temporary
fallback port can therefore have no existing device/history; returning to the saved
origin restores access to that origin's storage. The FE website still marks its
browser-to-Desktop secure-share choice as unavailable; this PR does not change that
separate upstream rollout gate.

## Packaged acceptance still needed

Rebuild locally, then check a known signed post's shield, explicit signed/encrypted
setup using a Core wallet and the browser connector, signed post creation, two-device
encrypted send/receive, restart with the same device/history, minimized notification
navigation, and Cancel/Escape during signing. If testing port contention, do not
re-enroll or clear origin storage. Verify only Desktop's own UI is loaded and return
to the saved origin before judging history persistence. Exercise plain connection
sharing too; secure link reception can be tested with a valid source-approved link
when the upstream gate permits it.
