#!/usr/bin/env bash
# pull-all.sh — refresh every repo in the workspace, including the workspace
# root itself. Run this before you start work, every time.
#
#   ./scripts/pull-all.sh              # pull everything that is clean
#   ./scripts/pull-all.sh pms ci       # only these
#   ./scripts/pull-all.sh --check      # report only, pull nothing
#   ./scripts/pull-all.sh --autostash  # stash local edits, pull, put them back
#
# A repo with uncommitted changes is SKIPPED by default rather than rebased
# over. Commit or stash it, or re-run with --autostash.
#
# Works in Terminal on macOS and in Git Bash on Windows.

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1090
source "$SCRIPT_DIR/config.sh"
ROOT="$PROJECT_ROOT"

CHECK=0; AUTOSTASH=0; ONLY=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)     CHECK=1; shift ;;
    --autostash) AUTOSTASH=1; shift ;;
    -h|--help)   sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)          echo "Unknown option: $1"; exit 2 ;;
    *)           ONLY+=("$1"); shift ;;
  esac
done

wanted() {
  [ ${#ONLY[@]} -eq 0 ] && return 0
  local n="$1"; for o in "${ONLY[@]}"; do [ "$o" = "$n" ] && return 0; done; return 1
}

PULLED=0; SKIPPED=0; FAILED=0; MISSING=0

pull_one() {
  local name="$1" path="$2"

  if [ ! -d "$path/.git" ]; then
    printf '  %-14s not cloned — run ./scripts/bootstrap.sh\n' "$name"
    MISSING=$((MISSING + 1)); return
  fi

  # symbolic-ref --quiet prints NOTHING and exits non-zero when HEAD is detached
  # or unborn. rev-parse --abbrev-ref would print the literal word "HEAD" there,
  # and `|| echo ?` would then append a second line, producing an invalid refspec.
  local branch dirty
  branch="$(git -C "$path" symbolic-ref --quiet --short HEAD 2>/dev/null)"
  if [ -z "$branch" ]; then
    printf '  %-14s SKIPPED — detached HEAD or no commits yet\n' "$name"
    SKIPPED=$((SKIPPED + 1)); return
  fi
  dirty="$(git -C "$path" status --porcelain 2>/dev/null | head -1)"

  if [ -n "$dirty" ] && [ $AUTOSTASH -eq 0 ]; then
    local n; n="$(git -C "$path" status --porcelain | wc -l | tr -d ' ')"
    printf '  %-14s SKIPPED — %s uncommitted change(s) on %s\n' "$name" "$n" "$branch"
    SKIPPED=$((SKIPPED + 1)); return
  fi

  if [ $CHECK -eq 1 ]; then
    git -C "$path" fetch -q origin 2>/dev/null
    local behind
    behind="$(git -C "$path" rev-list --count "HEAD..origin/$branch" 2>/dev/null || echo 0)"
    if [ "${behind:-0}" = "0" ]; then
      printf '  %-14s up to date (%s)\n' "$name" "$branch"
    else
      printf '  %-14s %s commit(s) behind on %s\n' "$name" "$behind" "$branch"
    fi
    return
  fi

  local out
  if [ $AUTOSTASH -eq 1 ]; then
    out="$(git -C "$path" pull --rebase --autostash origin "$branch" 2>&1)"
  else
    out="$(git -C "$path" pull --rebase origin "$branch" 2>&1)"
  fi

  if [ $? -eq 0 ]; then
    if printf '%s' "$out" | grep -q 'Already up to date'; then
      printf '  %-14s up to date\n' "$name"
    else
      printf '  %-14s ✓ updated\n' "$name"
    fi
    PULLED=$((PULLED + 1))
  else
    printf '  %-14s ✗ FAILED\n' "$name"
    printf '%s\n' "$out" | sed 's/^/                   /' | head -6
    FAILED=$((FAILED + 1))
  fi
}

echo "────────────────────────────────────────────────────────────"
echo "  Pulling from $GH_ORG"
[ $CHECK -eq 1 ]     && echo "  CHECK ONLY — nothing will be changed"
[ $AUTOSTASH -eq 1 ] && echo "  --autostash: local edits are stashed and reapplied"
echo "────────────────────────────────────────────────────────────"
echo

# The workspace root itself, first. It carries the docs and these scripts, so
# a stale copy here is how you end up following out-of-date instructions.
if wanted workspace; then pull_one "workspace" "$ROOT"; fi

for entry in "${REPOS[@]}"; do
  IFS='|' read -r name folder url service <<< "$entry"
  wanted "$name" || continue
  pull_one "$name" "$ROOT/$folder"
done

echo
echo "────────────────────────────────────────────────────────────"
if [ $CHECK -eq 1 ]; then
  echo "  Check complete. Re-run without --check to pull."
else
  echo "  $PULLED pulled · $SKIPPED skipped · $FAILED failed · $MISSING not cloned"
  [ $SKIPPED -gt 0 ] && echo "  Skipped repos: the reason is on each line above. Uncommitted work?"
  [ $SKIPPED -gt 0 ] && echo "  Commit it in GitHub Desktop, or re-run with --autostash."
  [ $MISSING -gt 0 ] && echo "  Missing repos: ./scripts/bootstrap.sh"
fi
echo "────────────────────────────────────────────────────────────"

[ $FAILED -gt 0 ] && exit 1
exit 0
