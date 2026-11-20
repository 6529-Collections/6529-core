#!/usr/bin/env bash
set -euo pipefail

# GitHub preserves the original actor on a rerun, so also check who started this attempt.
if [[ ! "${AUTHORIZED_ACTOR_ID:-}" =~ ^[1-9][0-9]*$ ||
      "${GITHUB_ACTOR_ID:-}" != "$AUTHORIZED_ACTOR_ID" ||
      -z "${GITHUB_ACTOR:-}" || "$GITHUB_ACTOR" != "${GITHUB_TRIGGERING_ACTOR:-}" ]]; then
  echo "::error::Companion signing requires the configured release operator."
  exit 1
fi
