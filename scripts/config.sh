#!/usr/bin/env bash
# Central config for all sync scripts. Edit this file (or have Claude edit it)
# to register repos and Google Scripts. Everything else reads from here.

# ─── GitHub organization ───────────────────────────────────────────────────────
GH_ORG="${GH_ORG:-langmuirsystems}"

# ─── Transport, resolved per machine ───────────────────────────────────────────
# Remote URLs are stored per clone, so the two machines do NOT have to match.
# What has to be true is that each machine uses the transport it can actually
# authenticate with:
#
#   Director / Windows  → HTTPS. GitHub Desktop and Git Credential Manager do the
#                         login through the browser. Nothing to set up.
#   Brendan / Mac       → the `github-langmuir` SSH alias. Verified 2026-07-31:
#                         the github.com HTTPS credential in his Keychain is a
#                         DIFFERENT account (brf1998-code) with no access to the
#                         org, so plain HTTPS returns 404 on these private repos.
#                         SSH authenticates as BrendanLangmuir and works.
#
# Resolution order, first match wins:
#   1. GIT_BASE already exported in the environment
#   2. scripts/config.local.sh          (gitignored, per-machine override)
#   3. a `github-langmuir` Host block in ~/.ssh/config   → SSH
#   4. otherwise                                          → HTTPS
#
# To force one for a single command:
#   GIT_BASE="https://github.com/$GH_ORG" ./scripts/status.sh

_CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck disable=SC1090
[ -f "$_CONFIG_DIR/config.local.sh" ] && source "$_CONFIG_DIR/config.local.sh"

_has_ssh_alias() {
  [ -f "$HOME/.ssh/config" ] && \
    grep -qiE '^[[:space:]]*Host([[:space:]]+[^[:space:]]+)*[[:space:]]+github-langmuir([[:space:]]|$)' \
      "$HOME/.ssh/config"
}

if [ -n "${GIT_BASE:-}" ]; then
  GIT_TRANSPORT="preset (GIT_BASE was already set)"
elif _has_ssh_alias; then
  GIT_BASE="git@github-langmuir:$GH_ORG"
  GIT_TRANSPORT="ssh via the github-langmuir alias"
else
  GIT_BASE="https://github.com/$GH_ORG"
  GIT_TRANSPORT="https"
fi

# ─── GitHub repos ──────────────────────────────────────────────────────────────
# Format: name|local-folder|github-url|railway-service
# - name: short identifier used on the command line (e.g. ./scripts/push.sh pms)
# - local-folder: path relative to project root
# - github-url: built from GIT_BASE above
# - railway-service: which Railway service redeploys on push

# 2026-07-23 audit: kpi + cyclecount retired (absorbed into pms — see
# SYSTEM-STATE.md); their folders live in _archive/. hub + procurement
# relocated to top level from "Reorder points and stockout indicator".
# 2026-07-30 turnover: repos transferred to the langmuirsystems org.
# 2026-07-31: transport is resolved per machine, not hardcoded to HTTPS.
# 2026-07-31: bom is `Langmuir-bom` on GitHub, capital L. We were pushing to
#   `langmuir-bom` and riding a rename redirect. Do not "fix" the capital.
#   The Railway SERVICE is still lowercase `langmuir-bom`; they differ on purpose.
REPOS=(
  "pms|pms|$GIT_BASE/LangmuirPMS.git|langmuir-pms"
  "pms-test|pms-test|$GIT_BASE/LangmuirPMS_Test.git|langmuir-pms-test"
  "tooling|tooling|$GIT_BASE/langmuir-tooling.git|langmuir-tooling"
  "scheduling|scheduling|$GIT_BASE/LangmuirScheduling.git|langmuir-scheduling"
  "vision|vision|$GIT_BASE/LangmuirVision.git|langmuir-vision"
  "hub|hub|$GIT_BASE/langmuirhub.git|langmuir-hub"
  "procurement|procurement|$GIT_BASE/Langmuir-procurement.git|langmuir-procurement"
  "ci|ci|$GIT_BASE/langmuir-ci.git|langmuir-ci"
  "bom|bom|$GIT_BASE/Langmuir-bom.git|langmuir-bom"
)

# The tenth repo: the workspace root itself. Not in REPOS because it is the
# parent of all the others, but it needs the same URL treatment.
WORKSPACE_REPO="langmuir-workspace"
WORKSPACE_URL="$GIT_BASE/$WORKSPACE_REPO.git"

# ─── Google Scripts (bound or standalone) ──────────────────────────────────────
# Format: name|local-folder|script-id|description
GSCRIPTS=(
  "pms-locations|pms-locations|1YdeeXb6K6zQvxfzxsXIpt6ao_vOE9ppZVplZ43Ej1OHbCK9-rkihmBZU|LIVE inventory ledger — push is immediate, no undo"
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
