# Connecting to Epicor Kinetic's REST API — Setup Guide

How to pull data out of Epicor Kinetic (cloud) into an external system — either a Google Sheet (Apps Script) or a hosted backend service (Railway, or any host with environment variables). Covers the Epicor-side clicks, what credentials go where, and what the code does with them.

**The five values every integration needs:**

| Value | Example | Where it comes from |
|---|---|---|
| Host | `https://<yourserver>.epicorsaas.com/<YourInstance>` | Your Kinetic cloud URL (in your browser address bar when logged in) |
| Company | e.g. `123456` | Company ID shown in Kinetic (Company Maintenance) |
| Username | `svc-integration` | Dedicated Epicor service account (Step 1) |
| Password | — | Same account |
| API Key | shown once at creation | API Key Maintenance (Step 3) |

---

## Part 1 — Epicor buttonology (one-time, inside Kinetic)

### Step 1: Create a service account
Don't use a person's login — password rotations will silently break the integration.

1. Kinetic menu search → **User Account Security Maintenance**.
2. New user → ID like `svc-integration`, strong password.
3. Assign only the security group(s) needed to run the queries. If the integration only reads data, keep the account read-only.

### Step 2: Build a BAQ (the query you'll call)
The REST API doesn't expose raw tables directly — the clean pattern is to build a Business Activity Query and call it over REST.

1. Menu search → **Business Activity Query Designer**.
2. New query → pick tables, joins, and display fields.
3. **Actions → Test/Analyze** until the rows look right.
4. Mark the BAQ **Shared** — non-shared (personal) BAQs are invisible to other users, including your service account. This is the #1 cause of mysterious 404s.

### Step 3: Generate the API key
1. Menu search → **API Key Maintenance** (System Setup → Security Maintenance).
2. New Key → give it a description naming the integration (e.g. `Sheets nightly sync`).
3. Optional but recommended: attach an **Access Scope** (Access Scope Maintenance) restricting the key to `BaqSvc` only, so the key can't call anything but BAQs.
4. Save → **the key is displayed exactly once and never again.** Copy it into a password manager immediately.

Create **one key per integration**. If a key leaks or needs rotating, only that one system breaks.

### Step 4: Verify from a terminal
Replace `USER:PASS` with the service account's actual username:password, `THEKEY` with the API key, and the URL pieces with yours — all three credentials are being sent here (the `$(printf ... | base64)` encodes username:password into the Basic auth header):

```bash
curl -s "https://<yourserver>.epicorsaas.com/<YourInstance>/api/v2/odata/<CompanyID>/BaqSvc/<BAQName>/Data" \
  -H "Authorization: Basic $(printf 'USER:PASS' | base64)" \
  -H "X-API-Key: THEKEY" \
  -H "Accept: application/json"
```

Success looks like `{"value":[ ...rows... ]}`. Troubleshooting: **401** = wrong username/password · **400/403** = wrong or out-of-scope API key · **404** = BAQ name misspelled or not marked Shared.

---

## Part 2 — Option A: Hosted backend (Railway or similar)

### What you enter
In your host's environment-variable settings (Railway: service → **Variables** tab; the service redeploys automatically on save):

```
EPICOR_HOST=https://<yourserver>.epicorsaas.com/<YourInstance>
EPICOR_COMPANY=<CompanyID>
EPICOR_USER=<service account>
EPICOR_PASS=<password>
EPICOR_API_KEY=<key from Step 3>
EPICOR_BAQS=YourBAQ1,YourBAQ2
```

Never commit these to a git repo — environment variables only.

### What the code does with them
The pattern we run in production: poll Epicor on a timer, cache results in Postgres so the app survives Epicor outages and restarts, and have the app read only from the cache.

