# Order-sheet barcode scan-to-work

*Built 2026-07-30 on two pages: shipping.html (claim → pick) and line.html Pack & Ship (start / switch packing).*

## Shared matcher idea

The exact barcode payload is unverified (Brendan: "the order number is somewhere in the barcode"), so both pages extract EVERY 4+ digit run from the code and try each, zero-padded ("025275") and stripped ("25275"), against `orderNum` AND `poNum` (the Shopify number). Codes under 4 characters are ignored silently, since those are stray keystrokes. **If a real sheet ever fails to match, fix the matcher, not the claim/start paths.**

## shipping.html (parcel scan & pack)

Global keydown buffer has two modes. Pick overlay open → `handleScan` (part scan, unchanged). No order open → `handleOrderScan`, which searches Multi/Ind/Warranty (`poNum` was added to the `/api/ship/queues` payload for this).

Resolution order: my claimed bin → resume. Claimed by someone else → red flash naming them. Excluded or unshippable → red flash with the reason. No cart → "Pick a cart first". Single pickable unit → auto-claim into `nextFreeLetter()` then `openPick` (zombies get the repack-confirm). Multiple Ind line-units → `oscan-modal` chooser, **never a guess**.

## line.html Pack & Ship (the most-used one)

Two entry points:

1. Global `sheetBuf` keydown buffer for when no scan box exists. Pack view only, bails on `.reason-overlay` open and on focused inputs.
2. `packScan()` intercept: a code scanned into the ITEM box that order-matches goes to `handlePackOrderScan` **UNLESS the code exactly equals a part number on the ACTIVE order**. Item scan wins, so a part like "MR-25320" cannot hijack the scanner to order #25320. This is tested.

Resolution: in-progress → `setPackActive` (green "Scanner → #x"). Upcoming → `POST /api/pack/start` then set `packActiveKey = key` explicitly (plain `startPack` does NOT hand over the scanner) then `loadPack`. Packed → info flash "already packed". No match → red flash naming the line.

## Gotchas

- Keydown buffers must bail on overlays, modals, and focused inputs on both pages.
- UPC item barcodes cannot false-match: a 12-digit code yields one 12-digit run, not sub-runs.
- jsdom KeyboardEvent-dispatch is the test pattern for the scanner. A mock `/api/pack/start` must move the order into `inProgress` or the post-start `loadPack` re-render falls back to `jobs[0]`.

Related: [line-packing](line-packing.md), [shipping-per-line-units](shipping-per-line-units.md), [scan-focus-rule](scan-focus-rule.md)
