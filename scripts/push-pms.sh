#!/usr/bin/env bash
# push-pms.sh — one-command push for the PMS repo.
# Handles the snags we've hit:
#   • a stale .git/index.lock from an interrupted git process
#   • a commit that was made but never pushed (plain sync-repo skips the push then)
#   • the work-account remote (github-langmuir alias, not the personal/school key)
#
# Usage:
#   ./scripts/push-pms.sh "feat: my change"
#   ./scripts/push-pms.sh                      # uses a default commit message
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$ROOT/pms"
MSG="${1:-chore: update PMS}"

cd "$REPO" 2>/dev/null || { echo "✗ No pms repo at $REPO"; exit 1; }

# Point at the Langmuir work account (idempotent — safe to set every time).
git remote set-url origin git@github-langmuir:BrendanLangmuir/LangmuirPMS.git

# Clear a stale lock left behind by an interrupted git process.
[[ -f .git/index.lock ]] && { echo "• clearing stale .git/index.lock"; rm -f .git/index.lock; }

# Commit only if there's something to commit.
if [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  git commit -m "$MSG" && echo "• committed: $MSG"
else
  echo "• nothing new to commit"
fi

# Always push — this is the step plain sync-repo skips when there's nothing to commit.
echo "• pushing…"
if git push; then
  echo "✓ PMS pushed — Railway will redeploy langmuir-pms (the server restarts)."
else
  echo "✗ push failed (see the message above)."
  echo "  If it's 'Permission denied (publickey)', load your work key: ssh-add --apple-use-keychain ~/.ssh/id_ed25519_langmuir"
  exit 1
fi
