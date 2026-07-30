# Langmuir MRP — Project Handoff & Assessment

**For:** an incoming Cowork agent picking up this project.
**From:** the working session that built the scheduling → MRP service.
**Date:** 2026-06-29.

---

## 0. Your mandate (read this first)

You're taking over an in-flight build that is turning Langmuir's production scheduling
into a **lean, in-house MRP**. Two things are expected of you:

1. **Master the system and the objective before touching code.** Read the docs in §9,
   explore the service in `scheduling/`, and load the persistent memory. Don't optimize
   locally — understand how demand, production, inventory, and supply flow end-to-end and
   what Brendan is actually trying to achieve (§1).
2. **Drive the BAQ program.** The single biggest lever right now is getting the right
   **Epicor BAQs** built and flowing into the system. Brendan is candid that he's *not* a
   BAQ expert — so you own the "best way to build these": understand Epicor's data model,
   spec each query precisely, guide him step by step, validate against real sample rows,
   and wire the results into the planning engine. §6 is the center of gravity.

Bias everything toward: **Epicor as the single source of truth**, the MRP as an
**advisory brain** (recommends, doesn't write back in v1), and **turnover-readiness** —
this is handed to a non-developer floor manager, and the intern leaves ~Aug 2026. Simple,
self-sustaining, explainable beats clever.

---

## 1. Objective

**North star:** a lean MRP that reads Epicor + Shopify, computes *what to build and buy,
in what quantity, by when*, against on-hand, on-order, and capacity — and shows it clearly.

Sub-objectives, in priority:
- **Production planning (built):** per-line daily build plan, demand-driven Kanban
  replenishment, Black Friday build-ahead, 80%-efficiency capacity cap, component
  bottleneck visibility.
- **Full auto:** reorder points, batch sizes, and BF targets are **computed from data**,
  never hand-entered (demand rate × policy; BF from prior-year sell-through).
- **Material planning (next):** BOM explosion + gross-to-net netting against on-hand and
  scheduled receipts (open POs/jobs) → planned make/buy orders with lead-time offset.
- **Transparency:** forecasted demand, planned production, and projected inventory all
  viewable.
- **Clean data pipeline:** Epicor straight into Postgres (no Sheets hop).

The full capability map and phased roadmap live in `scheduling/MRP_ROADMAP.md`.

---

## 2. System landscape

Langmuir runs a family of small Node/Express services on Railway, each its own repo,
plus Google Apps Scripts bound to Sheets, all reading Epicor. Registered in
`scripts/config.sh`; workspace guide in `CLAUDE.md`.

| Piece | What it is |
|---|---|
| `pms/` | LangmuirPMS — warehouse + line inventory, picking, cycle count, Apollo/Titan boards (WS) |
| `kpi/` | Production KPI board (finished-goods dashboard) |
| `scheduling/` | **This project** — the scheduling service becoming the MRP |
| `tooling/`, procurement, cyclecount | sibling request/approval apps |
| `google-scripts/pms-locations` | Apps Script: PMS inventory sheet + Epicor on-hand + **machine→line map** (`doGet`) |
| `google-scripts/production-data` | Apps Script: KPI Epicor pulls (`BF_DailyProduction`, `BF_FGOnHandInventory`, `BF_FGShipments`) |

The MRP is the **brain** that ties demand → production → materials together; the other
apps execute (picking, purchasing) and display.

---

## 3. The MRP service (`scheduling/`) — architecture

Standalone Railway service + **Postgres**, shop-WiFi IP-allowlisted, `MANAGER_PIN` on
`/admin`. Background tick pulls data and recomputes; state lives in SQL (restart-safe).

**Data flow (current + target):**
```
Epicor BAQs ──REST──▶ lib/epicor.js.syncAll() ──▶ epicor_cache (Postgres, JSONB per BAQ)   [direct — the clean path]
Shopify export ─────▶ shopify_sales table (demand: run-rate + BF-day surge)                 [demand source]
pms-locations doGet ▶ lib/sheets.js (machine→line map, line inventory)                       [Sheet-native only]
                         │
                         ▼
                  lib/engine.js  (pure buildPlan() core + computeAll() DB wrapper)
                         │  demand → MPS (Kanban + BF, 80% capacity) → [next: BOM explosion → net → planned orders]
                         ▼
                  production_order / production_event (Postgres)
                         │
        ┌────────────────┴───────────────────┐
        ▼                                     ▼
  /board.html (line lead)             /admin.html (manager, PIN)
  cards, pace, skip/adjust,           SKU plan, targets, settings/policy,
  bottlenecks, FG on-hand, demand     auto-plan readout, Run engine now
```

**Key files (≈970 lines total — deliberately small):**
- `server.js` — app, allowlist, tick loop, `/healthz`, `/api/epicor-status`, `/api/config`.
- `lib/engine.js` (376) — the brain. `buildPlan(input)` is **pure/testable**; `computeAll()`
  does DB I/O. Demand-driven reorder/batch/par, auto BF target, priority tiers,
  80% capacity packing, component bottlenecks (ranked), auto-seed of `sku_plan` from the map.
- `lib/epicor.js` (72) — **direct Epicor→Postgres sync** (REST BAQ → `epicor_cache`), hydrate on start, `get(baq)`, `EPICOR_BAQS` env list.
- `lib/sheets.js` (78) — pms-locations `doGet` poll (map/line-inventory) + a **legacy** KPI shipments poll (being superseded by direct Epicor + Shopify).
- `lib/allowlist.js` (45) — shop-WiFi gate (ported from PMS `ipAllowed`).
- `routes/admin.js` (134) — PIN-gated CRUD: `sku_plan`, `build_ahead_target`, `schedule_config`; `run-engine`.
- `routes/schedule.js` (169) — `/api/schedule`, order actions (done/skip/qty), `/api/demand`, `/api/skus`, `/api/conflicts`, `/api/public-settings`.
- `db/schema.sql` + `db/migrate.js` — idempotent schema (tables + `ADD COLUMN IF NOT EXISTS`).
- `public/board.html`, `public/admin.html` — dark floor-board + manager UIs.

**Schema highlights:** `sku_plan`, `build_ahead_target`, `schedule_config` (policy),
`production_order` (the cards; UNIQUE plan_date+line+sku; computed + manual-override
fields), `production_event` (append-only actions/units), `epicor_cache` (raw BAQ JSONB),
`shopify_sales`, `onhand_snapshot`.

---

## 4. Current state

**Built & verified (mock/syntax):** the whole service above — full auto-planning engine,
board, admin, direct Epicor sync foundation, demand wiring, bottlenecks, container-aware
open-PO model in the guide.

**Deployed:** an earlier version is live (board/admin load). The **latest** code
(auto-seed, demand-driven policy, direct Epicor sync, board fixes) **still needs to be
redeployed + migrated + env-configured**. Use `scripts/deploy-scheduling.sh`.

**Data feeds:**
- ✅ `BF_DailyProduction`, `BF_FGOnHandInventory`, `BF_FGShipments` (Apps Script), `BF_OpenPOs` (built — container-aware, see §6), machine→line map (filled).
- ✅ Shopify demand export (H2 net units + Black-Friday-day column) — sample in hand.
- ⏳ **Needed:** `BF_PartBOM`, `BF_OpenJobs`, `BF_PartMaster`, `BF_SalesOrders` (+ optional `BF_Containers`).

**Known open items (Brendan's words + observed):**
- "Nothing auto-populating" → almost certainly the latest engine isn't redeployed, the
  migration hasn't run, or `EPICOR_BAQS`/`KPI_URL`/`LOCATIONS_URL` aren't set. `/healthz`
  and `/api/epicor-status` are the diagnostics.
- Some runtime errors he's working through one by one — get specifics and fix.
- Wants **more per-line clarity + explicit priority reasons** on the board.

---

## 5. Honest assessment — strengths, risks, and where to improve

**Strengths**
- Small, modular, readable (~970 lines); the engine's core is a **pure function** and
  already has mock tests — extend that.
- Idempotent migrations, graceful degradation (missing data → clean empty states, not
  crashes), single Epicor integration point, advisory/turnover-friendly, well-documented.

**Risks / tech debt / improvement opportunities**
1. **Data path is mid-migration.** Three ingestion routes coexist: pms-locations `doGet`
   (map/on-hand), the **legacy** KPI shipments poll, and the new **direct Epicor** sync.
   *Consolidate:* Epicor data → `epicor_cache` (direct); demand → `shopify_sales`; keep
   `doGet` only for the Sheet-native map. Retire the KPI shipments path. **The engine
   still reads Epicor on-hand/shipments from the sheets/KPI caches — rewire it to read
   from `epicor_cache` as the BAQs land.** This is the most important cleanup.
2. **The MRP core (netting) isn't built yet.** Everything so far is the MPS half. Gross-to-net,
   BOM explosion, and planned make/buy orders (Roadmap C/D) are the real MRP value and are
   blocked only on `BF_PartBOM` + the open-POs/jobs feeds.
3. **BAQ JSON-key fragility.** REST returns field-id keys that differ from the friendly
   xlsx labels (e.g. `PORel_DueDate` vs "Due Date"). Build parsers tolerant of both and
   confirm against a real `/BaqSvc/.../Data` sample before trusting them.
4. **Receipt timing needs the container model.** Open POs only have a real ETA once on a
   container (Container ID ≠ 0 = in transit; 0 = not shipped, low confidence). Net against
   receipts by container bucket and flag shortages "covered" only by unshipped POs. A
   `BF_Containers` BAQ (Container ID → ETA) would make this precise.
5. **Multi-line SKUs.** Auto-seed picks the first mapped line and the admin line-dropdown is
   constrained, but a good genuinely built on two lines isn't modeled — decide a policy.
6. **Testing & resilience.** Only manual mock scripts exist; add a committed test for
   `buildPlan`. `computeAll` isn't fully row-isolated — one bad row can abort a run; wrap it.
7. **Deploy friction.** Schema changes require a manual `npm run migrate`; consider a
   guarded auto-migrate on boot. Every Apps Script change needs a *new deployment version*
   (easy to forget).
8. **Forecast is a trailing run-rate.** Fine for v1; Shopify seasonality/curve is a later upgrade.
9. **Per-line clarity.** Priority reasons exist as tags; deepen the "why is this on top"
   explanation Brendan asked for.

---

## 6. The BAQ program — your center of gravity

**How a BAQ feeds the system (the whole loop):**
```
Build BAQ in Epicor  →  it's live at /api/v2/odata/159674/BaqSvc/<ID>/Data
add <ID> to EPICOR_BAQS env  →  lib/epicor.js pulls it each tick into epicor_cache
                              →  engine.get('<ID>') returns the rows  →  used in planning
```
**Adding a stream is config, not code** — that's the point of the direct-sync refactor.

**Best-practice recipe (guide the non-expert):**
1. **Duplicate a working BAQ** (`BF_DailyProduction`) → *Save As* → swap tables/fields.
   It already has REST access + the right company; don't fight from scratch.
2. **Understand the Epicor table** behind each need before choosing fields (Part, PartMtl,
   PartPlant, PORel, JobHead/JobMtl, OrderRel/OrderDtl, PartVend, PartTran).
3. Return **only the columns the engine needs**, filtered to **open/active** rows.
4. **Validate on real data:** Analyze in the designer, then pull a `/BaqSvc` REST sample,
   confirm the JSON keys, and reconcile against a known part before wiring.
5. Add to `EPICOR_BAQS`, redeploy, confirm on `/api/epicor-status` (row count > 0).

**Status of the feeds** (full specs in `scheduling/BAQ_BUILD_GUIDE.md`):

| BAQ | Role in MRP | Status |
|---|---|---|
| `BF_DailyProduction` | production actuals | ✅ |
| `BF_FGOnHandInventory` | FG on-hand | ✅ |
| `BF_FGShipments` | demand (being replaced by Shopify) | ✅ (legacy) |
| `BF_OpenPOs` | scheduled receipts (buy) + **container transit signal** | ✅ built |
| **`BF_PartBOM`** | BOM explosion (parent→component, QtyPer) | ⏳ **build first — biggest unlock** |
| **`BF_OpenJobs`** | scheduled receipts (make) + dependent demand | ⏳ |
| **`BF_PartMaster`** | make/buy, lead time, safety, MOQ, cost | ⏳ |
| **`BF_SalesOrders`** | firm independent demand | ⏳ |
| `BF_Containers` (opt) | Container ID → ETA (precise receipt timing) | investigate |

**The container insight (important):** a PO's real arrival is only knowable once it's on a
container. `BF_OpenPOs` returns `Container ID` (0 = not shipped). Treat it as the transit
confidence/timing signal, not a footnote — it's the crux of the Black Friday supply risk.

**Demand from Shopify:** the "Total sales by product title" export carries period net
units (baseline rate) **and** a Black-Friday-day column (last-year surge). Needs a
title → Epicor-make-part/line map. See `scheduling/DEMAND_RATE_SOURCING.md`.

---

## 7. How to work in this repo (constraints)

- **Cowork can't reliably `git push` / `clasp push`.** You *edit files and propose exact
  paste-able commands*; Brendan runs them. Helpers: `scripts/sync-repo.sh`,
  `sync-gscript.sh`, `first-push.sh`, `deploy-scheduling.sh`. Register new repos in
  `scripts/config.sh`.
- **Epicor = source of truth; MRP is advisory** (no write-back v1). Read-only pulls.
- **Apps Script web apps are versioned** — a `clasp push` isn't live until a *new
  deployment version* is published.
- **Turnover-readiness** is a first-class requirement (non-dev owner; intern leaves ~Aug 2026).
- **Persistent memory** exists (auto-loaded each session) — read it; keep it updated as
  decisions land. It already contains the full project history.
- Sandbox can read/write files and run Node/psql-style checks, but can't reach live Epicor
  or push; verify logic with mock data + syntax checks the way the existing session did.

---

## 8. Immediate next actions (suggested order)

1. **Get healthy in prod:** help Brendan run `scripts/deploy-scheduling.sh`, set env
   (incl. `EPICOR_*`), `npm run migrate`, **Run engine now**; confirm `/healthz`
   (`skusFromMap`>0, `epicor.configured`) and `/api/epicor-status`. Resolve the
   "nothing auto-populating" + his specific runtime errors.
2. **Drive `BF_PartBOM`** to completion with him; validate ~10 REST rows; then
   `BF_OpenJobs`, `BF_PartMaster`, `BF_SalesOrders`.
3. **Build the netting core** (Roadmap C/D) against real BAQ data; **rewire the engine to
   read Epicor from `epicor_cache`** and retire the legacy Sheets/KPI shipments path.
4. **Shopify demand import** (+ title→part map); switch demand to Shopify.
5. **Transparency views** (demand / production / projected inventory) and deeper per-line
   priority explanation.

---

## 9. Reference index

In `scheduling/`:
- `MRP_ROADMAP.md` — capabilities, data streams, phased roadmap (**start here for the vision**).
- `DESIGN.md` — the scheduling/MPS module design (architecture, engine logic, board/admin).
- `BAQ_BUILD_GUIDE.md` — per-BAQ tables/joins/fields/filters + the container model.
- `DEMAND_RATE_SOURCING.md` — Shopify-vs-Epicor demand analysis.
- `BF2026_INITIAL_PLAN.md` — Black Friday baseline numbers per line.
- `POSTGRES_SETUP.md`, `README.md` — infra + service overview.

Workspace: `CLAUDE.md` (workspace guide + deploy discipline), `scripts/config.sh`
(repo/service registry), the persistent memory (project history + decisions).
