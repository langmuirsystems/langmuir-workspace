# System Turnover Plan

Written 2026-07-30. Audience: me (Brendan) doing the handover, and whoever picks
this up after.

---

## 1. The short answer on repo structure

**Keep the nine service repos separate. Add a tenth repo for the workspace
itself. That tenth repo is the thing that is missing today.**

The nine are separate for a reason that still holds: Railway watches one repo per
service and redeploys that whole service on every push. Nine repos means nine
independent blast radii. A bad commit in `vision` cannot take down `pms`. If I
merged them into a monorepo, a one-line change to a shared header would restart
all nine services at once, and I would have to configure per-service root
directories and watch paths in Railway to get back to where I already am. That is
a real migration with a real chance of breaking production, and starting it the
same week as a turnover is the wrong trade.

So the structure is fine. The problem is somewhere else.

## 2. The actual gap

The workspace root is not a git repo. I confirmed this: `git remote -v` at the
root returns nothing, and there is no `.git` folder there. Everything below is on
exactly one hard drive, my MacBook, with no copy anywhere else:

| Stranded at root | Why it matters |
|---|---|
| `CLAUDE.md` | The operating instructions for Cowork. Without it a new session has no idea pms is the center of gravity, or that `_archive/` is dead code. |
| `SYSTEM-STATE.md` | The ground-truth map of which repo serves which feature. |
| `scripts/` (13 files) | `config.sh` is the registry of all nine repos and both Apps Scripts. `bootstrap.sh`, `push-all.sh`, `status.sh`, `sync-repo.sh`, `sync-gscript.sh`. This is the entire sync tooling. |
| `google-scripts/pms-locations/` | Source for the **live inventory ledger**. Cycle count reads and writes it. It is clasp-managed, which means the only copies are Google's and mine. |
| `google-scripts/tooling-sheet/` | Backend for the tooling request board. Same situation. |
| `techsupport/` (5 docs) | Epicor API setup, access checklist, framework. How you get credentials at all. |
| `*.baq` files (3 at root) | Epicor BAQ query definitions for shipping. These are production config. |
| `PROJECT_HANDOFF.md`, `INVENTORY_DECOUPLING_PLAN.md`, `MCP_PIPELINE_PLAN.md` | Pending work, still relevant. |
| `Langmuir_Systems_Owners_Handbook.pdf`, `TechSupport.pdf`, `Warranty-Misshipment-BAQ-Guide.docx` | Reference material. |

That is the answer to "what all is going to be required." Not a restructure. One
new repo that holds the layer above the nine.

## 3. Target structure

```
langmuirsystems/langmuir-workspace     ← NEW. The root layer. Clone this first.
langmuirsystems/LangmuirPMS            ← pms/        (the center of gravity)
langmuirsystems/LangmuirPMS_Test       ← pms-test/
langmuirsystems/langmuir-ci            ← ci/
langmuirsystems/langmuirhub            ← hub/
langmuirsystems/Langmuir-procurement   ← procurement/
langmuirsystems/LangmuirScheduling     ← scheduling/
langmuirsystems/langmuir-tooling       ← tooling/
langmuirsystems/LangmuirVision         ← vision/
langmuirsystems/langmuir-bom           ← bom/
```

`langmuir-workspace` gets a `.gitignore` that excludes the nine service folders,
so the nine clone into place as subfolders and git ignores them. I am
deliberately **not** using git submodules. Submodules put you in detached HEAD by
default, need a two-step commit, and let you push a stale pointer without
noticing. For someone who is new to git that is a trap, and the payoff is small.
The bootstrap script already does the same job in a way you can read.

All ten repos **private**. The workspace repo has BAQ names, Apps Script IDs, and
Epicor host references in it.

## 4. Checklist, in order

### Phase 0 — unblock the transfer

The org already exists (`langmuirsystems`) and the director is already its owner.
The blocker is on my side: I am an **outside collaborator**, which carries no
org-level permissions, and GitHub requires permission to create repos in the target
org before it will offer that org in the transfer dialog. That is why it only ever
offers "create a new organization."

Full detail and the exact click paths are in **`docs/GITHUB-ORG-TRANSFER.md`**. Send
that file to him. Short version:

- [ ] He invites me to `langmuirsystems` as a **Member** (Settings → People →
      Invite member). Outside collaborator does not upgrade on its own.
- [ ] He confirms Settings → Member privileges → **Repository creation** has
      **Private** enabled. If only Public is on, the transfer fails with a confusing
      visibility error instead of a permission one.
- [ ] I confirm 2FA is on for my account. The org badge says 2FA required.
- [ ] I accept the invite, then re-open the transfer dialog. `langmuirsystems`
      should now appear.

### Phase 1 — move the nine repos into the org

For each repo: Settings → General → scroll to bottom → Danger Zone → Transfer
ownership → type the repo name → pick `langmuirsystems`.

