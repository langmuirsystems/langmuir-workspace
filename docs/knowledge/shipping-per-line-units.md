# Per-line shipping units

*Lines on the same order in the Individual (Ind) parcel queue ship SEPARATELY. They never share a bin.*

**Rule: in the Ind queue, `(orderNum, orderLine)` is the unit key, never orderNum alone. Multi Pack and Warranty stay whole-order.**

Why this exists: a 2026-07-27 realization by Brendan. The ops director had assumed the opposite. Direct consequence: a daily part exclusion (say CROSSFIRE-PRO-MAX) must hide only ITS line, not the sibling RazorCut line on the same order.

## Implementation (2026-07-27, 14-check suite plus regressions)

- `ship_claims` / `ship_bins` gained `order_line INT` (NULL = whole-order unit). `ship_claims` PK `(order_num,queue)` was DROPPED in favor of unique index `ship_claims_unit (queue, order_num, COALESCE(order_line,-1))`. Claim INSERT uses a bare `ON CONFLICT DO NOTHING`.
- `/api/ship/queues`: Ind orders explode into per-line unit cards (`o.unitLine`, each with its own availability / exclusion / claim). `claimMap` key = `order|queue|line-or-''`.
- claim / release / repack accept `orderLine`, with scoped voiding and deletes via `($n::int IS NULL OR order_line=$n)` or a COALESCE compare.
- scan: `lineComplete` on a line-scoped bin marks that bin ready and responds `orderComplete:true`.
- bins endpoint filters line-scoped bin contents. bin/ship ledgers use `onlyLines=[order_line]` plus a line-scoped claim delete.
- `autoShipFromEpicor`: line bins checked via `lineStillOpen`, `scope:'line'` events, skips partial/reopen logic.
- `shipping.html`: `findOrder(orderNum,queue,unitLine)`, `state.pick.unitLine`; take/claim/resume/release/repack all pass `orderLine`; bin cells show "#order · L4"; copy reads "1 bin = 1 shipment".

**Migration edge:** claims and bins created before this deploy have `order_line` NULL, so an old open Ind bin shows as whole-order. Release and re-claim it once.

Related: [line-packing](line-packing.md)
