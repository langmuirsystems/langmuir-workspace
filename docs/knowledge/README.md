# Knowledge base

These are the decisions and hard-won gotchas behind the Langmuir systems. They are
**not** derivable from reading the code, which is exactly why they are written down.
Most of them exist because something broke, or because a design that looked obvious
turned out to be wrong on the floor.

Read the one that matches what you are about to touch, before you touch it.

## Start here

- [System map](system-map.md) — which repo serves which feature. Read this first, every time.

## Shipping and packing (the largest, most-changed area)

- [Line packing](line-packing.md) — Pack & Ship at the line; multiple orders open at once; why orders go "missing"
- [Per-line shipping units](shipping-per-line-units.md) — Ind queue lines ship separately; `(orderNum, orderLine)` is the unit key
- [Freight booking](freight-booking.md) — `/freight`, pickup dates, weight and crate dims, the address BAQ
- [The freight-via crack](freight-via-crack.md) — why order #25275 appeared on no screen at all
- [Order to line routing](line-routing.md) — prefix matching only; why the BOM pass was reverted
- [Order-sheet barcode scan](order-sheet-scan.md) — scan-to-work on both the shipping and pack pages
- [Shipping activity history](shipping-activity.md) — the filterable pick log

## Other systems

- [Cycle count to Epicor](cycle-count-epicor.md) — immediate DMT export, the stale flag, the known daily-BAQ limitation
- [BOM Manager](bom-manager.md) — working copy plus Epicor baseline
- [CI support intake](ci-support-intake.md) — one board per issue, the ⇥ move rule

## Conventions to follow

- [UI style](ui-style.md) — copy the picker header and CI board palette; keep the points system
- [Branding assets](branding-assets.md) — the torch mark, favicons, and the two different reds
- [The scan-box focus rule](scan-focus-rule.md) — the single most floor-disrupting bug class in this codebase
