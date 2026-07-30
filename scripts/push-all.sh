#!/usr/bin/env bash
# push-all.sh — commit + push every repo registered in config.sh that has work
# pending, in one pass. The actual git work is delegated to push.sh, so every
# fix that lives there applies here too: stale .git/index.lock, a clone pointed
# at the wrong remote, a commit made but never pushed, a branch with no upstream.
#
# Usage:
#   ./scripts/push-all.sh -n                             # dry run — show what would push
#   ./scripts/push-all.sh -m "fix: langmuir torch mark"  # confirm each repo (default)
#   ./scripts/push-all.sh -y -m "fix: torch mark"        # no prompts, just go
#   ./scripts/push-all.sh -m "fix: torch mark" pms hub   # only these repos
#
# CAUTION: each repo is committed with `git add -A`, so EVERYTHING dirty in that
# repo goes into one commit under your message. Run -n first. If a repo has
# unrelated work in flight, push it on its own:
#   ./scripts/push.sh <repo> "its own message"
set -uo pipefail
source "$(dirname "$0")/config.sh"
PUSH_ONE="$(dirname "$0")/push.sh"

DRY=0; YES=0; MSG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--dry-run) DRY=1; shift ;;
    -y|--yes)     YES=1; shift ;;
    -m|--message) MSG="${2:-}"; shift 2 ;;
    -h|--help)    sed -n '2,16p' "$0"; exit 0 ;;
    --)           shift; break ;;
    -*)           echo "Unknown option: $1  (try -h)" >&2; exit 1 ;;
    *)            break ;;
  esac
done
TARGETS=("$@")

if (( DRY == 0 )) && [[ -z "$MSG" ]]; then
  echo "✗ A commit message is required: -m \"your message\"   (or use -n for a dry run)" >&2
  exit 1
fi

wanted() {  # no targets given → every repo
  (( ${#TARGETS[@]} == 0 )) && return 0
  local n; for n in "${TARGETS[@]}"; do [[ "$n" == "$1" ]] && return 0; done
  return 1
}

PENDING=(); CLEAN=(); MISSING=()

echo "════════════════════════════════════════════════════════════════"
echo "  Pending work across the workspace"
echo "════════════════════════════════════════════════════════════════"

for entry in "${REPOS[@]}"; do
  IFS='|' read -r name folder url service <<< "$entry"
  wanted "$name" || continue
  path="$PROJECT_ROOT/$folder"

  if [[ ! -d "$path/.git" ]]; then MISSING+=("$name"); continue; fi

  dirty=$(cd "$path" && git --no-optional-locks status --porcelain | wc -l | tr -d ' ')
  if upstream=$(cd "$path" && git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null); then
    ahead=$(cd "$path" && git rev-list --count "$upstream"..HEAD 2>/dev/null || echo 0)
  else
    upstream="(no upstream)"; ahead="?"
  fi

  if [[ "$dirty" == "0" && "$ahead" == "0" ]]; then CLEAN+=("$name"); continue; fi

  PENDING+=("$name|$folder|$service")
  echo
  echo "  ▸ $name → Railway: $service"
  echo "    $dirty uncommitted file(s), $ahead unpushed commit(s)  [$upstream]"
  (cd "$path" && git --no-optional-locks status --short | head -12 | sed 's/^/      /')
  extra=$(( dirty > 12 ? dirty - 12 : 0 ))
  (( extra > 0 )) && echo "      … and $extra more file(s)"
done

echo
(( ${#CLEAN[@]}   > 0 )) && echo "  clean, nothing to do: ${CLEAN[*]}"
(( ${#MISSING[@]} > 0 )) && echo "  ⚠ not cloned: ${MISSING[*]}  (run ./scripts/bootstrap.sh)"

if (( ${#PENDING[@]} == 0 )); then
  echo
  echo "✓ Everything is already pushed."
  exit 0
fi

if (( DRY == 1 )); then
  echo
  echo "Dry run — nothing was committed or pushed."
  echo "Ready when you are:  ./scripts/push-all.sh -m \"your message\""
  exit 0
fi

echo
echo "════════════════════════════════════════════════════════════════"
echo "  Pushing with message: $MSG"
echo "════════════════════════════════════════════════════════════════"

PUSHED=(); SKIPPED=(); FAILED=()
for row in "${PENDING[@]}"; do
  IFS='|' read -r name folder service <<< "$row"
  echo
  echo "── $name ───────────────────────────────────────"

  if (( YES == 0 )); then
    if [[ ! -r /dev/tty ]]; then
      echo "  (non-interactive shell — skipping; pass -y to push without prompts)"
      SKIPPED+=("$name"); continue
    fi
    read -r -p "  push $name? [y]es / [n]o / [a]ll remaining / [q]uit: " ans < /dev/tty
    case "${ans:-n}" in
      y|Y) ;;
      a|A) YES=1 ;;
      q|Q) echo "  stopping here."; break ;;
      *)   echo "  skipped."; SKIPPED+=("$name"); continue ;;
    esac
  fi

  if "$PUSH_ONE" "$name" "$MSG"; then PUSHED+=("$name"); else FAILED+=("$name"); fi
done

echo
echo "════════════════════════════════════════════════════════════════"
(( ${#PUSHED[@]}  > 0 )) && echo "  ✓ pushed:  ${PUSHED[*]}"
(( ${#SKIPPED[@]} > 0 )) && echo "  – skipped: ${SKIPPED[*]}"
(( ${#FAILED[@]}  > 0 )) && echo "  ✗ failed:  ${FAILED[*]}"
echo "════════════════════════════════════════════════════════════════"

if (( ${#FAILED[@]} > 0 )); then
  echo
  echo "For a failed repo, try:"
  echo "  cd \"$PROJECT_ROOT/<folder>\" && git pull --rebase && cd - >/dev/null"
  echo "  ./scripts/push.sh <repo> \"$MSG\""
  echo "Publickey error? Load the work key:"
  echo "  ssh-add --apple-use-keychain ~/.ssh/id_ed25519_langmuir"
  exit 1
fi