**Nothing restarts.** A transfer is not a push, so Railway triggers no build and
recycles no container. The running service keeps serving the commit it already has.
GitHub sets up a permanent redirect from the old `BrendanLangmuir/<repo>` URL, so
local clones keep working, and webhooks, secrets and deploy keys survive the move.
The only thing that breaks is *future* auto-deploys, until the Railway GitHub App is
authorized on the org. That failure mode is "I pushed and nothing happened," not an
outage. `docs/GITHUB-ORG-TRANSFER.md` has the reconnect steps and the sources.

**Do `LangmuirPMS_Test` first as a canary.** Nothing on the floor depends on it and
it exercises the identical Railway path. Transfer it, confirm the service is still
up, push a trivial commit, and see whether Railway builds it. Now you know whether
the GitHub App needs reauthorizing before you touch the other eight. Leave
`LangmuirPMS` for last.

- [ ] LangmuirPMS_Test  ← canary, do this one first
- [ ] langmuirhub
- [ ] langmuir-tooling
- [ ] LangmuirVision
- [ ] Langmuir-procurement
- [ ] langmuir-bom
- [ ] LangmuirScheduling
- [ ] langmuir-ci
- [ ] LangmuirPMS  ← last

**Never delete and recreate a Railway service to fix a connection problem.**
Recreating loses the environment variables and causes the outage you were avoiding.

### Phase 2 — switch every remote to HTTPS

Right now eight of nine remotes look like this:

```
git@github-langmuir:BrendanLangmuir/LangmuirPMS.git
```

`github-langmuir` is a host alias I defined in `~/.ssh/config` on my Mac. It does
not exist anywhere else. On the director's Windows machine that URL resolves to
nothing and every clone fails with a confusing DNS error. This is the single
biggest Mac-to-Windows landmine in the whole setup.

The fix is to move both machines to HTTPS. GitHub Desktop logs in through the
browser and Git Credential Manager stores the token, so there are no SSH keys, no
`~/.ssh/config`, and no passphrase prompts on either side. One config file that
works identically on both machines is worth more than whatever I was getting from
the SSH alias.

Run from the workspace root in Terminal, after the transfers:

```bash
for d in pms pms-test ci hub procurement scheduling tooling vision bom; do
  echo "--- $d"
  git -C "$d" remote -v | head -1
done
```

The updated `config.sh` already has `GH_ORG="langmuirsystems"` filled in and builds
HTTPS URLs from it. `./scripts/repoint-remotes.sh` (see Phase 3) then rewrites all
nine remotes in one pass.

### Phase 3 — create the workspace repo

The files are already sitting in the workspace root and in `scripts/`. The new
`config.sh` is delivered as **`scripts/config.sh.new`** on purpose, so it does not
break the current sync scripts before the org transfer is done.

1. Open `scripts/config.sh.new` and fill in `GH_ORG` at the top with the real org
   slug.
2. Swap it in:

```bash
cd ~/Documents/Claude/Projects/Langmuir\ Production\ Management\ System
mv scripts/config.sh scripts/config.sh.pre-turnover
mv scripts/config.sh.new scripts/config.sh
./scripts/repoint-remotes.sh            # dry run, read the output
./scripts/repoint-remotes.sh --apply    # rewrites all nine remotes to HTTPS
./scripts/status.sh                     # confirm all nine still talk to GitHub
```

3. Then put the root under version control:

```bash
cd ~/Documents/Claude/Projects/Langmuir\ Production\ Management\ System
git init
git add -A
git status          # READ THIS. Confirm no .env, no service folder, no BAQ dump.
```

Stop and actually read that `git status` before committing. If anything under
`pms/`, `ci/`, `_archive/`, or any `.env` shows up, the ignore rules are wrong and
I would be committing secrets and 22 MB of dead code.

```bash
git commit -m "chore: workspace root under version control"
git branch -M main
git remote add origin https://github.com/langmuirsystems/langmuir-workspace.git
git push -u origin main
```

Create the empty `langmuir-workspace` repo on GitHub first (private, no README,
no gitignore, nothing, or the push will conflict).

### Phase 4 — the things GitHub will never hold

GitHub gets code and docs. It does not get secrets, and it should not. Here is
what has to be handed over out-of-band, per service. Values live in Railway →
service → Variables. I pulled these names straight out of the code, so this list
is complete as of today.

