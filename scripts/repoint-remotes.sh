#!/usr/bin/env bash
# Rewrite every clone's `origin` to match what config.sh says it should be.
#
# Use this after transferring the repos into the GitHub org, to move off the
# `github-langmuir` SSH host alias (which only exists in Brendan's ~/.ssh/config
# and resolves to nothing on any other machine).
#
# Usage:
#   ./scripts/repoint-remotes.sh          # dry run, shows what would change
#   ./scripts/repoint-remotes.sh --apply  # actually rewrite

set -uo pipefail
source "$(dirname "$0")/config.sh"

APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

# Guard against being run against the pre-turnover config.sh, which has no GH_ORG
# and still holds the `github-langmuir` SSH alias URLs.
if [[ -z "${GH_ORG:-}" ]]; then
  echo "GH_ORG is not set in scripts/config.sh."
  echo "Swap in scripts/config.sh.new and fill in the org slug first (Phase 3)."
  exit 1
fi

[[ $APPLY -eq 0 ]] && echo "DRY RUN. Re-run with --apply to make changes." && echo

changed=0
for entry in "${REPOS[@]}"; do
  IFS='|' read -r name folder url service <<< "$entry"
  path="$PROJECT_ROOT/$folder"

  if [[ ! -d "$path/.git" ]]; then
    printf "%-12s not cloned at %s, skipping\n" "$name" "$path"
    continue
  fi

  current="$(git -C "$path" remote get-url origin 2>/dev/null || echo "")"

  if [[ -z "$current" ]]; then
    printf "%-12s has no origin remote\n" "$name"
    continue
  fi

  if [[ "$current" == "$url" ]]; then
    printf "%-12s ✓ already %s\n" "$name" "$url"
    continue
  fi

  printf "%-12s %s\n" "$name" "$current"
  printf "%-12s      →  %s\n" "" "$url"
  changed=$((changed + 1))

  if [[ $APPLY -eq 1 ]]; then
    git -C "$path" remote set-url origin "$url"
    echo "             applied"
  fi
done

echo
if [[ $changed -eq 0 ]]; then
  echo "Nothing to change."
elif [[ $APPLY -eq 0 ]]; then
  echo "$changed repo(s) would change. Re-run with --apply."
else
  echo "$changed repo(s) updated."
  echo
  echo "Verify each one still talks to GitHub:"
  echo "  ./scripts/status.sh"
fi
