#!/usr/bin/env bash
# push.sh — standard one-command pull+commit+push for ANY repo registered in
# scripts/config.sh. Keeps the fixes for every snag we've hit:
#   • stale .git/index.lock from an interrupted git process
#   • a commit that was made but never pushed (plain sync-repo skips the push
#     when there's nothing new to commit)
#   • a clone still pointing at the wrong remote/account (re-pins to the
#     config.sh URL every run — idempotent)
#   • 2026-07-31: TWO PEOPLE push these repos now, so the remote can be ahead of
#     this clone. This script pulls --rebase before it pushes, and STOPS on a
#     conflict rather than pushing something half-resolved.
#
# Usage:
#   ./scripts/push.sh pms "feat: shipping activity history filters"
#   ./scripts/push.sh pms          # default message: "chore: update pms"
#   ./scripts/push.sh              # lists registered repos
set -uo pipefail
source "$(dirname "$0")/config.sh"

REPO_NAME="${1:-}"
MSG="${2:-chore: update ${REPO_NAME:-repo}}"

if [[ -z "$REPO_NAME" ]]; then
  echo "Usage: $0 <repo-name> [commit-message]" >&2
  echo "Registered repos:" >&2
  for entry in "${REPOS[@]}"; do
    IFS='|' read -r name _ _ svc <<< "$entry"
    echo "  - $name  (Railway: $svc)" >&2
  done
  exit 1
fi

info=$(find_repo "$REPO_NAME") || { echo "✗ Unknown repo: $REPO_NAME — run ./scripts/push.sh with no args to list them"; exit 1; }
IFS='|' read -r folder url service <<< "$info"
repo_path="$PROJECT_ROOT/$folder"

cd "$repo_path" 2>/dev/null || { echo "✗ No folder at $repo_path"; exit 1; }
[[ -d .git ]] || { echo "✗ Not a git clone — run ./scripts/bootstrap.sh first."; exit 1; }

# Pin the remote from config.sh (idempotent — fixes clones on the wrong account
# or still on the pre-org owner path). config.sh picks the transport this machine
# can authenticate with, so this is safe on both the Mac and Windows.
git remote set-url origin "$url"

# Clear a stale lock left behind by an interrupted git process.
[[ -f .git/index.lock ]] && { echo "• clearing stale .git/index.lock"; rm -f .git/index.lock; }

branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)"
if [[ -z "$branch" ]]; then
  echo "✗ $REPO_NAME is on a detached HEAD or has no commits yet. Not pushing."
  exit 1
fi

# Commit local work FIRST, so the tree is clean and the rebase in the next step
# replays this commit on top of whatever the other person pushed.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "• changes:"
  git status --short
  git add -A
  git commit -m "$MSG" && echo "• committed: $MSG"
else
  echo "• nothing new to commit"
fi

# Pull before push. This is the whole point of the change.
echo "• pulling $branch from origin first…"
if ! git pull --rebase origin "$branch"; then
  echo ""
  echo "✗ pull --rebase hit a conflict in $REPO_NAME. NOTHING was pushed."
  echo "  Your commit is safe on disk. To finish:"
  echo "      cd \"$repo_path\""
  echo "      git status                      # the conflicted files"
  echo "      # edit them, then:"
  echo "      git add -A && git rebase --continue"
  echo "      ./scripts/push.sh $REPO_NAME"
  echo "  Or back all the way out:  git rebase --abort"
  exit 1
fi

# Always push — covers the committed-but-never-pushed case. `-u origin HEAD`
# also sets the upstream if the branch never had one (idempotent otherwise).
echo "• pushing…"
if git push -u origin HEAD; then
  echo "✓ $REPO_NAME pushed — Railway will redeploy '$service'."
  echo "  (If nothing deploys, the Railway GitHub App is not authorized on"
  echo "   $GH_ORG yet. See docs/GITHUB-ORG-TRANSFER.md.)"
else
  echo "✗ push failed (see the message above)."
  echo "  Publickey error? Load the work key: ssh-add --apple-use-keychain ~/.ssh/id_ed25519_langmuir"
  echo "  404 over HTTPS? Your github.com credential is the wrong account —"
  echo "  this Mac's Keychain holds brf1998-code, which has no org access."
  exit 1
fi
