#!/usr/bin/env bash
# One-time: initialize a brand-new local folder as a git repo and push it to its
# GitHub remote. Use this for the FIRST upload of a repo that doesn't have a .git
# yet (after that, use ./scripts/sync-repo.sh <name> push "msg").
#
# Reads the folder + remote URL from config.sh, so it works for any registered repo.
# Idempotent: safe to re-run (won't re-init, refreshes the remote, only commits if
# there are changes).
#
# Usage:
#   ./scripts/first-push.sh scheduling
#   ./scripts/first-push.sh scheduling "feat: scheduling service skeleton (Phase 2)"

set -euo pipefail
source "$(dirname "$0")/config.sh"

WORK_EMAIL="brendan@langmuirsystems.com"
REPO_NAME="${1:-}"
MESSAGE="${2:-Initial commit}"

if [[ -z "$REPO_NAME" ]]; then
  echo "Usage: $0 <repo-name> [commit-message]" >&2
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

if [[ ! -d "$repo_path" ]]; then
  echo "Folder not found: $repo_path" >&2
  exit 1
fi

cd "$repo_path"
echo "── First push: $REPO_NAME @ $repo_path ──"

# 1. init (only if needed)
if [[ ! -d .git ]]; then
  git init -q
  echo "  initialized git repo"
fi

# 2. attribute commits to the Langmuir work account
git config user.email "$WORK_EMAIL"

# 3. set / refresh the remote to the SSH-alias URL from config.sh
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$url"
else
  git remote add origin "$url"
fi
echo "  remote origin → $url"

# 4. ensure we're on main
git branch -M main

# 5. commit (only if there's something to commit)
git add -A
if [[ -n "$(git status --porcelain)" ]]; then
  git commit -q -m "$MESSAGE"
  echo "  committed: $MESSAGE"
else
  echo "  nothing to commit"
fi

# 6. push and set upstream
git push -u origin main
echo "✓ Pushed $REPO_NAME to $url"
echo "  Railway service '$service' will build/deploy from this repo."
