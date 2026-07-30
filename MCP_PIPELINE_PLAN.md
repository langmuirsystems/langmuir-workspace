# PMS MCP Connection + Daily Auto-Implementation Pipeline — Phased Plan

> **Status (2026-07-14):** Phases 1 + 2 are BUILT (`pms/mcp.js`, wired in
> `server.js`). 8 tools: 5 read (feedback_list/get, pick_history,
> shipping_stats, cyclecount_stats) + 3 write (feedback_update_status,
> feedback_post_outcome, feedback_comment → `feedback_notes` table).
> To activate: set `MCP_TOKEN` on the langmuir-pms Railway service (32+ random
> chars), then add a Claude custom connector with URL
> `https://langmuirproduction.up.railway.app/mcp?token=<MCP_TOKEN>`.
> Next: use it for a week, then Phase 3 Option A (scheduled 4:30 PM run).

Goal: Claude connects directly to the live PMS via MCP, and once a day at 4:30 PM
an agent reads the Continuous Improvement board's "in progress" comments and
implements the changes, with Brendan as the approval gate before anything hits
production.

---

## Architecture at a glance

```
CI board (feedback table, Postgres)
        │
        ▼
[Phase 1] MCP server endpoint on langmuir-pms  ←── Claude (desktop/Cowork) as a custom connector
        │
        ▼
[Phase 3] 4:30 PM scheduled agent run (Fable 5)
        │  reads status='in_progress' feedback items
        ▼
   implements changes in this workspace → pushes to pms-test (or feature branch)
        │
        ▼
   posts an outcome summary back to the CI card + notifies Brendan
        │
        ▼
   Brendan reviews on pms-test → approves → promote to pms (prod)
```

Key principle: **the agent never pushes to prod.** Railway deploys `pms` from
main, so main stays human-gated. The agent's write surface is pms-test / branches
and the feedback table itself.

---

## Phase 1 — Read-only MCP server on pms

Add an MCP endpoint (Streamable HTTP) to the existing Express app in `pms/server.js`
(new module `pms/mcp.js`, following the same `initMcp(app)` pattern as feedback/
shipping/cyclecount). No new service, no new Railway cost.

- **Auth:** bearer token from a `MCP_TOKEN` env var on Railway. Reject anything else.
- **Tools (read-only):**
  - `feedback_list` — filter by status/source/date; returns id, message, votes, page, name
  - `feedback_get` — single item with full detail
  - `pick_history` — last N hours of request activity (builds on the new history feature)
  - `shipping_stats` — scan errors, orders shipped, exception counts
  - `cyclecount_stats` — accuracy/error-rate from `cc_*` tables
- **Connect:** add as a custom connector in Claude settings (URL + token).
  Immediately useful on its own: "summarize this week's feedback," "how many
  mis-scans yesterday," straight from the horse's mouth.

Effort: small. One module, ~5 tools that wrap existing queries.

## Phase 2 — Write tools (closing the loop on the board)

Extend the MCP server with scoped write tools:

- `feedback_update_status` — move a card (new → reviewing → in_progress → done/declined)
- `feedback_post_outcome` — write the "We Did" outcome text + completed_at
- `feedback_comment` — append an implementation note (new `feedback_notes` table,
  so agent reasoning is visible on the card without overwriting the original comment)

Guardrails: writes limited to the feedback tables only. No inventory, no
shipping, no production-state writes through MCP.

Effort: small. Do after Phase 1 is proven.

## Phase 3 — The 4:30 PM agent run

Two viable runners; pick one:

**Option A — Cowork scheduled task (recommended to start).** A scheduled task in
this workspace runs daily at 4:30 PM: pulls `in_progress` items via MCP, edits
code in this mounted folder, and leaves diffs + a summary for you. You review and
run the `sync-repo.sh` push yourself — identical to today's workflow, just
automated up to the approval gate. Zero new infrastructure; the existing
commit/push constraint becomes the safety gate.

**Option B — Headless Claude Code on the Mac (launchd at 4:30).** `claude -p`
with repo + SSH access; can commit and push to `pms-test` or a feature branch
autonomously, post outcome to the card via MCP, and open a PR for prod. More
autonomous, needs the Mac awake and more guardrail work.

Start with A, graduate to B once you trust the output.

Run procedure (either option):

1. Fetch `status='in_progress'` items, newest first, skip items tagged `agent:blocked`
2. For each item: locate the relevant module, implement, self-review the diff
3. Write a per-item summary (what changed, files, risk) to the card via `feedback_comment`
4. Stage everything for Brendan's review; nothing merges to prod without him
5. Items too ambiguous to implement get a card note asking a clarifying question
   instead of a guess

## Phase 4 — Tighten and measure

- Auto-verify on pms-test (agent hits the staging URL, checks the feature works)
- On approval, agent moves card to `done` and fills the "You Said / We Did" outcome
- Metrics: cards implemented per week, time from submission → done, before/after
  for the wall board
- Optional: morning digest of what the 4:30 run did, waiting for review

---

## Guardrails (all phases)

- MCP token in Railway env vars, never in code
- Agent write surface: feedback tables + pms-test/branches only; prod pushes are human-only
- Cap: max ~3 cards implemented per run to keep review load sane
- Every agent action logged (reuse the `ship_order_events` JSONB pattern: an
  `agent_events` table)
- Kill switch: unset `MCP_TOKEN` disables the whole pipeline

## Suggested order of execution

1. Phase 1 (next session, ~1 sitting)
2. Use it manually for a week
3. Phase 2 + Phase 3 Option A
4. Phase 4 / Option B once trust is established