| Service | Env vars it reads |
|---|---|
| pms | `ALLOWED_IPS` `CC_CONSUMPTION_BAQ` `CC_ONHAND_BAQ` `CC_ONHAND_FRESH_MIN` `CC_ONHAND_WAIT_MS` `CC_SCRAP_BAQ` `CI_URL` `DATABASE_URL` `EPICOR_API_KEY` `EPICOR_COMPANY` `EPICOR_HOST` `EPICOR_PASS` `EPICOR_USER` `EXPORT_EXTRA_DBS` `FEEDBACK_TOKEN` `KPI_IMPORT_URL` `KPI_INVENTORY_BAQ` `KPI_PRODUCTION_BAQ` `KPI_SHIPMENTS_BAQ` `KPI_SYNC_MINUTES` `LABEL_TZ` `LOCATIONS_URL` `MCP_TOKEN` `PICKER_PIN` `PORT` `PROCUREMENT_URL` `SHEETS_URL` `SHIP_ADDR_BAQ` `SHIP_ASSEMBLED_BAQ` `SHIP_FREIGHT_BAQ` `SHIP_FREIGHT_VIAS` `SHIP_SYNC_MS` `VISION_TOKEN` `VISION_URL` |
| pms-test | `ALLOWED_IPS` `LOCATIONS_URL` `PICKER_PIN` `PORT` `SHEETS_URL` |
| ci | `ALLOWED_IPS` `DATABASE_URL` `LOCATIONS_URL` `PMS_URL` `PORT` |
| hub | `PORT` |
| procurement | `APPS_SCRIPT_URL` `PORT` `PURCHASER_PIN` |
| scheduling | `ALLOWED_IPS` `DATABASE_URL` `EPICOR_API_KEY` `EPICOR_BAQS` `EPICOR_COMPANY` `EPICOR_HOST` `EPICOR_PASS` `EPICOR_USER` `KPI_URL` `LOCATIONS_URL` `MANAGER_PIN` `PMS_LINE_URL` `POLL_INTERVAL_MS` `PORT` `TZ_NAME` |
| tooling | `AI_BUDGET_USD` `ALLOWED_IPS` `ANTHROPIC_API_KEY` `PORT` `QUEUE_PIN` `SHEETS_URL` |
| vision | `DATABASE_URL` `PORT` `VISION_FAKE` `VISION_TOKEN` |
| bom | `BOM_PIN` `DATABASE_URL` `EPICOR_API_KEY` `EPICOR_BAQS` `EPICOR_COMPANY` `EPICOR_HOST` `EPICOR_PASS` `EPICOR_USER` `POLL_INTERVAL_MS` `PORT` |

Handover items:

- [ ] **Railway.** Invite him to the Railway project. He needs deploy rights and
      the ability to read Variables. Without this he can push code that never
      ships.
- [ ] **Epicor.** `EPICOR_USER` / `EPICOR_PASS` / `EPICOR_API_KEY` are a Langmuir
      Epicor account. Decide now: does he get his own API user, or do we document
      the shared service account? `techsupport/EPICOR_API_SETUP.md` and
      `techsupport/ACCESS_CHECKLIST.md` cover the process. Getting him his own is
      cleaner, and it means my credentials can be revoked without an outage.
- [ ] **Google Apps Script.** `pms-locations` is the live inventory ledger. He
      needs edit access on that script and the Locations sheet, plus
      `npm install -g @google/clasp` and `clasp login` on his machine.
- [ ] **The shop IP allowlist.** pms, ci, pms-test, scheduling and tooling all
      read `ALLOWED_IPS`. If he works from anywhere other than the shop, his IP
      has to be added or the apps will look broken to him.
- [ ] **The PINs.** `PICKER_PIN`, `MANAGER_PIN`, `PURCHASER_PIN`, `QUEUE_PIN`,
      `BOM_PIN`. Written down somewhere he can find them.
- [ ] **Postgres.** `DATABASE_URL` is shared across pms, ci, vision, scheduling and
      bom. Confirm he can reach it and that there is a backup schedule. If there
      is no backup on that database, that is a bigger risk than anything else on
      this page.

### Phase 5 — his machine

See `WINDOWS-SETUP.md`. That doc is written for him, not for me, and it lives in
the workspace repo so it is the first thing he reads after cloning.

### Phase 6 — prove it before I stop being the backstop

Do not call this done because the clone worked. Have him do a real change end to
end while I am watching:

- [ ] Pull latest on pms in GitHub Desktop.
- [ ] Make a visible, harmless change (change a label on a page).
- [ ] Commit and push from GitHub Desktop.
- [ ] Watch Railway build it.
- [ ] See the change live at langmuirproduction.up.railway.app.
- [ ] Do the same round trip on one Apps Script (`clasp push` on `tooling-sheet`,
      not `pms-locations`, since that one is the live ledger).
- [ ] Open Cowork on his machine in the cloned folder, and confirm it reads
      `CLAUDE.md` and `SYSTEM-STATE.md` and answers a "which repo serves the KPI
      board" question correctly.

If any of those six fails, the turnover is not finished, whatever the checklist
says.

## 5. Two things I should decide, not drift into

**Project memory.** The Cowork project memory (13 topic files: the system map,
line packing, freight booking, the scan-focus rule, the shipping units key, and
so on) lives in the Claude desktop app's local storage on my Mac. It does not
travel through GitHub and it will not appear on his machine. That is a real chunk
of institutional knowledge, mostly the "why" behind decisions that are not
obvious from the code. I can export those files into
`langmuir-workspace/docs/knowledge/` so they survive and he can re-seed his own
memory from them. Worth doing before I hand over, not after.

**The open cleanup items in SYSTEM-STATE.md.** Four of them are still open
(archive the retired KPI and CycleCount repos, delete the old Railway services,
verify scheduling's `KPI_URL`, delete the retired `production-data` Apps Script
triggers). Handing over a system with known-dead services still running is how
someone spends a day debugging a thing that was never supposed to be there. Clear
these first.
