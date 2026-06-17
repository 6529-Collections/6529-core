---
name: desktop-pr-iteration
description: Open and iterate a 6529-core Electron desktop update pull request after local renderer sync and Windows build validation, including branch hygiene, PR body evidence, GitHub checks, review-bot comments, and follow-up fix commits. Use when Codex is asked to raise or shepherd a desktop update PR until CI and bots are satisfied.
---

# Desktop PR Iteration

Carry a desktop renderer update from local validation through a draft PR and keep ownership until checks and review bots are satisfied.

## Before Commit

- Confirm the branch uses the normal `codex/` prefix.
- Confirm the desktop version bump is included.
- Confirm local evidence is ready: current web SHA, install result, checks, Windows build/package result, and artifact path or blocker.
- Stage only intended files. A renderer subtree sync can be large; inspect the summary and any root files carefully.
- Use `codex-diff-check` on Windows.

## Commit And Push

Use a direct commit message such as:

```text
Update desktop renderer to latest web
```

Push the branch to `origin`. If local history contains checkpoint commits, squash or amend before push when that keeps review cleaner and does not lose useful merge metadata.

## Draft PR

Open a draft PR against `main` in `6529-Collections/6529-core`.

Include:

- imported frontend SHA and date checked
- desktop package version bump
- desktop-specific conflict decisions preserved
- local validation commands and results
- Windows package artifact path under `dist/`, or the exact packaging blocker
- note that publish/sign/S3 steps were not run unless explicitly requested

## Bot And CI Loop

- Watch GitHub checks to terminal states.
- If CI fails, inspect logs before changing code. Use the GitHub CI-fix workflow or equivalent repository tooling for repeated failures.
- If review bots comment, treat actionable findings as normal review feedback. Fix, test, push, and reply only with evidence.
- Do not mark review threads resolved unless the fix is pushed and validated, or the finding is clearly not applicable and explained.
- The 6529bot responsiveness harness runs the repository root `./bin/6529 run dev` on Ubuntu and expects the renderer web app at `PORT=3001`. Preserve the narrow `REVIEWBOT_RESPONSIVENESS_OUTPUT_DIR` branch in `bin/6529` that delegates this bot-only path to `renderer/`; the normal desktop dev path should still start Electron.
- Stop after CI and bots are happy, leaving the PR as draft unless the user explicitly asks to mark ready or merge.

## Closeout

Report PR URL, head SHA, web SHA imported, local build/package evidence, CI/review status, and remaining risks.
