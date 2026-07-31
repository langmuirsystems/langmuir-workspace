# Handover — Shipping/Freight work session (2026-07-27 → 07-28)

Context for continuing work on the Langmuir PMS shipping module. Workspace root:
`~/Documents/Claude/Projects/Langmuir Production Management System`. The live app is
`pms/` → Railway `langmuir-pms` → langmuirproduction.up.railway.app. Brendan deploys with
`bash scripts/push.sh pms "message"` (pulls --rebase first, handles stale index.lock, always pushes, sets upstream).
Project memory files (MEMORY.md + topic files) have deeper detail on everything below.

## ⚠ ONE OUTSTANDING ACTION
All code is committed to disk but **NOT yet pushed**. One push ships the whole batch:
```
cd ~/Documents/Claude/Projects/Langmuir\ Production\ Management\ System
bash scripts/push.sh pms "feat: freight booking view, pack exclusions, Ind per-line units, addresses"
```
After deploy, verify: `/freight` shows street addresses; `/api/pack/queue?line=MR1` has ~9
deduped orders; shipping page tabs read Picking/Shipping.

## What was built (all in pms/, all tested with mock suites)

**1. Activity history (shipping.html + shipping.js)** — /api/ship/pick-log now filterable
(order #, person, part, date range) + "Load older" cursor paging over full history. Order
search accepts BOTH the Epicor order # (25xxx) and the Shopify # (111xxx = OrderHed_PONum).

**2. Line packing — "Pack & Ship" tab on line.html** (Apollo/TITAN/VULCAN/XR/MR1 only).
Freight + Assembled orders packed at the line: Start → scan every item (verified, red-flash
mismatches, logged to ship_picks under queue Freight/Assembled) → Packed → front office ships.
Endpoints: /api/pack/queue|start|scan|release|ship|unpack|exclude|exclude-remove.
Tables: pack_jobs (packing→packed→shipped), pack_line_exclusions, freight_bookings.
- Orders dedupe across the Freight+Assembled BAQs (same order sits in both; Assembled wins).
- Full order contents come from the MASTER BAQ (skips -DEPOSIT / Dep-BAQ / dropship / shipped
  lines); packer name in localStorage 'pms-picker-name'… actually 'pms-packer-name'.
- **Exclusions**: 🚫 Can't-ship per line + reason (out of stock / already shipped / damaged /
  other). recomputePackJob() is the single completion authority (exclude last unpicked line →
  packed; re-include → back to packing). Scans on excluded lines bounce.
- **Unpack**: packed → packing, scans kept, warns if booked.
- **Ship authority: ONLY the freight view calls /api/pack/ship.** Line sees green Packed pill.

**3. Freight Booking view — `/freight` (freight.html, new)** for the front-office
receptionist. Per line: READY always visible; Being-packed + In-queue collapsed; all 5 line
sections always render (empty = "✓ Nothing in the queue"); "Other freight" bucket for orders
mapping to no line (Pro-Max, ArcFlat). Cards: SO # first, tap-to-copy freight-type chip, red
exclusion banner ("split the order in Epicor before booking"), 📋 Copy address, Mark-as-booked
(free-text expected pickup + note; freight_bookings table, cleared on ship), 🚚 Shipped button.
Endpoints: /api/freight/board|book|unbook. Nav pills added on shipping.html + picker.html.

**4. Individual queue = per-LINE units (shipping.js + shipping.html)** — realization: Ind
lines ship SEPARATELY. Each line has its own card/claim/bin ((orderNum, orderLine) is the unit
key; ship_claims/ship_bins gained order_line, old PK dropped for unique index w/ COALESCE).
Line-scoped scan completion, ledger, auto-ship, release, repack. Exclusion of a part (e.g.
PROMAX) hides only ITS line — RazorCuts on the same order stay pickable.
Migration note: Ind bins open at deploy time are whole-order; release + re-claim once.

**5. Shipping page polish**: FIFO everywhere (oldest first), OrderHed_OrderHeld orders hidden
(flag only exists in master BAQ → masterMetaIndex), tabs renamed 🛒 Picking / 🚚 Shipping.

## Epicor BAQ state (all verified working)
Categories are driven by **Part.MtlAnalysisCode**: '2'=Freight, '3'=Assembled (MR1-ASSEMBLY,
XR-ASSEMBLY), '5'=Deposits. New assembled SKUs need code 3; new freight SKUs code 2.
- **BF_ShippingDB_Freight** (live, 35 rows): fixed copy — removed `ShipViaCode NOT IN
  (FCOM,FRCL,FRES,SEAF,SEAL)` which was hiding all Freight-Resi/Co orders from pms.
- **BF_ShippingDB_Assembled** (live): MtlAnalysisCode='3', no via exclusion.
- **BF_ShippingDB_Addr** (live, v2): OrderHed + LeftOuter Customer + LeftOuter ShipTo,
  OpenOrder=TRUE. VERIFIED: ShipTo addresses on 692/693 open orders. **Langmuir does NOT use
  OTS** (all false) — Jitterbit writes the customer ShipTo record. The ShipTo ZipCode column
  didn't survive import → addressFor() borrows ZIP/phone from the Customer tier (same address).
- Epicor SaaS forces the BF_ user prefix on Brendan's BAQs; they MUST be marked **Shared** or
  the pms service account gets 404. pms BAQ names are env-overridable: SHIP_FREIGHT_BAQ,
  SHIP_ASSEMBLED_BAQ, SHIP_ADDR_BAQ (defaults = the BF_ names).
- .baq files are zips of BAQVersion/DynamicQuery/DynamicQueryDesign/QueryDependencies XML;
  hand-authoring works (two imported successfully) — clone row structures from any export,
  fresh GUIDs, empty QueryDiagramDataSet. Import under the same QueryID overwrites in place.

## Gotchas / conventions
- pms `order_num` = Epicor OrderHed_OrderNum (25xxx). Everyone quotes the Shopify # (111xxx)
  = OrderHed_PONum. Both searchable in the Activity tab; PO resolution only while the order is
  open in master.
- "Missing orders" are usually **daily part exclusions** (ship_day_exclusions, expire at
  Chicago midnight) — check `queues.exclusions` in /api/ship/queues FIRST.
- Ledger: NOTHING subtracts at scan; the one subtraction is at ship (shipOutLedger, ledgered
  flag). Auto-ship/auto-finalize run after each 2-min BAQ sync, gated by syncsHealthy().
- Don't run git on the mounted repos from a cloud session (stale index.lock); Brendan pushes
  from Terminal. Cloud can't fetch the Railway site (403) — use claude-in-chrome for live
  checks (/api/ship/status, /api/pack/queue?line=X, /api/freight/board).
- Mock test suites live in the session sandbox only (not committed): pattern = mock pg pool +
  express app, require shipping.js. Recurring bug to grep after edits: `const { rows: pc } =`
  followed by `pc.rows.map` (happened twice).
- UI style for new pages: Langmuir dark theme, brand header, #C8102E red (see feedback_ui_style
  memory). Front-office pages: big fonts, minimal buttons.

## Likely next steps
- Push + verify (above). Then floor feedback rounds on /freight and exclusions.
- Possible: weight/value data for freight quoting (iPacky shows it; Epicor has Part.NetWeight);
  ArcFlat→line mapping decision; PIN login for packers; wall displays (/ops, /engineering)
  from the CI project's Phase 5.
