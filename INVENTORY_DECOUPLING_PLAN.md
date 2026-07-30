# Inventory Decoupling Plan — Sheets → Postgres

*Scoped 2026-07-21. This is the last Sheets dependency in the production stack, and the biggest: unlike cycle count or the KPI board, the Locations sheet is the system of record for physical inventory.*

## 1. What the spreadsheet actually is today

The pms server holds no inventory state — every pick, stow, and transfer round-trips through the Apps Script web app (`LOCATIONS_URL`) to the Sheet. Concretely, the Sheet is four different things:

**A. The inventory ledger (the high-stakes part).** `Locations` (1,409 rows: rack/section/level/position geometry + part + qty), `Line Inventory` (620 rows: per-line on-hand + reorder columns), and `Transaction Log` (append-only history). Written by doPost actions: `stow`, `subtract` (picks), `bumpLine` (transfers + ship-out), `remove`.

**B. Hand-edited config.** `Bundles`, `Machine Line Map`, `Uline Boxes`, `Orphan Assignments` — the tabs you edit directly. Read-only to the script.

**C. Workflow queues and logs.** `Needs Review`, `Replenishment Queue`, `Request Journal` (server restart recovery), Titan/Line/Station cycle logs, `Line Consumption Log`.

**D. Plumbing that exists only because the script lives in a Sheet.** `BAQ_Data` + `Refresh_Log` (Epicor cache — pms already fetches BAQs directly elsewhere), BOM tabs + weekly sync, the daily `runLineConsumption` job (Epicor consumption + scrap + STK-CUS decrements).

Already off the Sheet, proving the pattern: cycle count engine, shipping, KPI board, diagrams, feedback. The cycle-count portal still *writes inventory* through the Apps Script (`cycleApplyWrites`) — it inherits the new write path automatically when that path moves.

## 2. Target architecture

One new module (`pms/inventory.js`, mirroring how cyclecount.js was done) plus tables:

- `inv_locations` — location code, geometry (rack/section/level/position), flags. The *place* master.
- `inv_stock` — location × part × qty (the ledger). Every mutation in a SQL transaction — this alone kills the Sheet's worst failure mode (lock contention and read-modify-write races on concurrent picks).
- `inv_line_stock` — line × part × on-line qty + reorder point / replenish-to / auto flag.
- `inv_transactions` — append-only, same columns as Transaction Log plus a `source` field; indexed by part, location, and time. **Every** change writes here, including admin edits.
- `inv_bundles`, `inv_machine_line_map`, `inv_uline_boxes`, `inv_orphan_assignments` — config, each with a small edit UI (the Bundles editor looks like the KPI targets modal).
- `inv_needs_review`, `inv_replenishment_queue`, plus Request Journal becomes a one-row table.
- Epicor on-hand: reuse the existing direct-BAQ client (shipping/kpi pattern) with a cache table; the 1-minute Apps Script trigger and `BAQ_Data` die.
- `runLineConsumption` (daily consumption/scrap/STK-CUS) becomes a scheduled job inside pms — same rules, ported from Code.js.

The internal seam stays put: pms already funnels every inventory call through `fetchWithRetry(LOCATIONS_URL, ...)`. We introduce `invBackend.{stow,subtract,bumpLine,...}` with the exact same request/response contracts, so line.html/picker.html/worker.html/shipping don't change at all during migration.

## 3. The admin page (`/inventory-admin`)

What you specified, plus the audit trail that makes blank edits safe:

- **Part search** → card: every warehouse location + qty, every line + on-line qty, Epicor on-hand vs local total (live drift for that part), and full transaction history (filterable by type/user/date, paginated from `inv_transactions`).
- **Location view** → what's there now + full history of everything that ever moved through that location.
- **Edit mode** — change qty at a location, move part between locations, add/remove a part-location pairing, edit line qtys. Every edit requires a reason and writes an `Admin Adjustment` transaction (who/when/before/after). PIN-gated like cycle-count confirms.
- **Recon tab** (parallel-run period only): the daily Sheet-vs-Postgres diff, so divergence is visible the day it happens, not the week after.

## 4. Parallel run — the part that makes it safe

Four phases, each with an explicit gate. Rollback at any point = flip one env var back.

**Phase 0 — Import + shadow reads (no risk).** Build schema, one-time import from the Sheet (locations, line inventory, config tabs, and Transaction Log history so part history is complete from day one). pms reads/writes Sheet as today; a nightly recon job diffs Sheet vs Postgres and reports.

**Phase 1 — Dual-write, Sheet remains truth (the long soak).** Every write goes to the Sheet first (unchanged), then replays into Postgres. Reads still come from the Sheet. The recon report should show **zero drift attributable to the write path**; anything that diverges is either a port bug (fix it) or a *human editing the Sheet directly* — which the recon catches and the admin page replaces. Gate: 2+ clean weeks, including a weekend and a consumption-job cycle. During this phase the admin page runs read-only against Postgres, so you can validate part histories against what you know.

**Phase 2 — Postgres becomes truth, Sheet becomes shadow.** Reads flip to Postgres (env switch); writes now go Postgres-first, then replay to the Sheet so it stays a live rollback target and familiar read-only view. Admin edit mode unlocks. Manual Sheet edits must stop here (tabs already hidden helps). Gate: 2+ clean weeks of reverse recon plus a full cycle-count sweep segment agreeing with Postgres.

