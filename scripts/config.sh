#!/usr/bin/env bash
# Central config for all sync scripts. Edit this file (or have Claude edit it)
# to register repos and Google Scripts. Everything else reads from here.

# ─── GitHub repos ──────────────────────────────────────────────────────────────
# Format: name|local-folder|github-url|railway-service
# - name: short identifier used on the command line (e.g. ./scripts/sync-repo.sh pms)
# - local-folder: path relative to project root
# - github-url: clone URL — work repos use the `github-langmuir` SSH alias
#   (defined in ~/.ssh/config) so they authenticate as the Langmuir work account,
#   not the default github.com identity.
# - railway-service: which Railway service restarts on push (informational only)

# 2026-07-23 audit: kpi + cyclecount retired (absorbed into pms — see
# SYSTEM-STATE.md); their folders live in _archive/. hub + procurement
# relocated to top level from "Reorder points and stockout indicator".
REPOS=(
  "pms|pms|git@github-langmuir:BrendanLangmuir/LangmuirPMS.git|langmuir-pms"
  "pms-test|pms-test|git@github-langmuir:BrendanLangmuir/LangmuirPMS_Test.git|langmuir-pms-test"
  "tooling|tooling|git@github-langmuir:BrendanLangmuir/langmuir-tooling.git|langmuir-tooling"
  "scheduling|scheduling|git@github-langmuir:BrendanLangmuir/LangmuirScheduling.git|langmuir-scheduling"
  "vision|vision|git@github-langmuir:BrendanLangmuir/LangmuirVision.git|langmuir-vision"
  "hub|hub|git@github-langmuir:BrendanLangmuir/langmuirhub.git|langmuir-hub"
  "procurement|procurement|https://github.com/BrendanLangmuir/Langmuir-procurement.git|langmuir-procurement"
  "ci|ci|git@github-langmuir:BrendanLangmuir/langmuir-ci.git|langmuir-ci"
  "bom|bom|git@github-langmuir:BrendanLangmuir/langmuir-bom.git|langmuir-bom"
)

# ─── Google Scripts (bound or standalone) ──────────────────────────────────────
# Format: name|local-folder|script-id|description
# - name: short identifier (e.g. ./scripts/sync-gscript.sh production-tracker)
# - local-folder: path inside google-scripts/
# - script-id: from script.google.com → Project Settings → Script ID
# - description: free text, shown in status output

# production-data removed 2026-07-23: retired by the KPI → pms migration
# (folder in _archive/google-scripts-production-data; delete its triggers
# in script.google.com if still installed).
GSCRIPTS=(
  "pms-locations|pms-locations|1YdeeXb6K6zQvxfzxsXIpt6ao_vOE9ppZVplZ43Ej1OHbCK9-rkihmBZU|LangmuirPMS_locations script"
  "tooling-sheet|tooling-sheet|1r9cl4BUhudEGmkmZbLoXsBd8bHLg6p6EhxbxcnUP1nWwjd-7GZBntla9|Backend for langmuir-tooling request board"
)

# ─── Lookup helpers ────────────────────────────────────────────────────────────
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

find_repo() {
  local target="$1"
  for entry in "${REPOS[@]}"; do
    IFS='|' read -r name folder url service <<< "$entry"
    if [[ "$name" == "$target" ]]; then
      echo "$folder|$url|$service"
      return 0
    fi
  done
  return 1
}

find_gscript() {
  local target="$1"
  for entry in "${GSCRIPTS[@]}"; do
    IFS='|' read -r name folder id desc <<< "$entry"
    if [[ "$name" == "$target" ]]; then
      echo "$folder|$id|$desc"
      return 0
    fi
  done
  return 1
}
