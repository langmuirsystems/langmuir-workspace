# The freight-via crack (order #25275)

*Ship-via is NOT evidence that the freight process owns a line. Membership in the Freight or Assembled BAQ is, and it is judged per ORDER, not per line.*

## The bug

Order #25275 (warranty, ship via `'Freight - Commercial Liftgate`) rendered on **no screen at all**.

- `BF_ShippingDB_Freight` criteria are `OrderDtl.OpenLine = TRUE AND OrderDtl.ProdCode <> 'Warranty' AND Part.MtlAnalysisCode = '2'`. That BAQ can NEVER carry a warranty order, and it also drops any part outside material-analysis class 2.
  *(Read from `ICM_ShippingDB_Freight_fixed.baq` at the workspace root. A `.baq` file is a zip; criteria live in the `DynamicQuery` entry as `QueryWhereItemDesigner` elements.)*
- The Warranty queue then skipped it via `isFreightVia(raw)`, assuming every freight-looking ship-via is handled by the freight flow.
- The unrouted check ALSO skipped freight vias, so nothing complained.

## Why per-ORDER, not per-line

A line-level test dumped every Apollo accessory into "shippable items in no pick category". `packOrderLines()` builds the packer's list from the **MASTER** BAQ, so accessories riding along with an Apollo are already on the packing board and the freight-booking card even though only the machine line (class 2) is in the Freight BAQ. One line in Freight/Assembled therefore covers the whole order. This also prevents an accessory that IS in a parcel BAQ from being picked twice.

## The fix

`pms/shipping.js` gained one helper pair, `packedAtLineOrders()` / `packedAtLine(orders, row)`, used at five sites: queue build, unrouted check, bin reopen-on-update, the `/api/ship/scan` guard (it was refusing scans with "That line ships freight — not picked here"), and `/api/ship/bins` (the old `!isFreightVia` there emptied the bin card, no customer and no lines). `/api/ship/queues` returns `uncoveredFreight`. UI badges in `pms/public/shipping.html` on the queue-chooser card, pick header, and shipper bin card.

## Do not "clean" the raw ship-via

Epicor prefixes ship-via descriptions with sort punctuation: `" FedEx - 2 Day"`, `".FedEx - Standard Overnight"`, `"'Freight - Commercial Liftgate"`. `shipViaLabel()` strips it **for display only**. Every freight test still reads the raw column.

## Still open

`/freight` is built from the Freight + Assembled BAQs, so a warranty-freight order does NOT appear there for the receptionist to book a carrier. Brendan chose "shipping queue is enough" on 2026-07-29. Revisit if a booking gets missed.

Related: [freight-booking](freight-booking.md), [system-map](system-map.md)
