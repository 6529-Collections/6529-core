# 6529 Core Ops

Operational memory for the Electron desktop repository lives here, outside the `renderer/` subtree. Keep desktop-specific runbooks, skills, and decisions at this root so future web subtree syncs do not overwrite them.

Current skills:

- `ops/skills/sync-desktop-renderer`: pull current web into `renderer/` and preserve Electron-specific behavior.
- `ops/skills/test-desktop-build`: validate and package the Windows desktop app locally.
- `ops/skills/desktop-pr-iteration`: open a desktop update PR and iterate with CI/review bots.
