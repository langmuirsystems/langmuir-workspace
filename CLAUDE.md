# Langmuir Production Management — Workspace Guide

This workspace centralizes Langmuir's production systems so they can be edited and
deployed from one place. Each system stays in its own git repo (so Railway only
restarts the service that actually changed) but they all live as siblings under this
folder, which is itself the repo `langmuir-workspace`.

Start with `README.md` for the map, `SYSTEM-STATE.md` for which repo serves what, and
`docs/knowledge/` for why things are built the way they are.

## Scope every request first — this folder is the REAL system

**This folder is Langmuir's live, real production system.** Real customer names,
real work-order data, real Railway services. Treat everything in it as sensitive and
internal.

It is easy to conflate this with **Finn Operations**, Brendan's separate
consulting/showroom brand (finnoperations.com), because Finn Operations is *built
from* this system. It is an anonymized, SpaceX-styled clone with generic names
("Production Line 1") and "ghost functionality" for demoing capabilities to
prospects and investors. But the showroom, the private business-planning app
(ops-hub), and client-specific pitch demos (e.g. DYC) all live in a **different,
separate folder** ("Anonymized ERP Clone") that is **not mounted in this
workspace**. If it isn't mounted here, Claude cannot read or edit it in this
session.

Before starting any request in this project, triage which world it's in:

- **Real Langmuir ops** (this folder) — changes to `pms/`, `pms-test/`, `ci/`,
  `hub/`, `procurement/`, `tooling/`, `scheduling/`, `vision/`, `bom/`,
  `google-scripts/`, or anything touching real production/inventory data. Proceed as
  documented below.
- **Finn Operations showroom, ops-hub, or a client demo** (MRP module, DYC quoting
  tool, `/pricing`, `/results`, hub tours, Railway service `brendan-showroom`, repo
  `ShowroomPMS`/`FinnOpsHub`) — this needs the "Anonymized ERP Clone" folder, not
  this one. If that folder isn't connected in the current session, say so and ask
  rather than guessing or trying to recreate showroom logic here.
- **Ambiguous** ("update the production board," "add a module") — ask which world
  before touching files. Getting this wrong risks either editing the wrong (live)
  system or leaking real Langmuir data/branding into a public demo.

**Hard rule:** never copy real customer names, real work-order/production data, or
Langmuir branding out of this folder into anything showroom- or demo-related. The
anonymization has to happen deliberately, not by reusing real files as a shortcut.

## Current state — read SYSTEM-STATE.md first

`SYSTEM-STATE.md` is the ground-truth map of which repo/service serves each feature.
**pms is the center of gravity, and modules keep migrating into it** (the KPI board
and cycle count both did). Before editing any feature, confirm which repo serves it now.
Retired snapshots live in `_archive/` and must not be edited expecting production
changes.

## Read the knowledge base before changing a subsystem

`docs/knowledge/` holds the decisions and gotchas that are not derivable from the
code. Before working in an area, read its file:

| Working on | Read first |
|---|---|
| Packing at the line, "missing" orders | `docs/knowledge/line-packing.md` |
| The Individual parcel queue | `docs/knowledge/shipping-per-line-units.md` |
| `/freight`, bookings, weights, addresses | `docs/knowledge/freight-booking.md` |
| An order appearing in no queue | `docs/knowledge/freight-via-crack.md` |
| Which line an order shows up on | `docs/knowledge/line-routing.md` |
| Any barcode scanning | `docs/knowledge/order-sheet-scan.md` + `scan-focus-rule.md` |
| Cycle count or the Epicor export | `docs/knowledge/cycle-count-epicor.md` |
| The CI / support boards | `docs/knowledge/ci-support-intake.md` |
| Any new page or styling | `docs/knowledge/ui-style.md` + `branding-assets.md` |

`docs/RUNBOOK.md` is the diagnostic path when something is broken right now.

## Layout

```
.
├── pms/                  # LangmuirPMS — the operator system (Railway: langmuir-pms)
│                         #   includes /kpi, /cyclecount, /freight, line boards
├── pms-test/             # LangmuirPMS_Test — staging clone
├── ci/                   # langmuir-ci — CI + support intake boards
├── hub/                  # langmuirhub — landing portal
├── procurement/          # Langmuir-procurement — supply chain decision support
├── scheduling/           # LangmuirScheduling
├── tooling/              # langmuir-tooling (Sheet-backed)
├── vision/               # LangmuirVision — part ID by photo
├── bom/                  # langmuir-bom — BOM manager
├── google-scripts/       # clasp-managed: pms-locations (LIVE ledger), tooling-sheet
├── scripts/              # helper scripts; config.sh is the single source of truth
├── techsupport/          # Epicor API / access reference docs
├── docs/                 # knowledge base, runbook, org-transfer guide
├── _archive/             # retired systems (editing these changes nothing)
├── README.md             # start here
├── SYSTEM-STATE.md       # ground-truth service map — keep updated when anything migrates
└── CLAUDE.md             # this file
```

