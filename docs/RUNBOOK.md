# Runbook

What to check when something is broken, in the order worth checking it. Written for
someone who did not build these systems.

**Before anything else:** confirm which repo actually serves the thing that is
broken. Check `SYSTEM-STATE.md`. Editing `_archive/` changes nothing in production
and it looks exactly like real code.

---

## A page loads but shows no data

In this order:

1. **Shop IP allowlist.** pms, pms-test, ci, scheduling and tooling all read
   `ALLOWED_IPS`. If you are outside the building or on a different network, the
   app is up and refusing you. This looks identical to "the data is gone."
2. **Epicor credentials.** `GET /api/ship/status` lists every BAQ with its `error`.
   If they are all erroring, the credentials in Railway are stale. Epicor passwords
   expire.
3. **A single BAQ.** `GET /api/ship/baq-test?baq=BF_ShippingDB_Freight` runs any BAQ
   with the app's own credentials and shows you exactly what it gets back.
4. **The database.** `DATABASE_URL` is shared by pms, ci, vision, scheduling and
   bom. If several services are blank at once, look there.

---

## Orders are "missing" from a shipping or packing queue

This is almost never a bug. It has been investigated more than once and came back
the same way each time.

1. **Daily part exclusions.** An order hides when ANY line on it carries an excluded
   part. Exclusions expire at Chicago midnight. Check `queues.exclusions` in
   `/api/ship/queues` first, every time.
2. **On hold.** On-hold orders are hidden via `masterMetaIndex`.
   `OrderHed_OrderHeld` only exists in the MASTER BAQ.
3. **Wrong order number.** pms `order_num` is the Epicor number (25xxx). The number
   people quote off a Shopify sheet is `OrderHed_PONum` (111xxx).
4. **Material analysis code.** Pack categories come from `Part.MtlAnalysisCode`
   ('2' Freight, '3' Assembled, '5' Dep). A new assembled SKU without code 3 will
   not appear anywhere on the packing board.
5. **Line routing.** `GET /api/ship/part-line?part=LSXR-54` tells you which line a
   part routes to and why. Parts with no machine name in them stay in Other on
   purpose.

If it is on no screen at all, read
[`knowledge/freight-via-crack.md`](knowledge/freight-via-crack.md). That exact
failure has happened.

---

## A Railway build failed

The old version is still live. There is no outage and no rush.

Open the build log in Railway. It is almost always a syntax error in the last
commit. Fix, commit, push. If you need to get back to known-good immediately,
Railway's Command Palette has **Deploy Latest Commit**, and you can redeploy an
earlier successful deployment from the service's Deployments tab.

---

## A service builds but then crash-loops

Missing environment variable, nearly always. `DATABASE_URL` is the usual one; ci
crash-loops until it is set. Check Railway → the service → Variables against the
list in `TURNOVER-PLAN.md`.

---

## I pushed and Railway did nothing

The GitHub App connection is broken, not the service. The running service is fine.
See [`GITHUB-ORG-TRANSFER.md`](GITHUB-ORG-TRANSFER.md), "If auto-deploy stops after
a transfer." Meanwhile `railway up` from the CLI still deploys.

**Do not delete and recreate the service.** That would lose the environment
variables and cause the outage you are trying to avoid.

---

## The scan box keeps stealing the cursor

Someone reintroduced a refocus on a blur timer or an unconditional refocus in a poll
re-render. Read [`knowledge/scan-focus-rule.md`](knowledge/scan-focus-rule.md); it
has the working pattern. This one is disruptive on the floor out of proportion to how
small it looks in code, because it makes the line switcher, tab bar and overlay
inputs unusable while an order is open.

---

## Cycle count numbers look off

- **Stale, not expired.** Past 5 days a row is flagged stale and keeps recomputing.
  That is the design (`cc_settings.count_valid_days`).
- **The known gap:** consumption and scrap come from daily BAQs covering through
  yesterday. Material issued between the count and a same-day upload is not in the
  adjustment. Upload right after counting, or let the row ride to the morning
  recompute. Say this plainly if someone asks; it is a limitation, not a bug.
- Everything Epicor-side here is read-only BAQ GETs. Nothing writes to Epicor.

---

## Something is wrong with inventory itself

`google-scripts/pms-locations` is the **live inventory ledger**. Cycle count reads
and writes it, and shipping subtracts through it at ship-out. A `clasp push` to it
is live immediately with no deploy step and no undo.

Do not push to it to test something. Use `tooling-sheet` to practice clasp.

---

## Epicor BAQ problems

- **Query Test runs the open design; REST runs the SAVED query.** If a BAQ works in
  Epicor's tester and not through the app, save it.
- **BAQs must be `BF_`-prefixed and marked Shared.** Epicor SaaS forces the user
  prefix on this instance.
- A `.baq` file is a zip. Criteria live in the `DynamicQuery` entry as
  `QueryWhereItemDesigner` elements. That is how the #25275 criteria were read.
- `GET /api/ship/baq-test?baq=NAME` is the fastest way to see what the app actually
  receives.

---

## Git problems

**Push rejected.** Someone pushed first. Pull, then push.

**Merge conflict.** GitHub Desktop names the files; VS Code marks the sections. If
you are not sure which side to keep, ask before resolving. A bad resolution here is
harder to spot than a failed build.

**Stale `index.lock`.** Something ran git against the folder from a sandbox. Delete
the `.git/index.lock` file in that repo and retry. Then stop running git from the
sandbox.

---

## Diagnostic endpoints, collected

| Endpoint | What it tells you |
|---|---|
| `GET /api/ship/status` | Every BAQ with its current error |
| `GET /api/ship/baq-test?baq=NAME` | Runs any BAQ with the app's credentials |
| `GET /api/ship/queues` | Live queues, including `exclusions` and `uncoveredFreight` |
| `GET /api/ship/part-line?part=X` | Why a part routes to the line it routes to |
| `GET /api/ship/pick-log?order=N` | Full pick history, filterable |
| `GET /api/status` (bom) | BOM ingest key detection and feed health |

The live APIs return 403 to outside fetches, so run these from a shop IP or from
inside the app.