```js
// Node 18+ (built-in fetch). Reads env vars, calls one BAQ.
async function fetchBAQ(baq) {
  const url = `${process.env.EPICOR_HOST}/api/v2/odata/${process.env.EPICOR_COMPANY}/BaqSvc/${baq}/Data`;
  const auth = Buffer.from(`${process.env.EPICOR_USER}:${process.env.EPICOR_PASS}`).toString('base64');
  const resp = await fetch(url, {
    headers: {
      Authorization: 'Basic ' + auth,
      'X-API-Key': process.env.EPICOR_API_KEY,
      Accept: 'application/json',
    },
  });
  if (!resp.ok) throw new Error(`Epicor ${baq} HTTP ${resp.status}`);
  const json = await resp.json();
  return json.value; // array of row objects, keys = BAQ display-field names
}
```

Around that core, the full sync loop:

1. **On startup**, load the last-synced rows from a cache table (one JSONB row per BAQ) so the app has data before Epicor is ever called.
2. **On a timer** (we use 10 minutes), loop over `EPICOR_BAQS`, call `fetchBAQ` for each, and upsert results into the cache table. Log failures per-BAQ but keep the previous cached rows.
3. **Application code never calls Epicor directly** — it reads the cache. This keeps the app fast and immune to Epicor slowness or maintenance windows.
4. Expose a small status endpoint (rows per BAQ, last sync time, last error) — the first place to look when data seems stale.

---

## Part 3 — Option B: Google Sheets (Apps Script)

### What you enter
Store credentials in **Script Properties**, never in the code:

1. Open the Sheet → Extensions → Apps Script → gear icon (**Project Settings**) → **Script Properties** → Add:
   - `EPICOR_USERNAME`, `EPICOR_PASSWORD`, `EPICOR_API_KEY`
2. Host, company ID, BAQ names, and target tab names go in a `CONFIG` constant at the top of the script (they're not secrets).

### What the code does with them

```js
const CONFIG = {
  EPICOR_HOST: 'https://<yourserver>.epicorsaas.com/<YourInstance>',
  COMPANY: '<CompanyID>',
  BAQS: [ { id: 'YourBAQ1', tab: 'Data1' }, { id: 'YourBAQ2', tab: 'Data2' } ],
};

function fetchBAQ(baqId) {
  const props = PropertiesService.getScriptProperties();
  const url = CONFIG.EPICOR_HOST + '/api/v2/odata/' + CONFIG.COMPANY + '/BaqSvc/' + baqId + '/Data';
  const resp = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      'Authorization': 'Basic ' + Utilities.base64Encode(
        props.getProperty('EPICOR_USERNAME') + ':' + props.getProperty('EPICOR_PASSWORD')),
      'X-API-Key': props.getProperty('EPICOR_API_KEY'),
      'Accept': 'application/json',
    },
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 300));
  return JSON.parse(resp.getContentText()).value;
}

function syncAll() {
  CONFIG.BAQS.forEach(({ id, tab }) => {
    const rows = fetchBAQ(id);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tab)
      || SpreadsheetApp.getActiveSpreadsheet().insertSheet(tab);
    sheet.clear();
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.getRange(2, 1, rows.length, headers.length)
      .setValues(rows.map(r => headers.map(h => r[h] ?? '')));
    sheet.setFrozenRows(1);
  });
}
```

Operational notes from running this in production:

1. Run `syncAll` manually from the editor first — the execution log shows exactly which BAQ failed and why.
2. Schedule it: Apps Script editor → Triggers (clock icon) → add a time-driven trigger on `syncAll` (daily/hourly as needed). Wrap it with `LockService` if runs could overlap.
3. Append each run's timestamp and result to a "Status" tab — cheap observability.
4. BAQ date fields arrive as ISO strings; convert to `Date` objects before writing or the sheet treats them as text.
5. If other systems need this data, an Apps Script `doGet()` can serve the sheet as JSON — though if you're going that far, the direct backend path (Part 2) is cleaner.

---

## Security recap

One API key per integration · the key is shown once, vault it · dedicated read-only service account, minimal security groups · credentials live in env vars / Script Properties, never in git or code · rotating the service-account password breaks every integration using it — update them together.
