# Freight booking (/freight)

*Board is tabs. Pickup date required, time OPTIONAL as of 2026-07-30. Weight and dims per order with (line,queue) autofill defaults.*

## Booking: date required, time optional

Changed 2026-07-30 (was both-required 2026-07-28). The receptionist often does not know when the carrier will show. An empty time renders "time TBD" everywhere (booked pill, Outgoing pu-time), sorts first within its day, and gets filled in later via ✎ Edit. `/api/freight/book` rejects a malformed time but accepts `''`.

Columns are `pickup_date` / `pickup_time` as TEXT `'YYYY-MM-DD'` / `'HH:MM'` **on purpose**: a DATE round-trips through UTC and shifts the day. `expected_pickup` stays the human label built by server-side `pickupLabel()`.

## Weight + crate dims (2026-07-30)

Tables: `freight_details` (order_num PK; weight_lbs, dim_len/wid/hgt NUMERIC, entered_by) and `freight_dims_defaults` (PK `(line,queue)`, last values entered win). `POST /api/freight/details` upserts BOTH. The default is why base machines do not get retyped. **Assembled and Freight (unassembled) keep SEPARATE defaults because the crates differ.**

Board and queue payloads decorate each order with `weight`, `dims{l,w,h}`, `dimsBy` when saved, else `dimDefault` for prefill. Entry UI in two places: line.html pack cards (live + packed) and the freight.html card section. Missing weight shows an amber "No weight yet — can't book without it" flag, but booking is NOT blocked (warn-only, Brendan's call).

`freight_details` rows are kept after ship for history. Bookings still delete on ship.

## Outgoing tab

First tab, 🚚, badge = today's pickup count. Booked pickups only, grouped ⚠ Past due / Today / Tomorrow, plus a collapsed "Booked further out" fold. Sorted by time across ALL lines. Each card gets a strip: big pickup time (or "Time TBD"), line chip, and pack state (✓ Packed & ready / ⏳ Still being packed / ⚠ Not packed yet in red). Days recompute every render; `dayPlus(1)` uses setDate so it is DST-safe.

## Tabs

Clipboard metaphor: Outgoing, Apollo, Titan, Vulcan, Crossfire XR, MR-1, Other. Active tab solid `#C8102E`. Selection persists in localStorage `pms-freight-tab`, and **the 20s poll must never move her off it.** `setTab` clears `bookingOpen` AND `dimsOpen`. Other = warranty items and anything with no line.

## Address BAQ

`BF_ShippingDB_Addr`: ShipTo's postal field is `ZIP`, not `ZipCode` (Customer uses `Zip`, OrderHed uses `OTSZIP`). **Epicor's Query Test runs the open design; REST runs the SAVED query.** That difference has burned an afternoon before. ZIP borrow guard: ShipTo borrows ZIP/phone from Customer only when city AND state match, otherwise the card gets a `zipMissing:true` warning.

## Diagnostics

- `GET /api/ship/baq-test?baq=NAME` runs any BAQ with the app's credentials.
- `GET /api/ship/status` lists every BAQ with its `error`.

## Test pattern that works here

jsdom loads the REAL `public/*.html` with `fetch` stubbed, then clicks and scans and asserts on the rendered DOM. keydown-dispatch simulates a barcode scanner. Run `node --check` plus `Function()` on extracted `<script>` blocks first to catch syntax errors.

Related: [order-sheet-scan](order-sheet-scan.md), [line-routing](line-routing.md)
