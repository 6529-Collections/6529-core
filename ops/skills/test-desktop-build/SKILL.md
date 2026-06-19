---
name: test-desktop-build
description: Validate a 6529-core Electron desktop update on Windows with secure installs, renderer and Electron type/build checks, local package creation, artifact inspection, and Windows-specific environment constraints. Use when Codex needs to test or package the 6529 Electron app before a PR or release.
---

# Test Desktop Build

Validate that the merged renderer can run through the desktop build path on this Windows EC2 Codex host.

## Host Constraints

- Do not reboot or stop the EC2 instance during desktop testing.
- Verify Docker or WSL only if a task truly needs them; normal desktop packaging should use Windows-native tooling.
- Avoid upload/sign/publish scripts unless the user explicitly asks. Local PR testing should not publish to S3 or CloudFront.

## Install

The repo's `install:secure` scripts are the authority, but the Bash wrapper can fail on this Windows checkout. If that happens, run the same guarded pieces directly:

```powershell
$env:SEIZE_6529_COMMAND='1'
node scripts/assert-no-package-lock.cjs
node scripts/run-secure-pnpm.cjs install
```

Then install renderer dependencies through the root renderer runner. It sets `SEIZE_6529_COMMAND=1` and uses Git Bash as npm's script shell on Windows, which renderer scripts need for `rm`, `mv`, and `bash`:

```powershell
$env:SEIZE_6529_COMMAND='1'
node scripts/run-renderer-pnpm.cjs run install:secure
```

## Local Checks

Run the smallest checks that prove the merge contract first, then broaden. If the worktree may contain old generated artifacts, clean before standalone type checks; `renderer/out/types` can otherwise be picked up by broad TypeScript includes and report stale Next validator errors.

```powershell
$env:SEIZE_6529_COMMAND='1'; pnpm run clean-win
$env:SEIZE_6529_COMMAND='1'; pnpm run build-env-schema
$env:SEIZE_6529_COMMAND='1'; pnpm run build-next-config
$env:SEIZE_6529_COMMAND='1'; pnpm run type-check
```

For renderer-specific tests, run from `renderer/` with the same guard. Include tests near manually merged desktop files when they exist:

```powershell
$env:SEIZE_6529_COMMAND='1'; pnpm run test:no-coverage -- __tests__/components/auth/Auth.test.tsx __tests__/components/ipfs/IPFSContext.test.tsx __tests__/config/securityHeaders.test.ts __tests__/config/nextConfig.test.ts
```

## Windows Build

Use the Windows build script for local testing:

```powershell
$env:SEIZE_6529_COMMAND='1'; pnpm run build-win
```

For a local Windows package, prefer a non-publishing package build after `build-win`. If signed IPFS binaries are needed, first run `download-signed-ipfs`; do not upload or sign unless requested.

```powershell
$env:SEIZE_6529_COMMAND='1'; pnpm run download-signed-ipfs
$env:SEIZE_6529_COMMAND='1'; $env:CSC_IDENTITY_AUTO_DISCOVERY='false'; pnpm exec electron-builder --config electron-builder.production.json --win --x64 --publish never
```

If `download-signed-ipfs` is blocked by AWS credentials, document the blocker and still run `build-win` and an unsigned package path if possible.

## Packaged Smoke Test

Launch `dist/win-unpacked/6529 Desktop.exe` after packaging and inspect `AppData\Roaming\6529-core\logs\main.log`.

Require evidence for:

- strict schema loaded (`SCHEMA: true`) without `env.schema.runtime.cjs not found`
- `NEXT SERVER: Ready on http://localhost:<port>`
- `IPFS] Daemon fully initialized`
- `Main window ready to show`

Terminate only the processes started by the smoke test after collecting evidence.

## Evidence

Record command results, package artifact paths under `dist/`, and any skipped checks with reasons in the PR body. Run `codex-diff-check` before commit.
