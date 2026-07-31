# Handoff — GitHub connector test (2026-07-30)

For the next Cowork session. Zack (zack@langmuirsystems.com) has taken ownership
of the Langmuir production systems. Machine setup is complete; this session's
goal is to test the newly added GitHub connector by pushing a pending change.

## Current state

- Full sync done on this Windows machine at `C:\Langmuir`:
  - All 10 repos cloned from the `langmuirsystems` org over HTTPS
    (workspace at root + pms, pms-test, ci, hub, procurement, scheduling,
    tooling, vision, bom).
  - Both Google Scripts pulled via clasp (clasp 3.3.0, Node v24, logged in).
    Note: clasp 3.x saves `Code.js`, not `Code.gs`.
  - `scripts/config.sh` replaced with the turnover version (from config.sh.new).
- Zack owns Railway and the GitHub org. GitHub connector was added to Cowork
  but its tools did not appear in the previous session (added mid-session).

## Task 1 — the actual test

`hub/public/index.html` line ~92 has an UNCOMMITTED, UNPUSHED edit:

    - <div class="btm">Operations Hub</div>
    + <div class="btm">Operations Hub - Now owned by Zack</div>

Push this to `langmuirsystems/langmuirhub` branch `main` using the GitHub
connector (API commit). Then:

1. Tell Zack to watch the `langmuir-hub` service build in Railway (~2 min).
2. Verify the live hub page shows the new header.
3. IMPORTANT: have Zack Pull in GitHub Desktop for `hub` afterward — an API
   push leaves the local clone one commit behind. If the connector still has
   no tools, fall back to GitHub Desktop (commit + Push origin).

## Task 2 — leftover commit

`langmuir-workspace` (repo at `C:\Langmuir` root) has 4 uncommitted files
from setup that Zack never committed:

- `scripts/config.sh` (turnover config swap)
- `google-scripts/tooling-sheet/Code.gs` (deleted)
- `google-scripts/tooling-sheet/Code.js` (added, identical content)
- `google-scripts/tooling-sheet/appsscript.json` (pulled live manifest)

Plus this handoff file itself. Get these committed and pushed (connector or
GitHub Desktop). Suggested message: `chore: turnover setup - org config +
gscript sync`.

## Rules that apply (from CLAUDE.md — read it first)

- This is the LIVE production system. Real customer data. Not the Finn
  Operations showroom (separate folder, not mounted).
- Never run git commit/push/status inside the Cowork sandbox against the
  mount — edits via file tools only; git happens in GitHub Desktop or via
  the GitHub connector API.
- Never commit secrets; config lives in Railway → Variables.
- `pms-locations` Apps Script is the live inventory ledger — never push to
  it casually; practice on `tooling-sheet`.
- Zack is new to git — explain steps simply, one at a time, and note that
  Ctrl+V pasting glitches in Git Bash (use right-click paste).

## After both tasks

Offer Zack an orientation briefing from `PROJECT_HANDOFF.md`,
`TURNOVER-PLAN.md`, `SYSTEM-STATE.md`, and the Owner's Handbook — he hasn't
had one yet.
