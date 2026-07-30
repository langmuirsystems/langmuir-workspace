#!/usr/bin/env bash
# Pull or commit+push a single GitHub repo by short name.
#
# Usage:
#   ./scripts/sync-repo.sh pms pull
#   ./scripts/sync-repo.sh pms push "fix: corrected line totals"
#   ./scripts/sync-repo.sh kpi status

set -euo pipefail
source "$(dirname "$0")/config.sh"

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
    if [[ -z "$MESSAGE" ]]; then
      echo "Commit message required for push." >&2
      exit 1
    fi
    if [[ -z "$(git status --porcelain)" ]]; then
      echo "Nothing to commit in $REPO_NAME."
      exit 0
    fi
    git add -A
    git commit -m "$MESSAGE"
    git push
    echo "✓ Pushed $REPO_NAME. Railway service '$service' will restart."
    ;;
  *)
    echo "Unknown action: $ACTION (use pull|push|status)" >&2
    exit 1
    ;;
esac
