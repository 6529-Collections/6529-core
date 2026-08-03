# 6529 Core Ops

Operational memory for the Electron desktop repository lives here, outside the `renderer/` subtree. Keep desktop-specific runbooks, skills, and decisions at this root so future web subtree syncs do not overwrite them.

Current skills:

- `ops/skills/sync-desktop-renderer`: pull current web into `renderer/` and preserve Electron-specific behavior.
- `ops/skills/test-desktop-build`: validate and package the Windows desktop app locally.
- `ops/skills/desktop-pr-iteration`: open a desktop update PR and iterate with CI/review bots.

Desktop renderer invariants are enforced outside the imported subtree by
`scripts/assert-desktop-renderer-contract.cjs` and
`electron-src/desktop-renderer-contract.test.ts`. The guard runs after
`pull-web`, during type-checking, and in the Electron suite that precedes every
normal desktop build. A sync that removes secure desktop wallet auth or the
auth-prompt escape path must fail until those desktop adaptations are restored.
