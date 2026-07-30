#!/usr/bin/env bash
# One-command Railway env setup for the scheduling / MRP service.
#
# Sets the Epicor variables (and EPICOR_BAQS) on the Railway service, then runs
# the DB migration. Railway auto-redeploys when variables change, so after this
# finishes the direct Epicor→Postgres sync is live.
#
# Secrets are read from scheduling/.env.epicor (gitignored, never committed).
# First run: the script prompts for them and writes that file for next time.
# The same three values live in the production-data Apps Script:
#   script.google.com → production-data → Project Settings → Script Properties
#   (EPICOR_USERNAME, EPICOR_PASSWORD, EPICOR_API_KEY)
#
# Prereq (one-time): npm i -g @railway/cli && railway login
#   then from scheduling/: railway link   (pick the langmuir-scheduling service)
#
# Usage:  ./scripts/set-scheduling-env.sh

set -euo pipefail
cd "$(dirname "$0")/../scheduling"

ENVFILE=".env.epicor"

# Non-secret constants (same as the production-data Apps Script uses).
EPICOR_HOST="https://centralusdtapp38.epicorsaas.com/SaaS886"
EPICOR_COMPANY="159674"
# Add new BAQ names here as they're built — that's the whole "wiring" step.
EPICOR_BAQS="BF_FGOnHandInventory,BF_DailyProduction,BF_PartBOM,BF_OpenPOs,BF_LaborStandards,BF_PartMaster"

# --- load or collect secrets ---
if [[ -f "$ENVFILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENVFILE"
else
  echo "No $ENVFILE found — enter the Epicor credentials (stored locally, gitignored)."
  echo "They're the same values as the production-data Apps Script's Script Properties."
  read -r -p  "EPICOR_USER (Apps Script EPICOR_USERNAME): " EPICOR_USER
  read -r -s -p "EPICOR_PASS (Apps Script EPICOR_PASSWORD): " EPICOR_PASS; echo
  read -r -s -p "EPICOR_API_KEY: " EPICOR_API_KEY; echo
  printf 'EPICOR_USER=%q\nEPICOR_PASS=%q\nEPICOR_API_KEY=%q\n' \
    "$EPICOR_USER" "$EPICOR_PASS" "$EPICOR_API_KEY" > "$ENVFILE"
  chmod 600 "$ENVFILE"
  echo "Saved to scheduling/$ENVFILE (gitignored)."
fi

: "${EPICOR_USER:?missing}"; : "${EPICOR_PASS:?missing}"; : "${EPICOR_API_KEY:?missing}"

# Masked readback so typos/truncation are visible without exposing the secret:
# shows length + first and last 2 characters of each value.
mask() { local v="$1"; local n=${#v}; if (( n <= 5 )); then echo "(len $n)"; else echo "${v:0:2}…${v: -2} (len $n)"; fi; }
echo "Using credentials:"
echo "  EPICOR_USER    = $EPICOR_USER"
echo "  EPICOR_PASS    = $(mask "$EPICOR_PASS")"
echo "  EPICOR_API_KEY = $(mask "$EPICOR_API_KEY")"
echo "Compare against script.google.com → production-data → Project Settings → Script Properties."

# --- verify the credentials against Epicor BEFORE touching Railway ---
echo "Verifying credentials against Epicor (BF_DailyProduction)..."
AUTH=$(printf '%s:%s' "$EPICOR_USER" "$EPICOR_PASS" | base64)
HTTP_CODE=$(curl -s -o /tmp/epicor_check.json -w '%{http_code}' \
  -H "Authorization: Basic $AUTH" -H "X-API-Key: $EPICOR_API_KEY" -H "Accept: application/json" \
  "$EPICOR_HOST/api/v2/odata/$EPICOR_COMPANY/BaqSvc/BF_DailyProduction/Data")
if [[ "$HTTP_CODE" == "200" ]]; then
  ROWS=$(node -e 'const d=require("/tmp/epicor_check.json");console.log(Array.isArray(d.value)?d.value.length:0)' 2>/dev/null || echo "?")
  echo "✓ Credentials OK — BF_DailyProduction returned $ROWS rows."
else
  echo "✗ Credential check FAILED (HTTP $HTTP_CODE)."
  [[ "$HTTP_CODE" == "401" ]] && echo "  401 = bad username/password or API key."
  echo "  Fix: rm scheduling/.env.epicor and re-run this script to re-enter them."
  echo "  (Correct values: script.google.com → production-data → Project Settings → Script Properties)"
  exit 1
fi

# --- make sure this directory is linked to the Railway project/service ---
if ! railway status >/dev/null 2>&1; then
  echo "Not linked to a Railway project yet — opening the picker."
  echo "Choose the langmuir-scheduling project + service."
  railway link
fi
echo "Linked target (variables will be set HERE — must be the scheduling service, not Postgres):"
railway status

# --- push to Railway (one call; setting variables triggers a redeploy) ---
echo "Setting variables on the linked Railway service..."
railway variables \
  --set "EPICOR_HOST=$EPICOR_HOST" \
  --set "EPICOR_COMPANY=$EPICOR_COMPANY" \
  --set "EPICOR_USER=$EPICOR_USER" \
  --set "EPICOR_PASS=$EPICOR_PASS" \
  --set "EPICOR_API_KEY=$EPICOR_API_KEY" \
  --set "EPICOR_BAQS=$EPICOR_BAQS"

cat <<'DONE'

Done. Railway is redeploying with the new variables.
(DB migration runs automatically on boot — no manual step.)
Verify in ~2 minutes:
  /healthz            → epicor.configured: true
  /api/epicor-status  → row counts > 0 per BAQ
Then admin.html → "Run engine now".

To add a future BAQ: edit EPICOR_BAQS at the top of this script and re-run it.
DONE
