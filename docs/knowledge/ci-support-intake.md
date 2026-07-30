# CI support intake (langmuir-ci)

*Live. ONE board per issue as of 2026-07-30.*

Live at `https://langmuir-ci-production.up.railway.app`. Shares the pms Postgres and `LOCATIONS_URL`; no Epicor credentials. All code in `ci/`.

## One board per issue

Brendan, 2026-07-30: engineering items "clutter the operations board since they are slower to get to CI initiatives."

- Software or hardware tagged → ENGINEERING board only. Everything else → OPERATIONS. `cleanTags` enforces it (engineering wins a tie). The tag whitelist is the UNION of both boards' tags so a pushed issue keeps its sw/hw chip on ops.
- **Board membership changes ONLY via `POST /api/ci/issues/:id/move {board,name}`**, the ⇥ buttons on cards. Move keeps `sub_tags` and drops an auto-comment on the thread. The edit modal deliberately does NOT send boards, because editing tags must never yank a pushed issue back.
- `initSchema` backfill is idempotent: rows on BOTH boards collapsed to engineering-only on first deploy.
- Card headers: line chip (teal, ops tags) or software/hardware chip (purple, eng tags) plus type and priority. 'general' shows no chip. Everything else lives in the modal.

## Feature state

Unified feedback table plus `issue_reports` (+1 recurrence), `issue_photos` (bytea), `issue_comments`. Cards clamp at 400 chars. Done column pages 10. Click anywhere opens the report modal. ORDER/ZD teal tags in the modal. Zendesk refs accept comma lists (`cleanRefs`). Multi-part per issue (`part_nums TEXT[]`, `PART_MATCH`). Numeric search "#47". Old CI board columns, drag-and-drop, accountability gates, and the leaderboard/points system are all KEPT.

## Gotchas

- zsh eats pasted `#` comments containing apostrophes.
- Railway crash-loops until `DATABASE_URL` is set.
- The server patches `const PMS_URL = "";` in `board.html` at serve time. **Keep that string exact.**
- Test pattern: jsdom boots `board.html` at `/ops` or `/engineering` with fetch stubbed (options + issues + `:id` detail). The modal fetches detail, so stub it or `openModal` throws.

## Next

Phase 5 = `addendum-forms.json` fields, to be defined with the engineers. Wall displays point at `/ops` and `/engineering`.

Related: [ui-style](ui-style.md)
