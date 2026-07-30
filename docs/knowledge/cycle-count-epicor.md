# Cycle count to Epicor export

*EOD rows finalize at confirm time (immediate export). No 06:30 wait. Built 2026-07-29.*

A `cc_eod` row is finalized the moment its count is confirmed, so the Epicor DMT adjustment is exportable seconds after counting. Files: `pms/cyclecount.js`, `pms/public/cyclecount-count.html`, `pms/public/cyclecount-eod.html`. Deploy = push pms to Railway; the schema migrates itself (`ALTER ... IF NOT EXISTS` on `cc_eod` for `session_id`, `exported_at`, `entered_at`).

## Decisions Brendan made

- Export file available instantly. **No REST write to Epicor.** Everything Epicor-side is still read-only BAQ GETs.
- Past 5 days a row is flagged **stale**, not expired. It keeps recomputing (45-day cap unchanged). Setting: `cc_settings.count_valid_days` = 5.
- Export lives on BOTH the count screen (that count only, `?session=`) and the EOD page (batch).
- Export **auto-marks entered**. POST marks; GET is a preview that does not. Undo per row if the DMT load fails.

## Why the design is what it is

- `refreshOnHandIfStale()` pulls the on-hand BAQ before finalizing at confirm. The hourly cache can be 59 minutes old, which the next-morning flow did not care about but an immediate upload does. Bounded by `CC_ONHAND_WAIT_MS` (12s) so slow Epicor cannot hang the count screen; falls through to cache.
- Immediate finalize is wrapped in try/catch and never fails the confirm. The count and inventory overwrite are already committed.
- `finalizeEod({ids, refreshOnHand})` scopes to one row and skips the consumption/scrap BAQs entirely when every open row was counted today (those BAQs stop at yesterday anyway).
- `openEodRows` uses `DISTINCT ON (lower(part_num))`. Two adjustment lines for one part in one DMT file would both post and double-correct. `markExported` closes superseded older rows too. A re-count also deletes its own open row before inserting.

## Known limitation, state it plainly if asked

Consumption and scrap come from DAILY BAQs covering through yesterday, so material issued between the count and a same-day upload is not in the adjustment. Upload right after counting, or let the row ride to the morning recompute.

## Open question: writing to Epicor directly

The blockers are Epicor-side, not code. The service account is likely read-only, the API key's Access Scope is probably `BaqSvc`-only, the license type may not permit writes, and the exact adjustment BO/method needs confirming against the instance's own `/api/help`.

Related: [system-map](system-map.md)
