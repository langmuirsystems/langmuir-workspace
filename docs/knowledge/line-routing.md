# Order to line routing

*Part-number prefix ONLY. The BOM-ancestry pass was REVERTED 2026-07-30.*

Order to line is decided in `packBoardForLine` (`pms/shipping.js`) and drives BOTH the `/freight` line tabs and each line tablet's Pack & Ship tab. **They are the same board**, so anything routed to Apollo also appears on Apollo's packing tab.

## Pass 1, the only pass

`lineForPart`: `APOLLO*`, `TITAN*`, `VULCAN*`, `MR1*`, `XR*` / `CROSSFIRE-XR*` / `*-XR`.

## Pass 2 (BOM ancestry) was reverted

Added 2026-07-29, reverted 2026-07-30 at Brendan's request, one day later. Warranty and service parts with no machine in the name should STAY in Other, not move to a line's packing tab. They belong to the shipping team's flow.

`lineForPartViaBom` still exists (the `/api/ship/part-line` diagnostic and receiving's line hint still use it), it is just no longer called from board routing. The "↳ X is a part of Y" card note (`o.lineVia`) is no longer emitted; the render blocks in freight.html and line.html are dead but harmless.

**Migration edge:** an order mid-pack that pass 2 had routed to a line disappears from that tablet after deploy. Its in-progress card only shows on `/freight`'s Other tab. Finish or release such jobs around the deploy.

## Other on /freight also carries Warranty-queue freight (2026-07-30)

`warrantyFreightForBoard()` pulls Warranty-BAQ orders with `isFreightVia`, skips orders the pack queues already carry, and groups by parcel state (bin ready or at_shipping → ready; claim or bin picking → packing; else queued). Cards are flagged `parcel:true`: freight.html shows "🔧 Warranty freight — picked in the shipping room", parcel wording per group, and NO pack-flow Shipped button. Their shipped happens on the shipping page when the bin goes out. `/api/ship/bin/ship` and autoShip whole-order path now also clear `freight_bookings`. Dims defaults are NOT saved for `queue='Warranty'`.

## Diagnostic

`GET /api/ship/part-line?part=LSXR-54` → `{direct, viaBom, viaAssembly, ambiguous, usedIn[], bomLoaded, line}`. Part numbers only.

**A prefix rule in `lineForPart` would move LSXR orders out of Other. Ask Brendan before adding any prefix.**

Related: [line-packing](line-packing.md), [freight-booking](freight-booking.md)
