# Device signing, for a client that is not this one

Everything a second implementation needs to produce signatures this repository
and the backend will accept. It was written by implementing it twice: the
values in `shared/device-signing/vectors.json` were produced by the code in
`renderer/lib/device-signing/` and independently reproduced in Python, and the
two agreed byte for byte before this document existed.

The published OpenAPI describes the *fields* of a grant and a signature. It
does not give the EIP-712 type tuples, the domains or the salt, so today those
are only discoverable by reading the TypeScript. That is what this fills in.

## What a device grant is

A wallet signs, once, a statement granting a separate **Ed25519** key the
right to sign writes on its behalf. Afterwards the device key signs each write
alone. The device key cannot move funds, change a handle, add devices or act
as an admin - the signed statement says exactly that, and the scopes are fixed
when the grant is signed.

This matters most to clients that write often and cannot ask a human to
approve each one.

## The grant: EIP-712 `DeviceGrant`

| | |
|---|---|
| domain `name` | `6529 Device Grant` |
| domain `version` | `"2"`, or `"1"` for the older shape |
| domain `salt` | `0x4887f15a22b96f574a9f835b87e01e293dc7587acbfc13b5f224b89cd2d8c8aa` |
| `primaryType` | `DeviceGrant` |

```
DeviceGrant(
  string  statement,
  address wallet,
  bytes32 deviceKey,
  string  scopes,
  bytes32 mlsDeviceKey,
  uint16[] ciphersuites,   // version "2"; version "1" has uint16 ciphersuite
  uint64  issuedAt,
  uint64  expiresAt,
  string  origin
)
```

**The grant id is the EIP-712 digest of that message**, lowercase.

Four things are easy to get wrong:

- **The statement is signed, not displayed.** The server re-renders it from
  the grant fields and compares; one changed character fails verification. It
  is never localized. `renderAppGrantStatementDraft1` in `app-grant.ts` is the
  definition, and `vectors.json` carries the exact string.
- **`scopes` is a comma-joined string inside the typed data** but an array in
  the request body. Canonical order is `post, edit, delete, react, vote`, and
  `post` is mandatory.
- **`expiresAt` is minute aligned** and at most **181 days** after `issuedAt`.
  This client issues 180.
- **A signing-only grant** sets `mlsDeviceKey` to the zero hash and
  `ciphersuites` to `[]`. It is not an error; it means no encrypted messaging.

Register it with `POST /device-grants`:

```json
{ "grant": { "wallet": "0x…", "device_key": "0x…", "scopes": ["post","edit"],
             "version": 2, "ciphersuites": [],
             "issued_at": 1762819200, "expires_at": 1778371200,
             "origin": "your client" },
  "wallet_signature": "0x…", "device_label": "optional" }
```

## Each write: EIP-712 `InterimEvent`

| | |
|---|---|
| domain `name` | `6529 Network P2P` |
| domain `version` | `"1"` |
| domain `salt` | `keccak256("6529 Network pre-genesis interim 1")` |
| `primaryType` | `InterimEvent` |

```
InterimEvent(
  uint16   kind,          // 1 POST, 2 EDIT, 3 TOMBSTONE, 4 REACT
  uint16   kindVersion,   // 1
  string   wave,
  address  author,        // lowercase grant wallet
  uint8    keyType,       // 2 = Ed25519
  bytes32  deviceKey,
  bytes32  authRef,       // the grant id
  uint64   seq,
  uint64   anchor,        // 0
  uint64   claimedTime,
  string[] refs,
  bytes32  bodyHash,
  uint32   bodySize
)
```

**The device signature is Ed25519 over the event id BYTES**, not over its hex
text. Send it as:

```json
{ "grant_id": "0x…", "seq": 1, "claimed_time": 1762819200000, "signature": "0x…" }
```

- `bodyHash` is `keccak256` of the **canonical JSON** of the request body with
  `device_signature` removed - a signature cannot cover itself. `bodySize` is
  that string's UTF-8 byte length. With no body: zero hash, size 0.
- `claimed_time` is epoch **milliseconds**, within **10 minutes** of server
  time. So a write is signed when it is *sent*, not when it is drafted.
- `seq` must be **unique per device key**; a reused value is rejected.
  Allocate and persist it *before* the request goes out. An unused number is a
  harmless gap.
- A rejected signature returns **400** with a message beginning
  `Invalid device signature:`, and the write does not happen.

## Canonical JSON

`canonical-json.ts`, and the part most likely to differ between languages:

- object keys sorted by **UTF-16 code unit** - not by locale, and not by the
  default ordering of every language's sort
- no whitespace anywhere
- non-ASCII left **unescaped** (`é`, not `é`)
- non-finite numbers are an error

```
{"b":1,"a":2}           -> {"a":2,"b":1}
{"é":1,"z":2}           -> {"z":2,"é":1}
```

## One useful check

The grant domain salt is not an arbitrary constant: it is the interim event
salt, `keccak256("6529 Network pre-genesis interim 1")`. An implementation
that derives it independently and arrives at the same bytes has probably got
the rest right too.

## Verifying an implementation

`shared/device-signing/vectors.json` holds canonical JSON cases, body hashes,
an event id, both grant versions with their statement and grant id, the expiry
alignment rule, and the salt preimage. `renderer/__tests__/device-signing-vectors.test.ts`
runs them against this repository.

A failure there is not a stale expectation to refresh. Every id is what the
backend verifies and what already-issued grants were signed under, so a change
that moves one invalidates grants in the wild.
