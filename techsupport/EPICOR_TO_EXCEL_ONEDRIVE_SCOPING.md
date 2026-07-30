# Epicor Kinetic → Excel / OneDrive — Scoping Guide

Scopes what it takes to replicate the "Epicor BAQ → Google Sheets" sync pattern in the Microsoft ecosystem (Excel workbook living in OneDrive/SharePoint). Short version: **yes, it's doable, but Microsoft has no free exact equivalent of Apps Script's scheduled `UrlFetchApp`** — the right option depends on whether refreshes can be manual, and whether you have Power Automate licensing or a developer.

**Nothing changes on the Epicor side.** Same service account, same shared BAQ, same API key, same endpoint (`/api/v2/odata/<Company>/BaqSvc/<BAQ>/Data` with Basic auth + `X-API-Key`). Only the consumer changes.

---

## The one gotcha that shapes everything

Excel's Apps-Script equivalent (**Office Scripts**) *can* call external APIs with `fetch()` — but **only when run manually inside Excel**. When an Office Script is triggered by Power Automate (the only way to schedule it), external calls are blocked by design ("fetch is not defined"). So the free "script + timed trigger" combo that works in Google Sheets does not exist in Excel. Every option below is a way around that.

---

## Option A — Power Query in the workbook (free, manual/on-open refresh)

Excel's built-in Get & Transform can call the BAQ endpoint directly. No code, no licenses.

**Setup:** Data → Get Data → From Web → Advanced → paste the BAQ URL and add two HTTP headers (`Authorization: Basic <base64 user:pass>`, `X-API-Key: <key>`), choose Anonymous credentials (headers carry the real auth) → expand the JSON `value` list into a table → Close & Load. Set "Refresh data when opening the file" in the query properties.

**Behavior:** Data refreshes whenever someone opens the workbook in desktop Excel or clicks Refresh All. Refresh in Excel-for-web is limited and shouldn't be counted on. Nothing happens unattended.

**Caveats:** The credentials are embedded in the query inside the workbook — anyone who can open the file can extract them, so scope the Epicor account read-only and share the file narrowly.

**Effort: ~1 hour. Best when:** a human opening the file is an acceptable "trigger."

## Option B — Power Automate cloud flow (no-code, scheduled, premium license)

The closest functional match to the Google Sheets setup: a scheduled cloud flow pulls the BAQ and writes to the workbook in OneDrive.

**Flow shape:** Recurrence trigger → **HTTP action** (GET the BAQ URL with the two headers) → Parse JSON → write to workbook. For writing, avoid the Excel Online "Add a row" action in a loop (roughly a row per second, painfully slow for real BAQs). Instead pass the whole JSON payload as a **parameter** into an Office Script "Run script" action — scripts can't fetch externally under Power Automate, but they can receive data as input and write thousands of rows in one `setValues`-style call.

**Requirements:** The workbook data must land in a named **Table** or a script-managed sheet; the flow owner needs **Power Automate Premium** (~$15/user/month, because the generic HTTP connector is premium) or a per-flow Process license. Credentials are stored in the flow definition — restrict flow ownership, or reference Azure Key Vault.

**Effort: ~half a day** including the writer script. **Best when:** the team lives in M365, wants scheduled hands-off sync, and has no developer.

## Option C — Backend service + Microsoft Graph (the robust equivalent of our production pattern)

Our production setup doesn't actually use the Google Sheet as the integration engine anymore — a small hosted service polls Epicor, caches to a database, and apps read the cache. The Microsoft version of that: the same service also pushes to OneDrive via the **Graph API**, either updating a worksheet/table in place (`/workbook/worksheets/.../range` endpoints) or simply regenerating the `.xlsx` and uploading it (`PUT /drive/items/.../content`) each cycle. The upload-whole-file route is dramatically simpler and plenty for a report workbook.

**Requirements:** Somewhere to run it (Railway/Azure Functions/any VM — a few dollars a month), plus a one-time **Entra ID (Azure AD) app registration**: client-credentials app, `Files.ReadWrite.All` (or the more restrictive `Sites.Selected`) application permission, admin consent, secret stored in the host's environment variables alongside the `EPICOR_*` ones.

**Effort: 1–2 days** for a developer. **Best when:** you want true unattended sync, no per-user licensing, version-controlled logic, and room to grow (multiple BAQs, alerting, a database cache).

## Option D — Office Script with a refresh button (free, manual only)

An Office Script that `fetch()`es the BAQ and writes rows works fine when a user clicks it inside Excel (desktop or web) — essentially Apps Script minus the scheduler. Store the script in OneDrive (not SharePoint, where external calls are also blocked). Credentials end up in the script text, same caution as Option A. **Effort: ~2 hours.** Reasonable as a stopgap or paired with Option A.

---

## Recommendation

| If the partner… | Go with |
|---|---|
| Just needs current data when they open the file | **A** (Power Query) — start here today |
| Wants scheduled sync, no devs, has/accepts Power Automate Premium | **B** (Flow + HTTP + Office Script writer) |
| Has a developer and wants the durable version | **C** (service + Graph upload) |

A sensible path: stand up **A** in an hour to prove the connection end-to-end, then graduate to **B or C** once the manual refresh becomes annoying.

## Security recap

Same rules as the Sheets version: dedicated read-only Epicor service account · one API key per integration · key shown once, vault it. Microsoft-side additions: Power Query/Office Script embed credentials in the workbook — treat the file itself as a secret; Power Automate stores credentials in the flow — restrict ownership; Graph app secrets live in host env vars and should use least-privilege permissions (`Sites.Selected` over `Files.ReadWrite.All` where possible).