The nine service folders are separate git repos and are gitignored here.

## How Claude should use this workspace

**Important:** the sandbox where Claude runs shell commands can read and write files
in this folder, but can't reliably run `git commit`/`git push` or `clasp pull/push`
against the mount (deletes are blocked, which breaks git's lock-file dance). So the
workflow is:

- **Claude edits files** directly in the relevant subfolder using Read/Write/Edit.
- **The human runs git themselves** — Claude proposes the exact command or the exact
  GitHub Desktop steps.

Standard flow when a change is requested:

1. Check `SYSTEM-STATE.md` for which repo serves the feature.
2. Check `docs/knowledge/` for that subsystem's rules.
3. Edit files in the relevant subfolder.
4. Show the diff and wait for approval.
5. On approval, hand over the exact steps.

**On a Mac (Terminal):**

```
cd ~/Documents/Claude/Projects/Langmuir\ Production\ Management\ System
./scripts/sync-repo.sh pms push "fix: corrected line totals"
./scripts/sync-gscript.sh pms-locations push
./scripts/status.sh
```

**On Windows (GitHub Desktop):** select the repo → review the Changes tab → write a
commit message → Commit to main → Push origin. The `scripts/*.sh` helpers also run
in Git Bash if a change spans several repos.

When a change spans several repos at once (a shared style, a logo, a header tweak),
point at `./scripts/push-all.sh`, which walks every repo in `config.sh` with pending
work:

```
./scripts/push-all.sh -n                              # dry run: preview every repo
./scripts/push-all.sh -m "fix: langmuir torch mark"   # confirm each repo, y/n/a/q
./scripts/push-all.sh -y -m "msg" pms hub ci          # no prompts, only these repos
```

It commits with `git add -A`, so always run `-n` first. If a repo has unrelated work
in flight, push that one on its own with `./scripts/push.sh <repo> "its own message"`.

## Adding a new system

- **New GitHub repo:** add a line to `REPOS=( ... )` in `scripts/config.sh` (the URL
  is built from `GH_ORG`), then run `./scripts/bootstrap.sh`.
- **New Google Script:** find its Script ID (script.google.com → Project Settings),
  add a line to `GSCRIPTS=( ... )` in `scripts/config.sh`, then run
  `./scripts/bootstrap.sh`.

Then add a row to `SYSTEM-STATE.md` and, if it deploys, a Railway service.

## Prerequisites (one-time, per machine)

- `git` — preinstalled on macOS; on Windows install Git for Windows, and see
  `WINDOWS-SETUP.md` for the three required `git config` settings.
- `node` (LTS) — to run any service locally.
- `clasp` for Google Scripts: `npm install -g @google/clasp`, then `clasp login`.
- **Git auth:** repos live in the `langmuirsystems` GitHub org and authenticate over
  HTTPS. GitHub Desktop and Git Credential Manager handle the login through the
  browser on both macOS and Windows, so there are no SSH keys to replicate.
  Historically the Mac used a `github-langmuir` SSH host alias defined in
  `~/.ssh/config`; that alias exists on exactly one machine and is being retired.
  See `docs/GITHUB-ORG-TRANSFER.md`.

## Important deployment notes

- **The KPI board and cycle count are pms pages now** (`/kpi`, `/cyclecount`). Their
  old standalone repos are retired in `_archive/`. The separate-repo principle still
  applies to the remaining services: a commit to one repo only restarts that service.
- **Apps Script bound to a Sheet/Doc** is fine for clasp — the script ID is what
  matters. After `clasp push`, the new code is live in that Sheet immediately.
  `pms-locations` is the live inventory ledger; there is no undo. Practice on
  `tooling-sheet`.
- **Never commit secrets.** Service config lives in Railway → Variables. Apps Script
  secrets go in Project Settings → Script Properties.
- A repository transfer between GitHub accounts or orgs does **not** restart a
  Railway service; it only pauses auto-deploy until the GitHub App is reauthorized.
