#!/usr/bin/env bash
# Pull or push a single Google Script via clasp.
#
# Usage:
#   ./scripts/sync-gscript.sh production-tracker pull
#   ./scripts/sync-gscript.sh production-tracker push
#   ./scripts/sync-gscript.sh production-tracker status

set -euo pipefail
source "$(dirname "$0")/config.sh"

SCRIPT_NAME="${1:-}"
ACTION="${2:-status}"

if [[ -z "$SCRIPT_NAME" ]]; then
  echo "Usage: $0 <script-name> <pull|push|status>" >&2
  echo "Available scripts:" >&2
  for entry in "${GSCRIPTS[@]}"; do
    IFS='|' read -r name _ _ _ <<< "$entry"
    echo "  - $name" >&2
  done
  exit 1
fi

if ! command -v clasp >/dev/null 2>&1; then
  echo "clasp not installed. Run: npm install -g @google/clasp" >&2
  exit 1
fi

info=$(find_gscript "$SCRIPT_NAME") || { echo "Unknown script: $SCRIPT_NAME" >&2; exit 1; }
IFS='|' read -r folder id desc <<< "$info"
script_path="$PROJECT_ROOT/google-scripts/$folder"

if [[ ! -d "$script_path" ]]; then
  echo "No local folder at $script_path. Run: cd google-scripts && clasp clone $id $folder" >&2
  exit 1
fi

cd "$script_path"

case "$ACTION" in
  status)
    echo "── $SCRIPT_NAME ($desc) ─────────────────"
    echo "Path: $script_path"
    echo "Script ID: $id"
    clasp status 2>&1 | head -20
    ;;
  pull)
    echo "Pulling $SCRIPT_NAME from Apps Script..."
    clasp pull
    ;;
  push)
    echo "Pushing $SCRIPT_NAME to Apps Script..."
    clasp push
    echo "✓ Pushed $SCRIPT_NAME"
    ;;
  *)
    echo "Unknown action: $ACTION (use pull|push|status)" >&2
    exit 1
    ;;
esac
