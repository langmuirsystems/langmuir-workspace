#!/usr/bin/env bash
# Show pending changes across every repo and Google Script in this workspace.
#
# Usage: ./scripts/status.sh

set -uo pipefail
source "$(dirname "$0")/config.sh"

echo "════════════════════════════════════════════════════════════════"
echo "  Langmuir Production Management — status"
echo "════════════════════════════════════════════════════════════════"

echo
echo "GitHub repos:"
for entry in "${REPOS[@]}"; do
  IFS='|' read -r name folder url service <<< "$entry"
  path="$PROJECT_ROOT/$folder"
  echo
  echo "  ▸ $name  ($folder → $service)"
  if [[ ! -d "$path/.git" ]]; then
    echo "    ⚠ not cloned yet"
    continue
  fi
  ( cd "$path" && git status --short --branch | sed 's/^/    /' )
done

echo
echo "Google Scripts:"
if [[ ${#GSCRIPTS[@]} -eq 0 ]]; then
  echo "  (none registered yet — add entries to scripts/config.sh)"
else
  for entry in "${GSCRIPTS[@]}"; do
    IFS='|' read -r name folder id desc <<< "$entry"
    path="$PROJECT_ROOT/google-scripts/$folder"
    echo
    echo "  ▸ $name — $desc"
    if [[ ! -d "$path" ]]; then
      echo "    ⚠ not cloned yet"
      continue
    fi
    if command -v clasp >/dev/null 2>&1; then
      ( cd "$path" && clasp status 2>&1 | head -5 | sed 's/^/    /' )
    else
      echo "    ⚠ clasp not installed"
    fi
  done
fi

echo
echo "════════════════════════════════════════════════════════════════"
