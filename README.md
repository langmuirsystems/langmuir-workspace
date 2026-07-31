# Langmuir Production Systems — Workspace

This is the root of Langmuir's internal production software. It is one project made
of ten repositories: this one, plus nine services that each deploy independently.

**If you just cloned this and do not know what to do next, read
[`WINDOWS-SETUP.md`](WINDOWS-SETUP.md).** It walks through installing everything and
getting the other nine repos onto your machine.

---

## What lives where

This repository holds the layer above the services: the documentation, the sync
scripts, the Epicor reference material, and the Google Apps Script sources. It does
not run anything by itself.

The nine service repositories clone **into this folder** as subfolders. They are
listed in `.gitignore` so git ignores them here; each one is tracked by its own
repo.

| Folder | Repository | Railway service | What it is |
|---|---|---|---|
| `pms/` | LangmuirPMS | langmuir-pms | **The main operator system.** Picker, receiving, shipping, freight, cycle count, KPI board, line boards, feedback API, MCP server. Most work happens here. |
| `pms-test/` | LangmuirPMS_Test | langmuir-pms-test | Staging clone. Lags behind pms. Practice here. |
| `ci/` | langmuir-ci | langmuir-ci | Continuous improvement and support intake boards. |
| `hub/` | langmuirhub | langmuir-hub | Landing portal linking every tool. |
| `procurement/` | Langmuir-procurement | langmuir-procurement | Supply chain decision support. |
| `scheduling/` | LangmuirScheduling | langmuir-scheduling | Production scheduling. |
| `tooling/` | langmuir-tooling | langmuir-tooling | Tooling request board. Sheet-backed. |
| `vision/` | LangmuirVision | langmuir-vision | Part identification by photo. |
| `bom/` | Langmuir-bom | langmuir-bom | BOM manager, seeded from Epicor. |

Not folders, but part of the system:

- `google-scripts/pms-locations` — **the live inventory ledger.** Cycle count reads
  and writes it; shipping subtracts through it. Managed with `clasp`. A push is
  immediate and has no undo.
- `google-scripts/tooling-sheet` — backend for the tooling board.
- Epicor BAQs — read-only queries the services depend on. They live in Epicor, not
  here. The three `.baq` files at the root are exported definitions for reference.

---

## The one rule

**`pms` is the center of gravity, and features keep migrating into it.**

The KPI board and cycle count both used to be their own services and are now pages
inside pms. Their old code is still on disk under `_archive/`, where editing it
changes nothing in production. Someone has already lost a day to this.

Before changing any feature, check [`SYSTEM-STATE.md`](SYSTEM-STATE.md) to confirm
which repo serves it now.

---

## Where to look for what

| I want to... | Read |
|---|---|
| Set up my machine | [`WINDOWS-SETUP.md`](WINDOWS-SETUP.md) |
| Know which repo serves a feature | [`SYSTEM-STATE.md`](SYSTEM-STATE.md) |
| Understand why something was built that way | [`docs/knowledge/`](docs/knowledge/) |
| Fix something that is broken right now | [`docs/RUNBOOK.md`](docs/RUNBOOK.md) |
| Get Epicor API access | [`techsupport/ACCESS_CHECKLIST.md`](techsupport/) |
| Reconnect Railway after a repo move | [`docs/GITHUB-ORG-TRANSFER.md`](docs/GITHUB-ORG-TRANSFER.md) |
| See the full handover checklist | [`TURNOVER-PLAN.md`](TURNOVER-PLAN.md) |

`docs/knowledge/` is the part that is hardest to reconstruct. It is the reasoning
behind decisions that look arbitrary in the code: why Individual-queue lines ship
separately, why ship-via is not proof that freight owns a line, why a scan box must
never refocus on a timer. Read the relevant file before changing that area.

---

## Daily workflow

**Two people push these repos.** Pull before anything is edited, not before it is
pushed. Editing a stale clone is how a fix gets quietly reverted.

1. `./scripts/pull-all.sh` — first thing, every session, before any editing starts.
2. Make the change. Cowork can do the editing; review the diff yourself.
3. `./scripts/push.sh <repo> "message"` — pulls `--rebase`, then pushes. On Windows,
   GitHub Desktop: Fetch origin, Pull, then Commit and Push.
4. Railway rebuilds that one service. Usually under two minutes.
5. Check the live page.

For a change that spans several repos at once, `./scripts/push-all.sh -n` previews
every repo with pending work. Run the dry run first; it commits with `git add -A`.
The workspace root is not in `push-all.sh`; it has its own
`./scripts/push-workspace.sh`.

---

## Secrets

None of the credentials are in git and none of them should be. Every service reads
its configuration from environment variables set in **Railway → the service →
Variables**: database URLs, Epicor credentials, PIN codes, API keys.

To run a service locally, create a `.env` in its folder from the Railway values.
Some repos have a `.env.example` showing the shape. `.env` is gitignored
everywhere. Do not override that.

Apps Script secrets go in Project Settings → Script Properties, never in the code.

The full per-service environment variable list is in
[`TURNOVER-PLAN.md`](TURNOVER-PLAN.md).

---

## Things that will bite you

- **The order number confusion.** `order_num` in pms is the Epicor number (25xxx).
  The "Shopify order" people quote on the floor is `OrderHed_PONum` (111xxx). When
  someone gives you an order number, ask which one.
- **Orders that look missing usually are not.** Daily part exclusions hide an entire
  order when any line carries an excluded part, and they expire at Chicago midnight.
  Check `queues.exclusions` in `/api/ship/queues` first.
- **Epicor's Query Test runs the open BAQ design; REST runs the saved query.** They
  can disagree. Save before testing through the API.
- **BAQs need the `BF_` prefix and must be marked Shared** on this Epicor SaaS
  instance, or the app cannot read them.
- **Do not run git commands from inside a Cowork sandbox** against this folder. It
  leaves stale `index.lock` files. Let Cowork edit, then commit yourself.
