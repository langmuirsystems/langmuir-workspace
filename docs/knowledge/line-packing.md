# Line packing (Pack & Ship)

*A line packs MULTIPLE orders at once, one wired to the scanner. Daily exclusions explain most "missing" orders.*

Line packing is LIVE: Freight + Assembled orders are packed at the line (Apollo/TITAN/VULCAN/XR/MR1). Flow: Start → scan every item → packed → **the front office ships it from `/freight`**. The line never marks an order shipped.

Endpoints: `/api/pack/queue|start|scan|release|ship|unpack|exclude|exclude-remove`. Table `pack_jobs`; scans land in `ship_picks`.

BAQs: **BF_ShippingDB_Freight** + **BF_ShippingDB_Assembled**. Epicor SaaS forces the `BF_` user prefix and both must be marked Shared. Env overrides: `SHIP_FREIGHT_BAQ` / `SHIP_ASSEMBLED_BAQ`. Categories come from `Part.MtlAnalysisCode` ('2' Freight, '3' Assembled, '5' Dep). **New assembled SKUs need code 3 or they will not appear.**

## Multiple orders open per line

Brendan, 2026-07-29: "crating is a flow, orders sit at different stages." Every in-progress order renders. Exactly ONE is wired to the scanner (red-outlined card + ◉ SCANNING pill); the rest are compact cards with "◉ Scan into this order". Selection lives in `packActiveKey` ('queue|orderNum'), survives the 12s poll, and falls back to the next open order when the selected one finishes. **Only one `#pack-scan` exists at a time on purpose.** The server always allowed this; it was a UI restriction.

## Simplified scan list (2026-07-30)

The live card's list is WHAT'S LEFT. `packLiveRows()` drops a line from the working list the moment its last unit scans. Completed lines and "Can't ship this" exclusions live in a collapsed "▸ Scanned so far — N items · M set aside" fold at the bottom (the Put-back button is inside the fold). Up-next and Packed cards no longer auto-render items: `packItemsFold()` shows "▸ 13 items" until tapped. Fold state lives in `packScannedOpen`/`packItemsOpen` keyed by packKey and survives the 12s re-render. `packRows(o)` compact mode still renders expanded lists; the activeStyle branch is superseded by `packLiveRows`.

## "Missing RazorWelds" was NOT a bug

The orders were served but hidden by DAILY PART EXCLUSIONS. An order hides when ANY line carries an excluded part, and exclusions expire at Chicago midnight. **When someone says orders are missing, check `queues.exclusions` in `/api/ship/queues` FIRST.**

## Rules that still hold

- Dedupe by orderNum across both pack BAQs. An order with an assembled machine plus freight lines sits in both.
- FIFO everywhere, oldest first.
- On-hold orders are hidden via `masterMetaIndex` (`OrderHed_OrderHeld` only exists in the MASTER BAQ).
- **Gotcha:** pms `order_num` is the Epicor number (25xxx). The "Shopify order" people quote is `OrderHed_PONum` (111xxx). These get confused constantly.

Related: [order-sheet-scan](order-sheet-scan.md), [scan-focus-rule](scan-focus-rule.md), [line-routing](line-routing.md)
