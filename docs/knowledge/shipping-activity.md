# Shipping activity history

*Filterable full pick history on the Activity tab, 2026-07-27.*

`/api/ship/pick-log` (`pms/shipping.js`) accepts query params `order` / `user` / `part` / `from` / `to` / `before-cursor` / `limit` (max 500). A parametrized WHERE builder is shared across `ship_picks` and `ship_order_events`. The first page returns events (400 cap when order-filtered); cursor pages return picks only, with `hasMore` / `nextBefore`.

The Activity tab (`pms/public/shipping.html`) got a filter bar (order #, person, part, date range, Enter to search) plus "Load older picks" paging. Voided picks show struck-through.

**Keep the `hasMore` / `nextBefore` contract if you touch this endpoint.** Frontend state lives in `state.act`.

## Context

Built to investigate a shipment error on **order #111993** (around 2026-07-20). That investigation is still open. The live API returns 403 to outside fetches and the CI MCP has no per-order query, so per-order digging happens in the UI.