**Phase 3 — Sunset.** Stop the Sheet replay, keep the file as a frozen archive, retire the pms-locations Apps Script (and its clasp entry), remove `LOCATIONS_URL`. The nightly recon becomes a permanent Epicor-vs-local drift report instead.

## 5. What makes this genuinely hard (the honest risk list)

- **Subtract/stow semantics.** Code.js has years of accumulated rules: duplicate-stow suppression windows, floor-vs-reject (including the new `allowFloor`), bundle expansion, Epicor-override stows, orphan handling. The port must be behavior-identical; the dual-write soak is what proves it. This is ~60% of the engineering effort.
- **Human edits to the Sheet** during parallel run are the most likely source of divergence. Mitigation: recon report names the cell-level diffs; admin page gives the sanctioned way to do the same thing.
- **The consumption job** (STK-CUS decrements etc.) mutates line inventory daily on a trigger. It must run in exactly one system per phase — double-decrementing is silent corruption. The plan runs it Sheet-side through Phase 1, Postgres-side from Phase 2, never both.
- **Request Journal restart recovery** is easy to port but easy to forget — a restart during migration must restore the queue from whichever side is truth.
- Concurrency actually gets *better* (SQL transactions vs. Apps Script LockService), but only after cutover; during dual-write the Sheet remains the serialization point.

## 6. Effort and sequencing

Roughly 7–9 working sessions of build plus 4–5 weeks of calendar time dominated by soak periods: schema + import + recon (1–2), write-path port with dual-write (2–3, the hard part), read cutover + cache swap (1), admin page (1–2), config editors + consumption job port (1–2). Each phase ships independently; nothing needs a big-bang deploy.

## 7. Decisions — RESOLVED 2026-07-21

1. **Sheet edits frozen** — Brendan removes team edit access (view-only). Config changes go through the new editors/admin page.
2. **Full Transaction Log history** imported.
3. **Admin edits: name + PIN**, validated against the same 5 approved PINs already used for cycle-count confirm (`cc_settings.confirm_pins`).
4. **Green-lit.** Phase 0 built and deployed 2026-07-21 (`pms/inventory.js`: snapshot import, full-history import via `scripts/import-inv-history.sh`, `/api/inv/recon` + nightly recon log).

**Sequence change (Brendan): Phase 1 (dual-write soak with Sheet as truth) is SKIPPED** — Phase 0 → Phase 2 directly. Compensating controls, since the soak was the original correctness proof:

- **Golden test suite on the write path** — every rule in Code.js (duplicate-stow window, floor-vs-reject + allowFloor, bundle expansion, Epicor-override stows, orphan handling, replenishment enqueue) gets an explicit test with expected outcomes derived line-by-line from Code.js, reviewed as its own deliverable before cutover. This is now the gate that dual-write soak used to be.
- **Phase 0 runs ≥1 week clean** before cutover — proves the read model and recon mechanics on live data.
- **Phase 2 keeps the Sheet as a written shadow** with reverse recon nightly, so post-cutover divergence is caught within 24h and rollback stays one env flip.
- **Cutover on a low-volume day**, with the first two days' recon reviewed manually.

## 8. Write-path verification — how we prove 51 transaction variants (added after Phase 0)

The real Transaction Log contains **51 distinct transaction types** (Pick, 12+ bundle-pick variants, Stow / Stow (Epicor Override) / Stow (bundle, New Location), Transfer In/Out (warehouse and Line variants), Shipped Out, Cancelled (+reasons), Cycle Count (+session refs)). Assurance comes from four layers, each catching what the previous one can't:

**Layer 1 — Rule catalog, human-reviewed.** Before any porting, a line-by-line read of Code.js produces a numbered catalog: every rule, its exact source lines, and its intended behavior in plain English (e.g. "R7: a stow of the same part+location+qty within N minutes of an identical stow is suppressed as a double-submit; source 704–712"). **Brendan and the team review this document** — the lessons-learned live in people, not code, and a rule that's in heads but not in Code.js gets caught here or nowhere.

**Layer 2 — Golden test suite, one-to-one with the catalog.** Table-driven: given starting state + request → expected ending state, expected Transaction Log row, expected API response (including error text). Every catalog rule number maps to at least one test; reviewers can check coverage by diffing the two lists. Tests run against the new engine in CI on every future change too — this suite outlives the migration.

**Layer 3 — Data-derived coverage check.** Every one of the 51 transaction types observed in the 6,913 real rows must be *produced* by at least one golden test. Code-derived tests prove what we think the rules are; data-derived coverage proves we didn't miss a code path that reality exercises.

**Layer 4 — Live shadow run (the decisive one).** Before cutover, the new engine runs in shadow: every real floor request still goes to the Apps Script (truth, unchanged), and the same request also runs through the new engine against the Postgres mirror. Two comparisons run continuously: (a) **response diff** — if the engine's answer (newQty, floor/reject, error text) differs from the Apps Script's for the same request, the request + both answers land in an `inv_shadow_mismatches` table, pinpointing the exact divergent rule; (b) the existing **nightly recon**, which in shadow mode stops being an activity report and becomes a true end-of-day state comparison. This restores the assurance of the skipped Phase 1 — but with request-level precision, and all the recon/drill-down infrastructure already built.

**Cutover gate:** catalog signed off, all golden tests green, all 51 types covered, and **N consecutive days of shadow with zero mismatches** (suggest N=5 including a weekend and a consumption-job run). Any mismatch resets the counter.
