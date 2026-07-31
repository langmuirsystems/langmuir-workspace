#!/usr/bin/env bash
# Pull or commit+push a single GitHub repo by short name.
#
# Usage:
#   ./scripts/sync-repo.sh pms pull
#   ./scripts/sync-repo.sh pms push "fix: corrected line totals"   # -> push.sh
#   ./scripts/sync-repo.sh pms status
#
# `push` is a thin wrapper over push.sh, which pulls --rebase before it pushes.
# Prefer calling ./scripts/push.sh directly; this exists for old muscle memory
# and for scripts/deploy-scheduling.sh.

set -euo pipefail
source "$(dirname "$0")/config.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REPO_NAME="${1:-}"
ACTION="${2:-status}"
MESSAGE="${3:-}"

if [[ -z "$REPO_NAME" ]]; then
  echo "Usage: $0 <repo-name> <pull|push|status> [commit-message]" >&2
  echo "Available repos:" >&2
  for entry in "${REPOS[@]}"; do
    IFS='|' read -r name _ _ _ <<< "$entry"
    echo "  - $name" >&2
  done
  exit 1
fi

info=$(find_repo "$REPO_NAME") || { echo "Unknown repo: $REPO_NAME" >&2; exit 1; }
IFS='|' read -r folder url service <<< "$info"
repo_path="$PROJECT_ROOT/$folder"

if [[ ! -d "$repo_path/.git" ]]; then
  echo "No .git directory at $repo_path — run scripts/bootstrap.sh first." >&2
  exit 1
fi

cd "$repo_path"

case "$ACTION" in
  status)
    echo "── $REPO_NAME @ $repo_path ─────────────────"
    git status --short --branch
    ;;
  pull)
    echo "Pulling $REPO_NAME from origin..."
    git pull --rebase
    ;;
  push)
    # Delegated to push.sh since 2026-07-31. The version that used to live here
    # did add -> commit -> push with NO pull, and exited 0 when there was nothing
    # to commit, which silently skipped pushing an earlier unpushed commit. Two
    # people push these repos now, so every route has to pull --rebase first.
    # This is a wrapper, not a second implementation. Do not reinstate the git
    # commands here.
    if [[ -z "$MESSAGE" ]]; then
      echo "Commit message required for push." >&2
      exit 1
    fi
    exec "$SCRIPT_DIR/push.sh" "$REPO_NAME" "$MESSAGE"
    ;;
  *)
    echo "Unknown action: $ACTION (use pull|push|status)" >&2
    exit 1
    ;;
esac
