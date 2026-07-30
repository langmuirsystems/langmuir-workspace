#!/usr/bin/env bash
# One-time setup: clone GitHub repos and Google Scripts based on config.sh.
# Re-running this is safe — it skips anything already cloned.
#
# Usage: ./scripts/bootstrap.sh

set -uo pipefail
source "$(dirname "$0")/config.sh"

echo "── Bootstrapping GitHub repos ────────────────────────────────"
for entry in "${REPOS[@]}"; do
  IFS='|' read -r name folder url service <<< "$entry"
  path="$PROJECT_ROOT/$folder"
  if [[ "$url" == REPLACE_WITH* ]]; then
    echo "⚠ $name: URL not set in config.sh, skipping"
    continue
  fi
  if [[ -d "$path/.git" ]]; then
    echo "✓ $name already cloned at $path"
    continue
  fi
  echo "→ Cloning $name from $url..."
  git clone "$url" "$path"
done

echo
echo "── Bootstrapping Google Scripts ──────────────────────────────"
if ! command -v clasp >/dev/null 2>&1; then
  echo "⚠ clasp not installed. Install with: npm install -g @google/clasp"
  echo "  Then run: clasp login"
  exit 0
fi

for entry in "${GSCRIPTS[@]}"; do
  IFS='|' read -r name folder id desc <<< "$entry"
  path="$PROJECT_ROOT/google-scripts/$folder"
  if [[ "$id" == REPLACE_WITH* ]] || [[ -z "$id" ]]; then
    echo "⚠ $name: script ID not set, skipping"
    continue
  fi
  if [[ -d "$path" ]]; then
    echo "✓ $name already cloned at $path"
    continue
  fi
  echo "→ Cloning $name (id: $id)..."
  mkdir -p "$path"
  ( cd "$path" && clasp clone "$id" )
done

echo
echo "Done. Run ./scripts/status.sh to see what's tracked."
