# BOM Manager (langmuir-bom)

*New service built 2026-07-24. OpenBOM-style working BOMs seeded from Epicor.*

Built at Brendan's request: "openBOM-like solution, iterable, seed from Epicor, teach good process control."

## Decisions

- **Working copy + Epicor baseline.** Epicor stays the production master; drift views and manual promotion close the loop.
- **New standalone service** `bom/` (repo `langmuir-bom`, Railway `langmuir-bom`).
- Full v1 scope: tree / flat / where-used, cost + purchasing view, edits + snapshots + audit log, xlsx/csv import and export, plus `/guide`, the in-app tutorial and process-control playbook.

## Key facts

Tables are prefixed `bom_` so it can share the pms Postgres (the ci pattern). Feeds: `BF_PartBOM` (REST keys `PartMtl_PartNum` / `MtlPartNum` / `QtyPer` confirmed), `BF_PartMaster`, `BF_OpenPOs`, all already live in Epicor since scheduling syncs them. `BF_Suppliers` + `BF_POReceipts` are optional enrichment and may need building or REST-publishing.

Ingest key-detection is tolerant; verify via `/api/status`. Sync seeds working BOMs only on first sight of a parent and **never overwrites edits**. Reset-to-baseline is the one explicit exception. Writes are PIN-gated (`BOM_PIN`) plus an `X-Actor` name.

## Why

The BOM process was, in Brendan's words, "an absolute disordered mess". The working-copy model keeps half-finished engineering ideas out of Epicor, which drives jobs and costing.

## Deploy status

Pending as of this writing. Needs the GitHub repo, the Railway service, and `DATABASE_URL` + `EPICOR_*` + `BOM_PIN`. `config.sh` already has the `bom` entry and SYSTEM-STATE.md has its row. If `BF_PartMaster` lacks `StdUnitCost` / `OnHand` columns, costs and on-hand show "–" until they are added to the BAQ. Consider a hub card once live. v2 ideas are in `bom/DESIGN.md`.
