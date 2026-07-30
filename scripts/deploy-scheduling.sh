#!/usr/bin/env bash
# One-command deploy for the scheduling / MRP service.
# Pushes the Node service (Railway auto-builds on push) and the pms-locations Apps
# Script (machine→line map in doGet), then prints the manual follow-up steps that
# can't be done from the terminal (Apps Script versioning, Railway env, migration).
#
# Usage:  ./scripts/deploy-scheduling.sh "feat: MRP direct-sync + auto-plan"

set -uo pipefail
cd "$(dirname "$0")/.."
MSG="${1:-deploy: scheduling/MRP update}"

echo "════════════════════════════════════════════════════════════"
echo " 1/2  Pushing the scheduling service (Railway redeploys on push)"
echo "════════════════════════════════════════════════════════════"
./scripts/sync-repo.sh scheduling push "$MSG"

echo ""
echo "════════════════════════════════════════════════════════════"
echo " 2/2  Pushing pms-locations Apps Script (machineMap in doGet)"
echo "════════════════════════════════════════════════════════════"
./scripts/sync-gscript.sh pms-locations push

cat <<'NEXT'

════════════════════════════════════════════════════════════
 MANUAL STEPS (can't be done from the terminal)
════════════════════════════════════════════════════════════

A) Apps Script — publish a NEW web-app version so the new doGet is served:
     script.google.com → open "LangmuirPMS_locations"
     Deploy → Manage deployments → (pencil/Edit) → Version: New version → Deploy

B) Railway → the scheduling service → Variables — set/confirm:
     DATABASE_URL      (auto from the attached Postgres)
     ALLOWED_IPS       your shop's public IP
     MANAGER_PIN       admin PIN
     LOCATIONS_URL     pms-locations doGet URL (machine map + line inventory)
     KPI_URL           production-data doGet URL (FG shipments → demand rate; without it the board plans nothing)
     PMS_LINE_URL      deployed PMS line.html (inventory-request link)
     EPICOR_HOST       https://centralusdtapp38.epicorsaas.com/SaaS886
     EPICOR_COMPANY    159674
     EPICOR_USER       (Epicor API user)
     EPICOR_PASS       (Epicor API password)
     EPICOR_API_KEY    (Epicor API key)
     EPICOR_BAQS       BF_FGOnHandInventory,BF_DailyProduction   (add new BAQs here as built)

C) DB migration — automatic. The service applies db/schema.sql on every boot
   (idempotent), so schema changes go live with the deploy. No manual step.

D) Verify:
     open  https://<scheduling-service>/healthz          → sheets.skusFromMap > 0, epicor.configured true
     open  https://<scheduling-service>/api/epicor-status → row counts per BAQ
     open  https://<scheduling-service>/admin.html        → Run engine now

NEXT
echo "Done pushing. Complete steps A–D above to finish the deploy."
