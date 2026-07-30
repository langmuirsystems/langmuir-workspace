# System map

*Which repo serves which feature. Check this BEFORE editing.*

**`pms/` (repo `LangmuirPMS`, service `langmuirproduction.up.railway.app`) is the center of gravity. Features keep migrating INTO it** (KPI board 2026-07-21, cycle count). Before editing any feature, confirm which repo serves it now via `SYSTEM-STATE.md` at the workspace root.

Why this warning exists: the KPI-board restyle on 2026-07-23 was first applied to the stale standalone `kpi/` folder. The KPI board had already moved into pms (`pms/kpi.js` + `pms/public/kpi.html`). A day of work changed nothing in production.

## Workspace reorganization, 2026-07-23

Retired and completed items moved to `_archive/`: kpi, cyclecount, google-scripts production-data, the ShopSabre kit, warranty-analysis, reorder-points planning, and one-off analyses. See `_archive/README.md`.

Live services are all top-level now: `pms`, `pms-test`, `ci`, `hub` (the langmuirhub portal), `procurement`, `scheduling`, `tooling`, `vision`, `bom`.

Active Apps Scripts: `pms-locations` (the **live inventory ledger**) and `tooling-sheet`. `scripts/config.sh` is the repo and script registry.

## How to apply

Grep `pms/server.js` module wiring and `pms/public/` for pages first. **Never edit `_archive/` expecting production changes.** Keep `SYSTEM-STATE.md` updated when anything migrates.

Avoid running `git status` or commits on the mounted repos from a Cowork sandbox. It leaves stale `index.lock` files. Run git from Terminal, or from GitHub Desktop on Windows.
