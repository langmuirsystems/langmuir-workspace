# Epicor Kinetic API Connection — Setup Guide

How to wire a new integration (Google Sheets script **or** Railway service) to Epicor's REST API. This is the same pattern already live in `scheduling/`, `pms/` (shipping/cyclecount), and the `production-data` Apps Script — follow it exactly and everything downstream just works.

**The five values every integration needs:**

| Value | Ours | Where it comes from |
|---|---|---|
| Host | `https://centralusdtapp38.epicorsaas.com/SaaS886` | Kinetic cloud URL (fixed) |
| Company | `159674` | Company ID (fixed) |
| Username | service account | Epicor user (Step 1) |
| Password | service account | Epicor user (Step 1) |
| API Key | one per integration | API Key Maintenance (Step 3) |

---

## Part 1 — Epicor buttonology (one-time, in Kinetic)

### Step 1: Service account
Use a dedicated Epicor user, not your personal login (password rotations on personal accounts silently break integrations).

1. Kinetic menu search → **User Account Security Maintenance**.
2. New user → ID like `svc-techsupport`, strong password.
3. Assign only the security group(s) needed to run the BAQs — the account's rights determine what the API can see. For the tech-support assistant this should be **read-only**.

### Step 2: BAQ (the actual query)
The API doesn't expose raw tables — you expose data by building a BAQ and calling it over REST.

1. Menu search → **Business Activity Query Designer**.
2. New (or **Actions → Save As** from an existing `BF_*` BAQ) → name with the `BF_` prefix, e.g. `BF_CustomerContacts`.
3. Add tables/joins/display fields. **Actions → Test/Analyze** until rows look right.
4. Mark the BAQ **Shared** — non-shared BAQs are invisible to other users, including the service account.

See `scheduling/BAQ_BUILD_GUIDE.md` for detailed BAQ construction. Support-side BAQs to build are specced in `techsupport/ACCESS_CHECKLIST.md` §3.

### Step 3: API key
1. Menu search → **API Key Maintenance** (System Setup → Security Maintenance).
2. Log in as (or generate for) the service account. New Key → description, e.g. `TechSupport read-only`.
3. Optional: attach an **Access Scope** (Access Scope Maintenance) restricting the key to `BaqSvc` only — good practice for read-only integrations.
4. Save → **the key displays once and is never shown again.** Copy it immediately into a password manager.

One key **per integration** (MRP has its own; tech support gets its own). That way a leaked/rotated key only breaks one system.

### Step 4: Verify from a terminal
```bash
curl -s "https://centralusdtapp38.epicorsaas.com/SaaS886/api/v2/odata/159674/BaqSvc/BF_DailyProduction/Data" \
  -H "Authorization: Basic $(printf 'USER:PASS' | base64)" \
  -H "X-API-Key: THEKEY" -H "Accept: application/json"
```
Expect `{"value":[...rows...]}`. 401 = bad user/pass, 400/403 = bad or unscoped API key, 404 = BAQ name wrong or not shared.

---

## Part 2 — Railway path (direct Epicor → Postgres)

### What you enter
Railway dashboard → the service → **Variables** tab → add each → Railway redeploys automatically:

```
EPICOR_HOST=https://centralusdtapp38.epicorsaas.com/SaaS886
EPICOR_COMPANY=159674
EPICOR_USER=<service account>
EPICOR_PASS=<password>
EPICOR_API_KEY=<key from Step 3>
EPICOR_BAQS=BF_FGOnHandInventory,BF_DailyProduction   # comma-separated, add as built
```

Never put these in the repo — `.env` is for local dev only and is gitignored.

### What the backend does with them (`scheduling/lib/epicor.js` — reuse this file)
1. On boot, `hydrate()` loads the last-synced rows from the Postgres `epicor_cache` table, so the service has data before Epicor is ever called (and survives restarts/outages).
2. On a timer (`POLL_INTERVAL_MS`, default 10 min), `syncAll()` calls each BAQ in `EPICOR_BAQS`:
   - URL: `EPICOR_HOST + /api/v2/odata/ + EPICOR_COMPANY + /BaqSvc/ + <BAQ> + /Data`
   - Headers: `Authorization: Basic base64(USER:PASS)` + `X-API-Key`
3. Each result is upserted into `epicor_cache` (one JSONB row per BAQ) and kept in memory.
4. App code never talks to Epicor directly — it calls `get('BF_Whatever')` for cached rows; `status()` reports row counts / last sync / errors per BAQ.
5. If any credential is missing, `configured()` is false and syncing silently skips — so a blank screen usually means a missing Railway variable.

`pms/shipping.js` and `pms/cyclecount.js` read the same `EPICOR_*` variable names, so setting them once on a service enables every Epicor feature in it.

---

## Part 3 — Google Sheets path (Apps Script → Sheet tabs)

### What you enter
⚠️ Property names differ from Railway: `EPICOR_USERNAME` / `EPICOR_PASSWORD` (not `EPICOR_USER`/`EPICOR_PASS`).

Preferred — manual entry (nothing ever touches code):
1. Extensions → Apps Script → gear icon (**Project Settings**) → **Script Properties** → Add script property:
   - `EPICOR_USERNAME`, `EPICOR_PASSWORD`, `EPICOR_API_KEY`
2. Host and company are **not** properties — they live in the `CONFIG` block at the top of `Code.js`, along with the BAQ IDs and target tab names.

Alternative — the code path: paste values into `setCredentials()` in `Code.js`, run it once from the editor, then **immediately blank the values back out** (the function stores them into Script Properties; leaving them in code risks committing secrets via clasp).

Then run `testConnection()` from the editor (View → Logs shows ✅/❌ per BAQ) and `installDailyTrigger()` to schedule the sync.

### What the backend does with them (`google-scripts/production-data/Code.js`)
1. `fetchBAQ(baqId)` builds the same v2 URL and headers as Railway does, via `UrlFetchApp`, reading the three Script Properties at call time. Missing properties throw "Run setCredentials() once."
2. `syncAllSafe()` (the trigger target) takes a `LockService` lock so overlapping runs can't double-write, then syncs each configured BAQ.
3. `writeToTab()` clears the target tab and rewrites it: bolded header row from the BAQ's column names, dates normalized to local noon so timezones don't shift the day, columns auto-sized.
4. `writeStatus()` appends timestamp/duration/result to a Status tab — first place to look when data seems stale.
5. `doGet()` serves the sheet data as JSON — this is the URL Railway services consume as `LOCATIONS_URL`/`KPI_URL` (the legacy "Sheets hop").

---

## Part 4 — Which path for the tech-support assistant

Use the **Railway direct path** (Part 2). The Sheets hop is the legacy pattern; the checklist and `scheduling/` both standardize on BAQ → REST → Postgres. Concretely: new read-only service account + new API key (Part 1), build the four support BAQs from `ACCESS_CHECKLIST.md` §3, copy `scheduling/lib/epicor.js` into the new service, set the six `EPICOR_*` Railway variables. If the assistant ends up hosted by a provider instead of Railway, the same five credentials go into that provider's secrets store and the request format (Basic + `X-API-Key` against `/api/v2/odata/.../BaqSvc/...`) is unchanged.

**Security recap:** one key per integration · key shown once, vault it · read-only scope for support · never in git · rotating the service-account password breaks Railway *and* Sheets — update both.
