# Langmuir System — Ground Truth (verified + reorganized 2026-07-23)

Verified from: git remotes/logs on this machine, module wiring in `pms/server.js`,
live service responses, and design-doc headers. The workspace was reorganized the
same day (audit + archive, approved by Brendan). Update this file when anything
migrates — it exists because the KPI restyle initially landed in the retired
standalone repo.

## The one rule

**`pms/` (repo `langmuirsystems/LangmuirPMS`, service `langmuirproduction.up.railway.app`)
is the center of gravity.** Modules keep migrating INTO it — the KPI board
(2026-07-21) and cycle count both did. Before editing any feature, check whether
pms serves it now. Retired snapshots live in `_archive/` and editing them changes
nothing in production.

## Live services (all top-level folders, one repo each)

| Folder | Repo | Railway service / domain | Notes |
|---|---|---|---|
| `pms/` | LangmuirPMS | langmuir-pms · langmuirproduction.up.railway.app | Operator system: picker, receiving, shipping, diagrams, feedback API, **cycle count** (`/cyclecount`), **KPI board** (`/kpi`), line boards, MCP server. Shop-IP allowlisted. |
| `ci/` | langmuir-ci | langmuir-ci-production.up.railway.app | CI/support-intake boards. Shares pms Postgres + LOCATIONS_URL. Shop-IP allowlisted. |
| `hub/` | langmuirhub | langmuir-hub | Landing portal linking every tool. Cards verified current 2026-07-23 (KPI card → pms `/kpi`, cycle count → pms). |
| `procurement/` | Langmuir-procurement | langmuir-procurement.up.railway.app | **Overhauled 2026-08-07.** Root is now the **Stockout Radar** (live inventory risk board from BAQ `ICM_PurchaseDB_Parts`, spec in `procurement/STOCKOUT_RADAR.md`) plus the **PPV dashboards** (`/ppv.html`, GC_NewPOsPPV2 / GC_InvPPV2, `procurement/PPV_DESIGN.md`). All Epicor data is direct BAQ REST via `EPICOR_*` Railway vars; the old Sheet/Apps-Script hop and the at-risk/recommendations/suppliers/service-level pages are removed. Note: remote uses the personal `github.com` identity, not `github-langmuir`. |
| `vision/` | LangmuirVision | langmuir-vision | Part ID by photo; reads `part_photos` from pms Postgres. |
| `pms-test/` | LangmuirPMS_Test | langmuir-pms-test | Canary for risky deploys, and the home of the **PMS v2 greenfield rebuild** (`PMS_V2_DESIGN.md`). NOT a mirror of pms: last substantive commit 2026-07-06 and well behind. Do not read it to learn how production behaves. |
| `bom/` | langmuir-bom | langmuir-bom (to create) | BOM Manager (2026-07-24): OpenBOM-style working BOMs seeded from Epicor (BF_PartBOM/BF_PartMaster/BF_OpenPOs + optional BF_Suppliers/BF_POReceipts). Working copy + Epicor baseline; `/guide` = team tutorial. Standalone by design (Brendan's call). |

## Still-active Apps Scripts (`google-scripts/`, deploy via `clasp push`)

- `pms-locations` — the **live inventory ledger** (Locations sheet). Cycle count
  reads/writes it at count time; shipping ship-out subtracts through it.

## Retired / archived — in `_archive/` (see `_archive/README.md` for detail)

`kpi/` (→ pms `/kpi`), `cyclecount/` (→ pms `/cyclecount`),
`google-scripts-production-data` (→ pms `/api/kpi`), ShopSabre kit (external
deliverable), `warranty-analysis/` (completed study → shipping module),
`reorder-points-planning/` (planning docs; its live repos moved to `hub/` and
`procurement/`), `analyses/` (one-off reports, all acted on).

**2026-08-07 retirements** (code preserved by archiving the GitHub repos, same
convention as kpi/cyclecount):

- `tooling/` (repo `langmuir-tooling`) + the `tooling-sheet` Apps Script — tooling
  request/queue boards removed from the hub and retired outright.
- `scheduling/` (repo `LangmuirScheduling`) — paused; hub tiles remain, grayed out
  as "Under Development". Its `lib/epicor.js` pattern lives on in `procurement/`
  and `bom/`.

## Other top-level folders

`techsupport/` (Epicor API reference docs), `Apollo First Production Run
Revisions/` (active product drawings), `scripts/` (sync helpers — `config.sh`
is the registry of repos + Apps Scripts, updated 2026-07-23), `_to_delete/`,
plus root reference files (Owners Handbook, logo, TechSupport.pdf,
PROJECT_HANDOFF.md, INVENTORY_DECOUPLING_PLAN.md, MCP_PIPELINE_PLAN.md,
Warranty-Misshipment-BAQ-Guide.docx — the two plans + BAQ guide kept at root
because their work may still be pending).

## Open cleanup items (need Brendan / external systems)

1. Archive the GitHub repos LangmuirProductionKPI + CycleCount (retired); the
   LangmuirProductionKPI working tree also has an uncommitted revert of the
   mistaken restyle — discard or commit before archiving.
2. Confirm the old `langmuir-kpi` and `langmuir-cyclecount` Railway services are
   deleted; wall display → `langmuirproduction.up.railway.app/kpi`.
3. ~~Verify scheduling's `KPI_URL` env var points at pms~~ — moot 2026-08-07,
   scheduling retired/paused.
6. Archive the GitHub repos `langmuir-tooling` + `LangmuirScheduling`, and delete
   the `langmuir-tooling` + `langmuir-scheduling` Railway services (2026-08-07
   retirement).
4. Delete the retired `production-data` Apps Script time-driven triggers in
   script.google.com.
5. `_to_delete/stale-git-locks/` and `_to_delete/issues-superseded-by-ci/` can
   be deleted whenever.
