// ═════════════════════════════════════════════════════════════
// =============================================================
// MAINTENANCE MAP — this script runs ITSELF on time-based triggers. The floor
// manager works in the SHEET tabs, not in here; you rarely run anything in this
// editor. The only functions a human ever runs:
//
//   Run-once setup (already done — only if rebuilding from scratch):
//     setCredentials, setupEpicorTrigger, setupLineConsumptionTrigger,
//     setupCycleTriggers, setupBomSyncTrigger
//   Occasional maintenance (safe to run by hand):
//     tidyTabs                 - organize / clean up the sheet tabs
//     cleanupZeroQtyLocations  - purge emptied Locations rows
//     syncDerivedBom > diffDerivedBom > cutoverDerivedBom - refresh BOM from Epicor
//   Optional checks:
//     testEpicorConnection, testLineConsumption, testCycleCount
//
//   Everything else is AUTOMATIC or INTERNAL — do not run by hand:
//     doGet / doPost  = the web app the PMS calls
//     *Safe functions = the trigger jobs (refresh, nightly, cycle, weekly BOM)
//     all other functions = helpers called by the above
// =============================================================
// EPICOR CONFIG
//
// Credentials live in Script Properties (Project Settings → Script
// properties), NOT in source code. After 2FA goes live, Basic Auth alone
// will be rejected by Epicor — the X-API-Key header is what keeps these
// calls working. The refresh function below sends BOTH headers and
// REQUIRES the API key to be present.
//
// One-time setup (do this once, then never again):
//   1. Open this script in the Apps Script editor.
//   2. Edit the placeholder values inside setCredentials() below.
//   3. Run setCredentials() once (Run → setCredentials → grant access).
//   4. Blank the values back out inside setCredentials() and save —
//      the credentials are now in Script Properties; the source no
//      longer needs them.
//   5. Run testEpicorConnection() to confirm the API key is accepted.
//      Expect: "OK — Epicor returned N rows".
//   6. Run setupEpicorTrigger() (existing function) to install the
//      hourly time-driven trigger, same as before.
// ═════════════════════════════════════════════════════════════

const TARGET_SHEET = 'BAQ_Data';

/**
 * Reads Epicor credentials from Script Properties.
 * Throws if anything is missing — surfaces config errors at run time
 * with a clear message instead of a silent 401.
 *
 * Expected properties:
 *   EPICOR_URL      Full BAQ data URL (e.g.
 *                   https://centralusdtapp38.epicorsaas.com/SaaS886/api/v2/odata/<COMPANY>/BaqSvc/<BAQ_NAME>/Data)
 *   EPICOR_USERNAME Epicor user (ideally a dedicated service account,
 *                   not a named human user)
 *   EPICOR_PASSWORD That user's password
 *   EPICOR_API_KEY  API Key generated in Epicor Kinetic
 *                   (System Setup → Security → API Key Maintenance)
 */
function getEpicorConfig_() {
  const props = PropertiesService.getScriptProperties();
  const cfg = {
    url:      props.getProperty('EPICOR_URL'),
    username: props.getProperty('EPICOR_USERNAME'),
    password: props.getProperty('EPICOR_PASSWORD'),
    apiKey:   props.getProperty('EPICOR_API_KEY'),
  };
  const missing = Object.keys(cfg).filter(k => !cfg[k]);
  if (missing.length) {
    throw new Error(
      'Missing Epicor credentials in Script Properties: ' + missing.join(', ') +
      '. Run setCredentials() once to seed them.'
    );
  }
  return cfg;
}

// Pull current on-hand from Epicor BAQ and overwrite the BAQ_Data sheet.
// Runs every hour via the time-driven trigger installed by setupEpicorTrigger().
// Wrapped by refreshEpicorDataSafe (LockService) to prevent overlapping runs.
function refreshEpicorData() {
  const cfg = getEpicorConfig_();
  const headers = {
    'Authorization': 'Basic ' + Utilities.base64Encode(cfg.username + ':' + cfg.password),
    'X-API-Key':     cfg.apiKey,   // required once 2FA is enforced on the user
    'Accept':        'application/json'
  };
  const options = {
    method: 'get',
    headers: headers,
    muteHttpExceptions: true
  };
  const response = UrlFetchApp.fetch(cfg.url, options);
  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('Epicor returned ' + code + ': ' + response.getContentText().substring(0, 500));
  }
  const json = JSON.parse(response.getContentText());
  const rows = json.value || [];
  if (rows.length === 0) {
    Logger.log('No rows returned.');
    return;
  }
  // Build header row from keys of first record
  const columns = Object.keys(rows[0]);
  const dataRows = rows.map(r => columns.map(c => r[c] === null || r[c] === undefined ? '' : r[c]));
  const output = [columns, ...dataRows];
  // Write to sheet
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TARGET_SHEET) || ss.insertSheet(TARGET_SHEET);
  sheet.clear();
  sheet.getRange(1, 1, output.length, columns.length).setValues(output);
  // Add timestamp in a fixed cell
  const tsSheet = ss.getSheetByName('Refresh_Log') || ss.insertSheet('Refresh_Log');
  tsSheet.getRange('A1').setValue('Last refresh:');
  tsSheet.getRange('B1').setValue(new Date());
  tsSheet.getRange('A2').setValue('Rows loaded:');
  tsSheet.getRange('B2').setValue(rows.length);
  Logger.log('Loaded ' + rows.length + ' rows.');
}

// ═════════════════════════════════════════════════════════════
// ONE-TIME SETUP HELPERS
// Run from the Apps Script editor. After running, blank the values
// inside setCredentials() so the source code doesn't hold secrets.
// ═════════════════════════════════════════════════════════════

/**
 * Run ONCE from the editor to seed Script Properties.
 * After it runs, edit the four strings below back to '' and save.
 *
 * The URL should be the full BAQ data endpoint — same shape the old
 * EPICOR_URL had. If you can't find it, the KPI Board script builds
 * one like this:
 *   https://centralusdtapp38.epicorsaas.com/SaaS886/api/v2/odata/<COMPANY>/BaqSvc/<BAQ_NAME>/Data
 */
function setCredentials() {
  // TODO: paste real values, run this function once, then blank them again.
  const url      = '';   // full BAQ data URL
  const username = '';   // Epicor user (preferably a service account)
  const password = '';   // that user's password
  const apiKey   = '';   // API Key generated in Epicor Kinetic admin

  if (!url || !username || !password || !apiKey) {
    throw new Error('Fill in all four values inside setCredentials() before running it.');
  }
  PropertiesService.getScriptProperties().setProperties({
    EPICOR_URL:      url,
    EPICOR_USERNAME: username,
    EPICOR_PASSWORD: password,
    EPICOR_API_KEY:  apiKey,
  });
  Logger.log('Credentials stored. Blank the values inside setCredentials() and save.');
}

/**
 * Sanity check — calls Epicor with the stored credentials and logs the
 * result without touching any sheets. Use this immediately after
 * setCredentials() to confirm the API key is accepted, and again the
 * day 2FA gets turned on.
 *
 * Likely failure modes:
 *   401 + "You can only log on via single sign-on" → the user account has been
 *                                                    switched to SSO. Basic Auth
 *                                                    is rejected outright. Either
 *                                                    use a local (non-SSO) service
 *                                                    account, try testApiKeyOnly(),
 *                                                    or switch to OAuth.
 *   401 + body mentions MFA / multi-factor  → API Key is missing or invalid
 *   401 + "Invalid credentials"             → password changed when MFA was enabled
 *   403                                     → user lacks REST/BAQ access — talk to Epicor admin
 *   302 / HTML response                     → tenant moved to SSO, need OAuth instead of Basic
 */
function testEpicorConnection() {
  const cfg = getEpicorConfig_();
  const response = UrlFetchApp.fetch(cfg.url, {
    method: 'get',
    headers: {
      'Authorization': 'Basic ' + Utilities.base64Encode(cfg.username + ':' + cfg.password),
      'X-API-Key':     cfg.apiKey,
      'Accept':        'application/json'
    },
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code !== 200) {
    Logger.log('FAIL — HTTP ' + code);
    Logger.log(body.substring(0, 800));
    throw new Error('Epicor test failed: HTTP ' + code);
  }
  const parsed = JSON.parse(body);
  const n = (parsed.value || []).length;
  Logger.log('OK — Epicor returned ' + n + ' rows');
  return n;
}

/**
 * Diagnostic — calls Epicor with ONLY the API Key (no Authorization header).
 *
 * Use this when the normal test fails with "You can only log on via single
 * sign-on". Some Epicor tenants accept the API Key alone as a full credential,
 * which would bypass the SSO restriction on the user. Most don't, but it costs
 * nothing to try before going to your admin for a local service account.
 *
 * Possible outcomes:
 *   200                  → API Key alone works. Modify refreshEpicorData() to
 *                          drop the Authorization header (or call me to do it).
 *   401 / "API Key required to be paired with credentials"  → No luck, you'll
 *                          need a non-SSO service account or OAuth.
 *   401 / SSO message    → Same — API Key alone is not enough on this tenant.
 */
function testApiKeyOnly() {
  const cfg = getEpicorConfig_();
  const response = UrlFetchApp.fetch(cfg.url, {
    method: 'get',
    headers: {
      'X-API-Key': cfg.apiKey,
      'Accept':    'application/json'
    },
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const body = response.getContentText();
  Logger.log('HTTP ' + code);
  Logger.log(body.substring(0, 800));
  if (code === 200) {
    const n = (JSON.parse(body).value || []).length;
    Logger.log('OK — API Key alone worked. ' + n + ' rows returned.');
  }
  return code;
}

// ── Orphan Assignments sheet helper ──────────────────────────
// Columns: A=Part # | B=Part Name | C=Assigned Line | D=Assigned Station | E=Assigned Date
function getOrCreateOrphanSheet(ss) {
  let sheet = ss.getSheetByName('Orphan Assignments');
  if (!sheet) {
    sheet = ss.insertSheet('Orphan Assignments');
    sheet.appendRow(['Part #', 'Part Name', 'Assigned Line', 'Assigned Station', 'Assigned Date']);
    const header = sheet.getRange(1, 1, 1, 5);
    header.setFontWeight('bold');
    header.setBackground('#1a1e24');
    header.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 220);
    sheet.setColumnWidth(3, 130);
    sheet.setColumnWidth(4, 160);
    sheet.setColumnWidth(5, 120);
  }
  return sheet;
}
// ── Apollo Cycle Log helper ───────────────────────────────────
// Columns: A=Date | B=Station | C=Cycle # | D=Cycle Start (CST) |
// E=Cycle End (CST) | F=Active Time | G=Hold Time |
// H=Break Time | I=Andon Time
// Added: PR 5a. One row per completed station cycle (Done click).
function getOrCreateStationCycleSheet(ss) {
  var sheet = ss.getSheetByName('Apollo Cycle Log');
  if (!sheet) {
    sheet = ss.insertSheet('Apollo Cycle Log');
    sheet.appendRow(['Date', 'Station', 'Cycle #', 'Cycle Start (CST)', 'Cycle End (CST)', 'Active Time', 'Hold Time', 'Break Time', 'Andon Time']);
    var header = sheet.getRange(1, 1, 1, 9);
    header.setFontWeight('bold');
    header.setBackground('#1a1e24');
    header.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 180);
    sheet.setColumnWidth(3, 80);
    sheet.setColumnWidth(4, 180);
    sheet.setColumnWidth(5, 180);
    sheet.setColumnWidth(6, 100);
    sheet.setColumnWidth(7, 100);
    sheet.setColumnWidth(8, 100);
    sheet.setColumnWidth(9, 100);
  }
  return sheet;
}
// ── Line Cycle Log helper ─────────────────────────────────────
// Columns: A=Date | B=Line | C=Cycle # | D=Cycle Start (CST) |
// E=Cycle End (CST) | F=Active Time | G=Takt Target |
// H=Variance | I=Compliance
// Added: PR 5a. Handler is scaffolded; no writes happen until PR 5c wires
// Skirting completion as the line-cycle trigger.
function getOrCreateLineCycleSheet(ss) {
  var sheet = ss.getSheetByName('Line Cycle Log');
  if (!sheet) {
    sheet = ss.insertSheet('Line Cycle Log');
    sheet.appendRow(['Date', 'Line', 'Cycle #', 'Cycle Start (CST)', 'Cycle End (CST)', 'Active Time', 'Takt Target', 'Variance', 'Compliance']);
    var header = sheet.getRange(1, 1, 1, 9);
    header.setFontWeight('bold');
    header.setBackground('#1a1e24');
    header.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 80);
    sheet.setColumnWidth(4, 180);
    sheet.setColumnWidth(5, 180);
    sheet.setColumnWidth(6, 100);
    sheet.setColumnWidth(7, 100);
    sheet.setColumnWidth(8, 100);
    sheet.setColumnWidth(9, 100);
  }
  return sheet;
}
// ── Bundles sheet helper ──────────────────────────────────────
// A "bundle" is a definitional grouping of parts that travel together (e.g.
// "Enclosure Box" contains 5x Part-X, 10x Part-Y, ...). Bundles are NOT
// inventoried themselves — stocking levels live at the child-part level only.
// When a bundle is picked/stowed/transferred, the system expands the action
// into child-part transactions automatically.
//
// Sheet layout — one row per bundle:
//   A: Bundle Name (human-readable, unique, e.g. "Enclosure Box")
//   B: Assigned Lines (comma-separated, e.g. "Apollo" or "Apollo, XF/PRO";
//      blank = available on every line)
//   C: Child 1 Part#
//   D: Child 1 Qty
//   E: Child 2 Part#
//   F: Child 2 Qty
//   ... out to 20 child-part pairs
// Empty child slots are skipped. Validation enforced at read time.
function getOrCreateBundleSheet(ss) {
  var sheet = ss.getSheetByName('Bundles');
  if (!sheet) {
    sheet = ss.insertSheet('Bundles');
    var headers = ['Bundle Name', 'Assigned Lines'];
    for (var i = 1; i <= 20; i++) {
      headers.push('Part ' + i + ' #');
      headers.push('Part ' + i + ' Qty');
    }
    sheet.appendRow(headers);
    var header = sheet.getRange(1, 1, 1, headers.length);
    header.setFontWeight('bold');
    header.setBackground('#1a1e24');
    header.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(2);
    sheet.setColumnWidth(1, 200); // Bundle Name
    sheet.setColumnWidth(2, 180); // Assigned Lines
    for (var c = 3; c <= headers.length; c += 2) {
      sheet.setColumnWidth(c, 120);     // Part #
      sheet.setColumnWidth(c + 1, 70);  // Qty
    }
  }
  return sheet;
}
// Known production line names — used to validate the "Assigned Lines" cell.
// Values are stored lowercase for case-insensitive matching; the display form
// is preserved from the sheet. Unknown line names are logged as warnings.
var KNOWN_LINES = ['apollo', 'xf/pro', 'titan', 'vulcan', 'xr', 'mr1', 'shipping'];
// Read and validate bundle definitions. Returns { bundles: [...], warnings: [...] }
// Each bundle: { name, assignedLines: [...], children: [{partNum, qty}] }
// assignedLines: [] means the bundle is available on every line.
// Warnings array contains human-readable strings for skipped/malformed entries.
function readBundles(ss) {
  var sheet = getOrCreateBundleSheet(ss);
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { bundles: [], warnings: [] };
  var bundles = [];
  var warnings = [];
  var seenNames = {};
  var nameIndex = {}; // lowercase name -> index into bundles[] (for duplicate-row merging)
  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    var name = String(row[0] || '').trim();
    if (!name) continue; // blank row, skip silently
    // Parse Assigned Lines (column B). Empty = available everywhere.
    var linesCell = String(row[1] || '').trim();
    var assignedLines = [];
    if (linesCell) {
      var parts = linesCell.split(',');
      for (var p = 0; p < parts.length; p++) {
        var ln = parts[p].trim();
        if (!ln) continue;
        if (KNOWN_LINES.indexOf(ln.toLowerCase()) === -1) {
          warnings.push('Bundle "' + name + '": unknown line "' + ln + '" ignored');
          continue;
        }
        // Deduplicate (case-insensitive)
        var already = assignedLines.some(function(x){ return x.toLowerCase() === ln.toLowerCase(); });
        if (!already) assignedLines.push(ln);
      }
    }
    var children = [];
    var bad = false;
    // Child pairs now start at column C (index 2): C,D = child 1; E,F = child 2; etc.
    for (var c = 2; c + 1 < row.length; c += 2) {
      var cPart = String(row[c] || '').trim();
      var cQty = row[c + 1];
      if (!cPart) continue;
      var qtyNum = parseInt(cQty);
      if (!qtyNum || qtyNum <= 0) {
        warnings.push('Bundle "' + name + '" child "' + cPart + '": invalid qty "' + cQty + '", bundle skipped');
        bad = true; break;
      }
      children.push({ partNum: cPart, qty: qtyNum });
    }
    if (bad) continue;
    if (!children.length) {
      warnings.push('Bundle "' + name + '": no valid children defined, skipped');
      continue;
    }
    var key = name.toLowerCase();
    if (seenNames[key]) {
      // Duplicate row for an existing bundle: merge its Assigned Lines so the
      // same bundle can be listed on multiple rows (one row per line) OR use a
      // comma-separated list in one row — both now work. Children come from
      // the first row; warn if a duplicate row disagrees.
      var existing = bundles[nameIndex[key]];
      var sameChildren = children.length === existing.children.length &&
        children.every(function (c, i) {
          return c.partNum.toLowerCase() === existing.children[i].partNum.toLowerCase() &&
                 c.qty === existing.children[i].qty;
        });
      if (!sameChildren) {
        warnings.push('Bundle "' + name + '" (row ' + (r + 1) + '): duplicate row has different parts — kept parts from first row, merged lines only');
      }
      if (!linesCell || existing.assignedLines.length === 0) {
        // Either row blank = available on every line wins.
        existing.assignedLines = [];
      } else {
        for (var m = 0; m < assignedLines.length; m++) {
          var mln = assignedLines[m];
          var dup = existing.assignedLines.some(function (x) { return x.toLowerCase() === mln.toLowerCase(); });
          if (!dup) existing.assignedLines.push(mln);
        }
      }
      continue;
    }
    seenNames[key] = true;
    nameIndex[key] = bundles.length;
    bundles.push({ name: name, assignedLines: assignedLines, children: children });
  }
  // Second pass: reject bundles whose children include another bundle's name (no nesting).
  // This is O(n*m) but n and m are both tiny (bundle counts in the single digits).
  var validBundles = [];
  for (var b = 0; b < bundles.length; b++) {
    var nested = null;
    for (var k = 0; k < bundles[b].children.length; k++) {
      var childPart = bundles[b].children[k].partNum.toLowerCase();
      if (seenNames[childPart] && childPart !== bundles[b].name.toLowerCase()) {
        nested = bundles[b].children[k].partNum;
        break;
      }
    }
    if (nested) {
      warnings.push('Bundle "' + bundles[b].name + '": child "' + nested + '" is itself a bundle (nesting not allowed), skipped');
      continue;
    }
    validBundles.push(bundles[b]);
  }
  if (warnings.length) {
    console.warn('Bundle sheet warnings:', warnings.join(' | '));
  }
  return { bundles: validBundles, warnings: warnings };
}
// ── Epicor on-hand reader ─────────────────────────────────────
// Reads the BAQ_Data sheet (populated by refreshEpicorData on a 1-minute
// trigger) and returns:
//   { onHand: { partNumLower: qty, ... }, lastRefresh: ISO_string|null }
// The BAQ output uses these column headers:
//   Part_PartNum         → part number
//   Calculated_PartQty   → factory-wide on-hand
// Other columns are ignored. Missing sheet returns empty map.
function readEpicorOnHand(ss) {
  var sheet = ss.getSheetByName('BAQ_Data');
  if (!sheet) return { onHand: {}, lastRefresh: null };
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { onHand: {}, lastRefresh: null };
  var headers = rows[0];
  var pnCol = -1;
  var qtyCol = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim();
    if (h === 'Part_PartNum') pnCol = i;
    if (h === 'Calculated_PartQty') qtyCol = i;
  }
  if (pnCol === -1 || qtyCol === -1) {
    Logger.log('readEpicorOnHand: required columns not found in BAQ_Data');
    return { onHand: {}, lastRefresh: null };
  }
  var onHand = {};
  for (var r = 1; r < rows.length; r++) {
    var pn = String(rows[r][pnCol] || '').trim();
    if (!pn) continue;
    var qty = parseFloat(rows[r][qtyCol]);
    if (isNaN(qty)) qty = 0;
    // Last write wins if duplicates somehow exist
    onHand[pn.toLowerCase()] = qty;
  }
  // Pull last-refresh timestamp from the Refresh_Log sheet (written by
  // refreshEpicorData at the end of each successful pull).
  var lastRefresh = null;
  var logSheet = ss.getSheetByName('Refresh_Log');
  if (logSheet) {
    var v = logSheet.getRange('B1').getValue();
    if (v instanceof Date) lastRefresh = v.toISOString();
  }
  return { onHand: onHand, lastRefresh: lastRefresh };
}
// ── Epicor trigger setup ─────────────────────────────────────
// Run this ONCE manually after deploying to install the auto-refresh trigger.
// Points at refreshEpicorDataSafe (re-entrancy protected).
// Idempotent — running it again removes existing triggers and installs fresh.
//
// Trigger frequency: every hour. Apps Script caps UrlFetchApp at a daily quota
// and faster polling exhausted it. Hourly = 24 calls/day, well within budget.
// For ad-hoc updates, run refreshEpicorData manually from the editor.
function setupEpicorTrigger() {
  // Remove any existing triggers for either function name (covers the case
  // where an old setup pointed at refreshEpicorData directly).
  var existing = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < existing.length; i++) {
    var name = existing[i].getHandlerFunction();
    if (name === 'refreshEpicorData' || name === 'refreshEpicorDataSafe') {
      ScriptApp.deleteTrigger(existing[i]);
      removed++;
    }
  }
  // Install fresh hourly trigger pointing at the safe wrapper
  ScriptApp.newTrigger('refreshEpicorDataSafe')
    .timeBased()
    .everyHours(1)
    .create();
  Logger.log('Removed ' + removed + ' old triggers; installed hourly trigger for refreshEpicorDataSafe');
}
// Re-entrancy-protected wrapper around refreshEpicorData. If a previous tick
// is still running (slow Epicor response), this one bails immediately rather
// than queuing — prevents pile-up if the API gets sluggish.
function refreshEpicorDataSafe() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    Logger.log('refreshEpicorDataSafe: another refresh is in progress; skipping this tick');
    return;
  }
  try {
    refreshEpicorData();
  } finally {
    lock.releaseLock();
  }
}
// Columns: A=Date | B=Time (CST) | C=Part # | D=Qty Transacted | E=New Qty |
// F=Total On-Hand | G=Transaction Type | H=Location | I=Production Line |
// J=Priority | K=Submitted At (CST) | L=Total Time
// Columns J–L populated for request-related rows (Pick / Cancelled); Stow rows
// leave them blank. Total On-Hand is computed fresh on every write.
function appendTransaction(ss, data) {
  var sheet = ss.getSheetByName('Transaction Log');
  if (!sheet) {
    sheet = ss.insertSheet('Transaction Log');
    sheet.appendRow(['Date', 'Time (CST)', 'Part #', 'Qty Transacted', 'New Qty', 'Total On-Hand', 'Transaction Type', 'Location', 'Production Line', 'Priority', 'Submitted At (CST)', 'Total Time', 'User']);
    var header = sheet.getRange(1, 1, 1, 13);
    header.setFontWeight('bold');
    header.setBackground('#1a1e24');
    header.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 120);
    sheet.setColumnWidth(4, 120);
    sheet.setColumnWidth(5, 80);
    sheet.setColumnWidth(6, 110);
    sheet.setColumnWidth(7, 150);
    sheet.setColumnWidth(8, 120);
    sheet.setColumnWidth(9, 130);
    sheet.setColumnWidth(10, 80);
    sheet.setColumnWidth(11, 180);
    sheet.setColumnWidth(12, 100);
  }
  // Col M = User (picker login name). Backfills the header on older sheets.
  try { if (String(sheet.getRange(1, 13).getValue() || '') === '') sheet.getRange(1, 13).setValue('User').setFontWeight('bold'); } catch (uErr) {}
  var now = new Date();
  var cstDate = Utilities.formatDate(now, 'America/Chicago', 'MM/dd/yyyy');
  var cstTime = Utilities.formatDate(now, 'America/Chicago', 'HH:mm:ss');
  sheet.appendRow([
    cstDate, cstTime,
    String(data.partNum || ''),
    data.qtyTransacted,
    (data.newQty === undefined || data.newQty === '') ? '' : data.newQty,
    (data.totalOnHand === undefined || data.totalOnHand === '') ? '' : data.totalOnHand,
    String(data.txType || ''),
    String(data.location || ''),
    String(data.line || ''),
    String(data.priority || ''),
    String(data.submittedAt || ''),
    String(data.totalTime || ''),
    String(data.user || ''),
  ]);
}
// Sum quantities across every location row for a given part number.
function computeTotalOnHand(locSheet, partNum) {
  var pn = String(partNum || '').trim().toLowerCase();
  if (!pn || !locSheet) return '';
  var rows = locSheet.getDataRange().getValues();
  var total = 0;
  for (var i = 1; i < rows.length; i++) {
    var rowPn = String(rows[i][18] || '').trim().toLowerCase();
    if (rowPn === pn) total += parseInt(rows[i][17]) || 0;
  }
  return total;
}
// ── Line Inventory helpers (Phase 2) ─────────────────────────
// Tracks how much of each part is staged on each production line. Purely
// additive: if this tab is empty, nothing else in the system changes.
// Columns: A=Line | B=Part # | C=Part Name | D=On-Line Qty | E=Reorder Point |
// F=Replenish-To | G=Auto-Reorder | H=Last Updated | I=Status
// Reorder Point / Replenish-To / Auto-Reorder are MANUAL (see DESIGN §4.1/§6)
// and are never overwritten by automated qty updates.
function getOrCreateLineInventorySheet(ss) {
  var sheet = ss.getSheetByName('Line Inventory');
  if (!sheet) {
    sheet = ss.insertSheet('Line Inventory');
    sheet.appendRow(['Line', 'Part #', 'Part Name', 'On-Line Qty', 'Reorder Point', 'Replenish-To', 'Auto-Reorder', 'Last Updated', 'Status']);
    var header = sheet.getRange(1, 1, 1, 9);
    header.setFontWeight('bold');
    header.setBackground('#1a1e24');
    header.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 120);
    sheet.setColumnWidth(3, 220);
    sheet.setColumnWidth(4, 100);
    sheet.setColumnWidth(5, 110);
    sheet.setColumnWidth(6, 110);
    sheet.setColumnWidth(7, 110);
    sheet.setColumnWidth(8, 160);
    sheet.setColumnWidth(9, 90);
  }
  return sheet;
}
// Display status from qty + (optional) reorder point. OUT at/below 0, BELOW when
// at/under a set reorder point, otherwise OK.
function lineInvStatus_(qty, reorderPoint) {
  var q = parseFloat(qty); if (isNaN(q)) q = 0;
  if (q <= 0) return 'OUT';
  var rp = parseFloat(reorderPoint);
  if (!isNaN(rp) && rp > 0 && q <= rp) return 'BELOW';
  return 'OK';
}
// Apply a signed delta to a (line, part)'s On-Line Qty, floored at 0. Creates the
// row if missing. Manual columns (E/F/G) are never touched. Returns the new qty.
// Phase 2 passes positive deltas (pick → line); Phase 3 reuses this with negatives
// (consumption) so the floor-at-zero rule lives in exactly one place.
function bumpLineInventory(ss, line, partNum, partName, delta, createIfMissing) {
  if (createIfMissing === undefined) createIfMissing = true;
  var ln = String(line || '').trim();
  var pn = String(partNum || '').trim();
  if (!ln || !pn) return null;
  var sheet = getOrCreateLineInventorySheet(ss);
  var rows = sheet.getDataRange().getValues();
  var nowStr = Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy HH:mm:ss');
  for (var i = 1; i < rows.length; i++) {
    var rLine = String(rows[i][0] || '').trim().toLowerCase();
    var rPart = String(rows[i][1] || '').trim().toLowerCase();
    if (rLine === ln.toLowerCase() && rPart === pn.toLowerCase()) {
      var cur = parseFloat(rows[i][3]); if (isNaN(cur)) cur = 0;
      var next = Math.max(0, cur + delta);
      sheet.getRange(i + 1, 4).setValue(next);                            // On-Line Qty
      sheet.getRange(i + 1, 8).setValue(nowStr);                          // Last Updated
      sheet.getRange(i + 1, 9).setValue(lineInvStatus_(next, rows[i][4])); // Status
      if (partName && !String(rows[i][2] || '').trim()) sheet.getRange(i + 1, 3).setValue(String(partName));
      return next;
    }
  }
  if (!createIfMissing) return null;  // consumption/scrap: never create a row for a part not staged on the line
  var startQty = Math.max(0, delta);
  sheet.appendRow([ln, pn, String(partName || ''), startQty, '', '', 'off', nowStr, lineInvStatus_(startQty, '')]);
  return startQty;
}
// Read the Line Inventory tab → array of objects for doGet. Missing/empty → [].
function readLineInventory(ss) {
  var sheet = ss.getSheetByName('Line Inventory');
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var line = String(rows[i][0] || '').trim();
    var partNum = String(rows[i][1] || '').trim();
    if (!line || !partNum) continue;
    var rp = (rows[i][4] === '' || rows[i][4] === null) ? '' : (parseFloat(rows[i][4]) || 0);
    var rt = (rows[i][5] === '' || rows[i][5] === null) ? '' : (parseFloat(rows[i][5]) || 0);
    out.push({
      line: line,
      partNum: partNum,
      partName: String(rows[i][2] || '').trim(),
      onLineQty: parseFloat(rows[i][3]) || 0,
      reorderPoint: rp,
      replenishTo: rt,
      autoReorder: String(rows[i][6] || 'off').trim().toLowerCase() === 'on',
      status: String(rows[i][8] || '').trim() || lineInvStatus_(rows[i][3], rows[i][4]),
    });
  }
  return out;
}
// ── Phase 3: nightly consumption + scrap → line inventory ─────
// Pulls yesterday's actual component issues (BF_DailyLineConsumption) and scrap
// (BF_DailyScrap) and decrements Line Inventory. Reuses the stored Epicor
// credentials and derives each BAQ URL from EPICOR_URL, so no new config is
// needed beyond the two BAQ names. NOTHING runs until setupLineConsumptionTrigger()
// is run once, or testLineConsumption() is run manually.
var BAQ_CONSUMPTION = 'BF_DailyLineConsumption';
var BAQ_SCRAP       = 'BF_DailyScrap';
// STK-CUS (single SKUs shipped straight to customers). These carry no job/line
// in Epicor, but the physical units were picked TO a line (usually Shipping)
// before shipping — without this pull, on-line counts for shipped SKUs accrue
// forever. Built as a mirror of BF_DailyScrap: PartTran filtered to
// TranType='STK-CUS' with the same @FromDate/@ToDate params, returning
// Part / Quantity / TranDate. Until the BAQ exists, the fetch fails soft and
// the run logs a note — nothing else is affected.
var BAQ_STKCUS      = 'BF_DailyStkCus';

// First present value among candidate keys (OData may name fields by display
// alias OR Table_Field OR Calculated_*). Mirrors production-data's findCol logic.
function pick_(obj, names) {
  for (var i = 0; i < names.length; i++) {
    if (obj[names[i]] !== undefined && obj[names[i]] !== null && obj[names[i]] !== '') return obj[names[i]];
  }
  return undefined;
}
// Build a BAQ Data URL for <baqId> + query params, derived from the stored
// EPICOR_URL (…/BaqSvc/<name>/Data).
function buildBaqUrl_(baqId, params) {
  var cfg = getEpicorConfig_();
  var base = cfg.url.replace(/BaqSvc\/[^/]+\/Data.*$/, 'BaqSvc/' + baqId + '/Data');
  if (base.indexOf('BaqSvc/' + baqId + '/Data') === -1) {
    throw new Error('Could not derive BAQ URL from EPICOR_URL: ' + cfg.url);
  }
  var qs = Object.keys(params || {}).map(function(k){ return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  return qs ? (base + '?' + qs) : base;
}
// Fetch a BAQ's rows (.value array) using the stored Basic + X-API-Key creds.
function fetchBaqRows_(baqId, params) {
  var cfg = getEpicorConfig_();
  var resp = UrlFetchApp.fetch(buildBaqUrl_(baqId, params), {
    method: 'get',
    headers: {
      'Authorization': 'Basic ' + Utilities.base64Encode(cfg.username + ':' + cfg.password),
      'X-API-Key': cfg.apiKey,
      'Accept': 'application/json'
    },
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  if (code !== 200) throw new Error('BAQ ' + baqId + ' HTTP ' + code + ': ' + resp.getContentText().substring(0, 400));
  return JSON.parse(resp.getContentText()).value || [];
}
// Machine → Line map tab. A=Make-Part | B=Line | C=Description | D=Notes.
function getOrCreateMachineLineSheet(ss) {
  var sheet = ss.getSheetByName('Machine Line Map');
  if (!sheet) {
    sheet = ss.insertSheet('Machine Line Map');
    sheet.appendRow(['Make-Part', 'Line', 'Description', 'Notes']);
    var h = sheet.getRange(1, 1, 1, 4); h.setFontWeight('bold'); h.setBackground('#1a1e24'); h.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 200); sheet.setColumnWidth(2, 110); sheet.setColumnWidth(3, 280); sheet.setColumnWidth(4, 200);
  }
  return sheet;
}
// → { makePartLower: [line, ...] }. A make-part may appear on more than one line
// (e.g. a subassembly used by two machines) — each row adds a line.
function readMachineLineMap(ss) {
  var sheet = getOrCreateMachineLineSheet(ss);
  var rows = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < rows.length; i++) {
    var mk = String(rows[i][0] || '').trim();
    var ln = String(rows[i][1] || '').trim();
    if (!mk || !ln) continue;
    var k = mk.toLowerCase();
    if (!map[k]) map[k] = [];
    if (map[k].indexOf(ln) === -1) map[k].push(ln);
  }
  return map;
}
// → [{ makePart, line, description }] in original case — for the scheduling service's
// finished-goods SKU dropdown (so SKUs are picked, never typed). Additive: read-only.
function readMachineMapRows(ss) {
  var sheet = getOrCreateMachineLineSheet(ss);
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var mk = String(rows[i][0] || '').trim();
    var ln = String(rows[i][1] || '').trim();
    if (!mk || !ln) continue;
    out.push({ makePart: mk, line: ln, description: String(rows[i][2] || '').trim() });
  }
  return out;
}
// Needs Review tab — exceptions, never silent loss.
function getOrCreateNeedsReviewSheet(ss) {
  var sheet = ss.getSheetByName('Needs Review');
  if (!sheet) {
    sheet = ss.insertSheet('Needs Review');
    sheet.appendRow(['Logged (CST)', 'Kind', 'Part', 'Qty', 'Job', 'MakePart', 'Reason', 'Resolve → Line', 'Status', 'Resolved (CST)']);
    var h = sheet.getRange(1, 1, 1, 10); h.setFontWeight('bold'); h.setBackground('#1a1e24'); h.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  // Backfill the resolution columns on sheets created before they existed.
  try {
    if (String(sheet.getRange(1, 8).getValue() || '') === '') {
      sheet.getRange(1, 8, 1, 3).setValues([['Resolve → Line', 'Status', 'Resolved (CST)']])
        .setFontWeight('bold').setBackground('#1a1e24').setFontColor('#ffffff');
    }
  } catch (nrErr) {}
  return sheet;
}

// ── Needs Review resolution (run from the PMS Tools menu) ─────
// A review row is a MISSED line-inventory decrement, so resolving it applies
// the subtraction — not just marks it read. Workflow for the reviewer:
//   1. In column H type the line the qty actually came off (Apollo, XR, …),
//      or 'ignore' if no correction is needed (e.g. warehouse-direct).
//   2. Sheet menu → PMS Tools → Resolve Needs Review rows.
// Each filled row is processed once: subtract |Qty| from Line Inventory
// (line, part), floored at 0; Status + timestamp written in I/J. A line the
// part isn't tracked on gets a clear error in Status instead of a guess.
function resolveNeedsReviewRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateNeedsReviewSheet(ss);
  var rows = sheet.getDataRange().getValues();
  var nowStr = Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy HH:mm:ss');
  var resolved = 0, ignored = 0, errors = 0;
  for (var i = 1; i < rows.length; i++) {
    var target = String(rows[i][7] || '').trim();           // H: Resolve → Line
    var status = String(rows[i][8] || '').trim();           // I: Status
    if (!target || status) continue;                        // nothing entered, or already handled
    var part = String(rows[i][2] || '').trim();
    var qty  = Math.abs(parseFloat(rows[i][3]) || 0);
    if (target.toLowerCase() === 'ignore' || target.toLowerCase() === 'skip') {
      sheet.getRange(i + 1, 9, 1, 2).setValues([['Ignored', nowStr]]);
      ignored++;
      continue;
    }
    if (!part || qty <= 0) {
      sheet.getRange(i + 1, 9).setValue('Error: no part/qty on row');
      errors++;
      continue;
    }
    // createIfMissing=false: only subtract from a line that actually tracks the
    // part — a typo'd line name gets an error, never a silent new row.
    var newQty = bumpLineInventory(ss, target, part, '', -qty, false);
    if (newQty === null) {
      sheet.getRange(i + 1, 9).setValue('Error: ' + part + ' not tracked on "' + target + '" — check the line name');
      errors++;
      continue;
    }
    sheet.getRange(i + 1, 9, 1, 2).setValues([['Resolved — subtracted ' + qty + ' from ' + target + ' (now ' + newQty + ')', nowStr]]);
    resolved++;
  }
  var msg = 'Needs Review: ' + resolved + ' resolved, ' + ignored + ' ignored, ' + errors + ' errors';
  Logger.log(msg);
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'PMS Tools', 8); } catch (tErr) {}
  return msg;
}

// ── Sheet menu so resolution never requires the script editor ──
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('PMS Tools')
      .addItem('Resolve Needs Review rows', 'resolveNeedsReviewRows')
      .addToUi();
  } catch (mErr) { /* simple-trigger context without UI */ }
}
// One summary row per nightly run (bounded — good for monitoring).
function logConsumptionRun_(ss, s) {
  var sheet = ss.getSheetByName('Line Consumption Log');
  if (!sheet) {
    sheet = ss.insertSheet('Line Consumption Log');
    sheet.appendRow(['Run (CST)', 'For Date', 'Consumption rows', 'Applied', 'Skipped (untracked)', 'Needs Review', 'Scrap rows', 'Scrap applied', 'Notes']);
    var h = sheet.getRange(1, 1, 1, 9); h.setFontWeight('bold'); h.setBackground('#1a1e24'); h.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy HH:mm:ss'),
    s.forDate, s.conRows, s.applied, s.skipped, s.review, s.scrapRows, s.scrapApplied, s.notes || '']);
}
// Core nightly job. dateStr = 'yyyy-MM-dd'; defaults to yesterday (America/Chicago).
function runLineConsumption(dateStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var day = dateStr || Utilities.formatDate(new Date(Date.now() - 86400000), 'America/Chicago', 'yyyy-MM-dd');
  var nowStr = Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy HH:mm:ss');
  var map = readMachineLineMap(ss);
  var s = { forDate: day, conRows: 0, applied: 0, skipped: 0, review: 0, scrapRows: 0, scrapApplied: 0, notes: '' };

  // A single day can carry 1000+ rows, so EVERYTHING is aggregated in memory and
  // written in batches — per-row sheet writes time out. SEP joins composite keys.
  var SEP = '~|~';
  var reviewRows = [];     // batched Needs Review rows
  var newMachines = {};    // unmapped machine (lower) -> {mk, desc}
  var decrements = {};     // 'line<SEP>part' (lower) -> {line, part, qty}

  // ── Consumption (actual STK-MTL issues) ──
  var con;
  try { con = fetchBaqRows_(BAQ_CONSUMPTION, { FromDate: day, ToDate: day }); }
  catch (e) { s.notes = 'consumption fetch failed: ' + e.message; logConsumptionRun_(ss, s); throw e; }
  s.conRows = con.length;
  for (var i = 0; i < con.length; i++) {
    var r = con[i];
    var comp = String(pick_(r, ['Component', 'Calculated_Component', 'PartTran_PartNum']) || '').trim();
    var qty  = parseFloat(pick_(r, ['Quantity', 'Calculated_Quantity', 'PartTran_TranQty']) || 0) || 0;
    var mk   = String(pick_(r, ['MakePart', 'Calculated_MakePart', 'JobHead_PartNum']) || '').trim();
    var job  = String(pick_(r, ['Job', 'Calculated_Job', 'PartTran_JobNum']) || '').trim();
    var desc = String(pick_(r, ['MakePartDesc', 'Calculated_MakePartDesc', 'JobHead_PartDescription']) || '');
    if (!comp || qty <= 0) continue;
    var lines = mk ? (map[mk.toLowerCase()] || []) : [];
    if (lines.length !== 1) {
      // 0 = unmapped machine; >1 = ambiguous (which line consumed it?). Both → review.
      if (mk && lines.length === 0 && !(mk.toLowerCase() in map) && !(mk.toLowerCase() in newMachines)) newMachines[mk.toLowerCase()] = { mk: mk, desc: desc };
      reviewRows.push([nowStr, 'Consumption', comp, qty, job, mk,
        lines.length > 1 ? 'Make-part maps to multiple lines — assign manually' : (mk ? 'Machine not mapped to a line' : 'No make-part on job')]);
      s.review++;
      continue;
    }
    var k = lines[0].toLowerCase() + SEP + comp.toLowerCase();
    if (!decrements[k]) decrements[k] = { line: lines[0], part: comp, qty: 0 };
    decrements[k].qty += qty;
  }

  // ── Scrap (Reason Code = SCRAP), aggregated per part ──
  var scrap = [];
  try { scrap = fetchBaqRows_(BAQ_SCRAP, { FromDate: day, ToDate: day }); }
  catch (e) { s.notes += ' | scrap fetch failed: ' + e.message; }
  s.scrapRows = scrap.length;
  var scrapByPart = {};    // partLower -> {part, qty}
  for (var j = 0; j < scrap.length; j++) {
    var sp = String(pick_(scrap[j], ['Part', 'Calculated_Part', 'PartTran_PartNum']) || '').trim();
    var sq = Math.abs(parseFloat(pick_(scrap[j], ['Quantity', 'Calculated_Quantity', 'PartTran_TranQty']) || 0) || 0);
    if (!sp || sq <= 0) continue;
    var sk = sp.toLowerCase();
    if (!scrapByPart[sk]) scrapByPart[sk] = { part: sp, qty: 0 };
    scrapByPart[sk].qty += sq;
  }

  // ── STK-CUS (single SKUs shipped to customers), aggregated per part ──
  // Fails soft until BF_DailyStkCus is built in Epicor.
  var cus = [];
  var cusOk = true;
  try { cus = fetchBaqRows_(BAQ_STKCUS, { FromDate: day, ToDate: day }); }
  catch (e) { cusOk = false; s.notes += (s.notes ? ' | ' : '') + 'stk-cus fetch failed (BAQ built yet?): ' + String(e.message).slice(0, 80); }
  var cusByPart = {};      // partLower -> {part, qty}
  for (var c = 0; c < cus.length; c++) {
    var cp = String(pick_(cus[c], ['Part', 'Calculated_Part', 'PartTran_PartNum']) || '').trim();
    var cq = Math.abs(parseFloat(pick_(cus[c], ['Quantity', 'Calculated_Quantity', 'PartTran_TranQty']) || 0) || 0);
    if (!cp || cq <= 0) continue;
    var ck = cp.toLowerCase();
    if (!cusByPart[ck]) cusByPart[ck] = { part: cp, qty: 0 };
    cusByPart[ck].qty += cq;
  }

  // ── Apply to Line Inventory: one read, mutate in memory, one write ──
  var liSheet = getOrCreateLineInventorySheet(ss);
  var li = liSheet.getDataRange().getValues();   // [header, ...rows], 9 cols
  var idx = {};                                  // 'line<SEP>part' (lower) -> row index in li
  var linesByPart = {};                          // partLower -> [line, ...] (for scrap attribution)
  for (var m = 1; m < li.length; m++) {
    var L = String(li[m][0] || '').trim().toLowerCase();
    var P = String(li[m][1] || '').trim().toLowerCase();
    if (!L || !P) continue;
    idx[L + SEP + P] = m;
    if (!linesByPart[P]) linesByPart[P] = [];
    if (linesByPart[P].indexOf(L) === -1) linesByPart[P].push(L);
  }
  // consumption decrements — tracked parts only
  Object.keys(decrements).forEach(function(k) {
    var d = decrements[k];
    var ri = idx[k];
    if (ri === undefined) { s.skipped++; return; }
    var cur = parseFloat(li[ri][3]); if (isNaN(cur)) cur = 0;
    var next = Math.max(0, cur - d.qty);
    li[ri][3] = next; li[ri][7] = nowStr; li[ri][8] = lineInvStatus_(next, li[ri][4]);
    s.applied++;
  });
  // scrap decrements — only when the part is on exactly one line
  Object.keys(scrapByPart).forEach(function(pk) {
    var lines = linesByPart[pk];
    if (!lines || lines.length !== 1) {
      reviewRows.push([nowStr, 'Scrap', scrapByPart[pk].part, scrapByPart[pk].qty, '', '', 'Part not on exactly one line']);
      s.review++;
      return;
    }
    var ri2 = idx[lines[0] + SEP + pk];
    var cur2 = parseFloat(li[ri2][3]); if (isNaN(cur2)) cur2 = 0;
    var next2 = Math.max(0, cur2 - scrapByPart[pk].qty);
    li[ri2][3] = next2; li[ri2][7] = nowStr; li[ri2][8] = lineInvStatus_(next2, li[ri2][4]);
    s.scrapApplied++;
  });
  // STK-CUS decrements — attribution rules (rows carry no job/line):
  //   1. Part tracked on the SHIPPING line → subtract there (single SKUs ship
  //      from the shipping area, which is where they were picked to).
  //   2. Else part tracked on exactly one line → subtract there.
  //   3. Else (multiple lines / untracked) → Needs Review, never a guess.
  // Floored at 0 like everything else.
  var cusApplied = 0, cusReview = 0;
  Object.keys(cusByPart).forEach(function(pk2) {
    var entry = cusByPart[pk2];
    var ri3;
    if (idx['shipping' + SEP + pk2] !== undefined) {
      ri3 = idx['shipping' + SEP + pk2];
    } else {
      var lns = linesByPart[pk2];
      if (!lns || lns.length === 0) return;   // not line-tracked at all — warehouse ship, nothing to fix
      if (lns.length !== 1) {
        reviewRows.push([nowStr, 'STK-CUS', entry.part, entry.qty, '', '', 'Shipped to customer; part on multiple lines — subtract manually']);
        s.review++; cusReview++;
        return;
      }
      ri3 = idx[lns[0] + SEP + pk2];
    }
    var cur3 = parseFloat(li[ri3][3]); if (isNaN(cur3)) cur3 = 0;
    var next3 = Math.max(0, cur3 - entry.qty);
    li[ri3][3] = next3; li[ri3][7] = nowStr; li[ri3][8] = lineInvStatus_(next3, li[ri3][4]);
    cusApplied++;
  });
  if (cusOk) s.notes += (s.notes ? ' | ' : '') + 'stk-cus rows ' + cus.length + ', applied ' + cusApplied + ', review ' + cusReview;
  if (li.length > 1) liSheet.getRange(1, 1, li.length, li[0].length).setValues(li);

  // ── Batch-add newly-seen machines to the map (blank line for Brendan to fill) ──
  var nm = Object.keys(newMachines);
  if (nm.length) {
    var mlSheet = getOrCreateMachineLineSheet(ss);
    var nmRows = nm.map(function(key) { return [newMachines[key].mk, '', newMachines[key].desc, 'auto-added ' + nowStr]; });
    mlSheet.getRange(mlSheet.getLastRow() + 1, 1, nmRows.length, 4).setValues(nmRows);
  }
  // ── Batch-write Needs Review ──
  if (reviewRows.length) {
    var nrSheet = getOrCreateNeedsReviewSheet(ss);
    nrSheet.getRange(nrSheet.getLastRow() + 1, 1, reviewRows.length, 7).setValues(reviewRows);
  }
  // ── Enqueue replenishments for Auto-Reorder parts now below reorder ──
  try { var enq = enqueueReplenishments(ss); s.notes += (s.notes ? ' | ' : '') + 'enqueued ' + enq; }
  catch (e) { s.notes += (s.notes ? ' | ' : '') + 'enqueue failed: ' + e.message; }

  logConsumptionRun_(ss, s);
  Logger.log('runLineConsumption ' + day + ': ' + JSON.stringify(s));
  return s;
}
// ── One-time STK-CUS backfill ─────────────────────────────────
// The nightly job only processes yesterday, so line counts that accrued from
// PAST customer shipments stay inflated until counted. Run this ONCE from the
// editor after building BF_DailyStkCus, e.g.:
//   backfillStkCus('2026-04-15', '2026-06-12')
// Applies ONLY the STK-CUS logic over the range (does NOT re-run consumption or
// scrap, which would double-subtract). Same attribution rules as nightly.
function backfillStkCus(fromDate, toDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nowStr = Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy HH:mm:ss');
  var SEP = '~|~';
  var rows = fetchBaqRows_(BAQ_STKCUS, { FromDate: fromDate, ToDate: toDate });
  var byPart = {};
  for (var i = 0; i < rows.length; i++) {
    var p = String(pick_(rows[i], ['Part', 'Calculated_Part', 'PartTran_PartNum']) || '').trim();
    var q = Math.abs(parseFloat(pick_(rows[i], ['Quantity', 'Calculated_Quantity', 'PartTran_TranQty']) || 0) || 0);
    if (!p || q <= 0) continue;
    var k = p.toLowerCase();
    if (!byPart[k]) byPart[k] = { part: p, qty: 0 };
    byPart[k].qty += q;
  }
  var liSheet = getOrCreateLineInventorySheet(ss);
  var li = liSheet.getDataRange().getValues();
  var idx = {}, linesByPart = {};
  for (var m = 1; m < li.length; m++) {
    var L = String(li[m][0] || '').trim().toLowerCase();
    var P = String(li[m][1] || '').trim().toLowerCase();
    if (!L || !P) continue;
    idx[L + SEP + P] = m;
    if (!linesByPart[P]) linesByPart[P] = [];
    if (linesByPart[P].indexOf(L) === -1) linesByPart[P].push(L);
  }
  var applied = 0, review = [], skipped = 0;
  Object.keys(byPart).forEach(function(pk) {
    var e = byPart[pk], ri;
    if (idx['shipping' + SEP + pk] !== undefined) ri = idx['shipping' + SEP + pk];
    else {
      var lns = linesByPart[pk];
      if (!lns || !lns.length) { skipped++; return; }
      if (lns.length !== 1) {
        review.push([nowStr, 'STK-CUS backfill', e.part, e.qty, '', '', 'Shipped ' + fromDate + '→' + toDate + '; part on multiple lines — subtract manually']);
        return;
      }
      ri = idx[lns[0] + SEP + pk];
    }
    var cur = parseFloat(li[ri][3]); if (isNaN(cur)) cur = 0;
    var next = Math.max(0, cur - e.qty);
    li[ri][3] = next; li[ri][7] = nowStr; li[ri][8] = lineInvStatus_(next, li[ri][4]);
    applied++;
  });
  if (li.length > 1) liSheet.getRange(1, 1, li.length, li[0].length).setValues(li);
  if (review.length) {
    var nr = getOrCreateNeedsReviewSheet(ss);
    nr.getRange(nr.getLastRow() + 1, 1, review.length, 7).setValues(review);
  }
  var summary = 'backfillStkCus ' + fromDate + '→' + toDate + ': rows ' + rows.length + ', parts applied ' + applied + ', review ' + review.length + ', untracked skipped ' + skipped;
  Logger.log(summary);
  return summary;
}

// Re-entrancy-guarded wrapper for the trigger.
function runLineConsumptionSafe() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) { Logger.log('runLineConsumptionSafe: already running'); return; }
  try { runLineConsumption(); } finally { lock.releaseLock(); }
}
// Run ONCE from the editor to install the daily ~00:15 trigger.
function setupLineConsumptionTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    var n = t.getHandlerFunction();
    if (n === 'runLineConsumption' || n === 'runLineConsumptionSafe') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runLineConsumptionSafe').timeBased().everyDays(1).atHour(0).nearMinute(15).create();
  Logger.log('Installed daily line-consumption trigger (~00:15).');
}
// Manual validation: logs the real OData field names of the first row (so we can
// confirm the pick_() fallbacks), then processes a known date and logs a summary.
function testLineConsumption() {
  var rows = fetchBaqRows_(BAQ_CONSUMPTION, { FromDate: '2026-06-01', ToDate: '2026-06-01' });
  Logger.log('Consumption rows: ' + rows.length);
  if (rows.length) Logger.log('First-row field names: ' + JSON.stringify(Object.keys(rows[0])));
  var scrap = fetchBaqRows_(BAQ_SCRAP, { FromDate: '2026-05-29', ToDate: '2026-05-29' });
  Logger.log('Scrap rows (2026-05-29): ' + scrap.length);
  if (scrap.length) Logger.log('Scrap first-row field names: ' + JSON.stringify(Object.keys(scrap[0])));
  try {
    var cusT = fetchBaqRows_(BAQ_STKCUS, { FromDate: '2026-06-01', ToDate: '2026-06-01' });
    Logger.log('STK-CUS rows (2026-06-01): ' + cusT.length);
    if (cusT.length) Logger.log('STK-CUS first-row field names: ' + JSON.stringify(Object.keys(cusT[0])));
  } catch (e) { Logger.log('STK-CUS BAQ not reachable yet: ' + e.message); }
  Logger.log('TEST summary: ' + JSON.stringify(runLineConsumption('2026-06-01')));
}
// ── One-time maintenance: purge empty location rows ───────────
// Locations live in columns Q–T with A–P unused, so an emptied entry can be
// removed wholesale. Run once from the editor to clear accumulated 0-qty rows;
// going forward the subtract handler deletes a row the moment it hits 0.
function cleanupZeroQtyLocations() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Locations');
  if (!sheet) return 0;
  var rows = sheet.getDataRange().getValues();
  var removed = 0;
  // Bottom-up so deletions don't shift rows we haven't checked yet.
  for (var i = rows.length - 1; i >= 1; i--) {
    var pn = String(rows[i][18] || '').trim();
    var qty = parseInt(rows[i][17]) || 0;
    if (pn && qty === 0) { sheet.deleteRow(i + 1); removed++; }
  }
  Logger.log('cleanupZeroQtyLocations: removed ' + removed + ' empty rows');
  return removed;
}
// ── Replenishment Queue (Phase 4) ─────────────────────────────
// The nightly job appends 'pending' rows when an Auto-Reorder part drops below
// its reorder point; the PMS server turns them into pick requests and marks them
// open → fulfilled/cancelled. Columns:
// A=Queue ID | B=Created (CST) | C=Line | D=Part # | E=Part Name |
// F=Qty Needed | G=Status | H=Request ID | I=Updated (CST)
function getOrCreateReplenishmentQueueSheet(ss) {
  var sheet = ss.getSheetByName('Replenishment Queue');
  if (!sheet) {
    sheet = ss.insertSheet('Replenishment Queue');
    sheet.appendRow(['Queue ID', 'Created (CST)', 'Line', 'Part #', 'Part Name', 'Qty Needed', 'Status', 'Request ID', 'Updated (CST)']);
    var h = sheet.getRange(1, 1, 1, 9); h.setFontWeight('bold'); h.setBackground('#1a1e24'); h.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 150); sheet.setColumnWidth(2, 160); sheet.setColumnWidth(5, 220); sheet.setColumnWidth(9, 160);
  }
  return sheet;
}
// Append 'pending' replenishments for Auto-Reorder parts now below reorder point,
// de-duped against rows already pending/open. Returns the count enqueued.
function enqueueReplenishments(ss) {
  var inv = readLineInventory(ss);
  var sheet = getOrCreateReplenishmentQueueSheet(ss);
  var rows = sheet.getDataRange().getValues();
  var openKeys = {};
  for (var i = 1; i < rows.length; i++) {
    var st = String(rows[i][6] || '').trim().toLowerCase();
    if (st === 'pending' || st === 'open') {
      openKeys[String(rows[i][2]).trim().toLowerCase() + '|' + String(rows[i][3]).trim().toLowerCase()] = true;
    }
  }
  var nowStr = Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy HH:mm:ss');
  var added = 0;
  for (var j = 0; j < inv.length; j++) {
    var e = inv[j];
    if (!e.autoReorder) continue;
    if (e.reorderPoint === '' || isNaN(parseFloat(e.reorderPoint))) continue;
    var rp = parseFloat(e.reorderPoint);
    if (e.onLineQty >= rp) continue;
    var target = (e.replenishTo !== '' && !isNaN(parseFloat(e.replenishTo)) && parseFloat(e.replenishTo) > rp) ? parseFloat(e.replenishTo) : rp;
    var need = Math.max(0, target - e.onLineQty);
    if (need <= 0) continue;
    var key = String(e.line).trim().toLowerCase() + '|' + String(e.partNum).trim().toLowerCase();
    if (openKeys[key]) continue;
    var qid = 'RQ' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    sheet.appendRow([qid, nowStr, e.line, e.partNum, e.partName, need, 'pending', '', nowStr]);
    openKeys[key] = true;
    added++;
  }
  if (added) Logger.log('enqueueReplenishments: added ' + added);
  return added;
}
// Pending/open rows for the server to act on.
function readReplenishmentQueue(ss) {
  var sheet = ss.getSheetByName('Replenishment Queue');
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var st = String(rows[i][6] || '').trim().toLowerCase();
    if (st !== 'pending' && st !== 'open') continue;
    if (!String(rows[i][0] || '').trim()) continue;
    out.push({
      queueId: String(rows[i][0]).trim(),
      line: String(rows[i][2] || '').trim(),
      partNum: String(rows[i][3] || '').trim(),
      partName: String(rows[i][4] || '').trim(),
      qtyNeeded: parseFloat(rows[i][5]) || 0,
      status: st,
      requestId: String(rows[i][7] || '').trim(),
    });
  }
  return out;
}
// ── Full stow/pick catalog (BOM-sync) ─────────────────────────
// Everything stowable/pickable: every Epicor part (from BAQ_Data, incl. 0 on-hand)
// plus manual Uline boxes — regardless of stock or warehouse location.
function getOrCreateUlineSheet(ss) {
  var sheet = ss.getSheetByName('Uline Boxes');
  if (!sheet) {
    sheet = ss.insertSheet('Uline Boxes');
    sheet.appendRow(['Part #', 'Description']);
    var h = sheet.getRange(1, 1, 1, 2); h.setFontWeight('bold'); h.setBackground('#1a1e24'); h.setFontColor('#ffffff');
    sheet.setFrozenRows(1); sheet.setColumnWidth(1, 180); sheet.setColumnWidth(2, 320);
  }
  return sheet;
}
// Returns [{partNum, partName, epicorQty, source}] — Epicor parts first, then any
// Uline boxes not already present. De-duped by part number (Epicor wins).
function readCatalog(ss) {
  var out = [], seen = {};
  var baq = ss.getSheetByName('BAQ_Data');
  if (baq) {
    var rows = baq.getDataRange().getValues();
    if (rows.length >= 2) {
      var hdr = rows[0], pnC = -1, dC = -1, qC = -1;
      for (var i = 0; i < hdr.length; i++) {
        var h = String(hdr[i] || '').trim();
        if (h === 'Part_PartNum') pnC = i;
        if (h === 'Part_PartDescription') dC = i;
        if (h === 'Calculated_PartQty') qC = i;
      }
      if (pnC > -1) {
        for (var r = 1; r < rows.length; r++) {
          var pn = String(rows[r][pnC] || '').trim();
          if (!pn) continue;
          var k = pn.toLowerCase();
          if (seen[k]) continue;
          seen[k] = true;
          out.push({
            partNum: pn,
            partName: dC > -1 ? String(rows[r][dC] || '').trim() : '',
            epicorQty: qC > -1 ? (parseFloat(rows[r][qC]) || 0) : '',
            source: 'epicor',
          });
        }
      }
    }
  }
  var ul = getOrCreateUlineSheet(ss);
  var urows = ul.getDataRange().getValues();
  for (var u = 1; u < urows.length; u++) {
    var upn = String(urows[u][0] || '').trim();
    if (!upn) continue;
    var uk = upn.toLowerCase();
    if (seen[uk]) continue;
    seen[uk] = true;
    out.push({ partNum: upn, partName: String(urows[u][1] || '').trim(), epicorQty: '', source: 'uline' });
  }
  return out;
}
// ── Step 3: derive the per-line BOM from Epicor (BF_PartBOM ⋈ map) ──
// Replaces hand-maintaining the BOM tab. Safe workflow:
//   1. syncDerivedBom()   → writes BOM_Derived (scratch); never touches live BOM
//   2. diffDerivedBom()   → writes BOM_Diff (what changes vs current BOM)
//   3. review, fix the Machine Line Map for any unmapped parents
//   4. cutoverDerivedBom() → backs up BOM, then replaces it with the derived rows
var BAQ_PARTBOM = 'BF_PartBOM';

// Derive [Line, (blank Station), Part, Description] for every component whose
// parent make-part is mapped to a line. Descriptions come from BAQ_Data (the
// parent description in BF_PartBOM is the wrong one). Writes the scratch tab.
function syncDerivedBom() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var map = readMachineLineMap(ss);                 // makePartLower -> line
  var cat = readCatalog(ss);
  var descMap = {};
  for (var c = 0; c < cat.length; c++) descMap[String(cat[c].partNum).toLowerCase()] = cat[c].partName;
  var rows = fetchBaqRows_(BAQ_PARTBOM, {});
  if (rows.length) Logger.log('BF_PartBOM first-row fields: ' + JSON.stringify(Object.keys(rows[0])));
  var seen = {}, out = [], unmapped = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var parent = String(pick_(r, ['PartMtl_PartNum', 'Parent Part', 'Calculated_ParentPart', 'ParentPart']) || '').trim();
    var comp   = String(pick_(r, ['PartMtl_MtlPartNum', 'Material Part', 'Calculated_MaterialPart', 'MaterialPart']) || '').trim();
    if (!parent || !comp) continue;
    var lines = map[parent.toLowerCase()] || [];
    if (!lines.length) { unmapped[parent.toLowerCase()] = parent; continue; }
    for (var li = 0; li < lines.length; li++) {   // multi-line make-part → a row per line
      var k = lines[li].toLowerCase() + '~|~' + comp.toLowerCase();
      if (seen[k]) continue;
      seen[k] = true;
      out.push([lines[li], '', comp, descMap[comp.toLowerCase()] || '']);
    }
  }
  var sh = ss.getSheetByName('BOM_Derived') || ss.insertSheet('BOM_Derived');
  sh.clear();
  sh.getRange(1, 1, 1, 4).setValues([['Parent Part', 'Station', 'Part', 'Description']])
    .setFontWeight('bold').setBackground('#1a1e24').setFontColor('#ffffff');
  if (out.length) sh.getRange(2, 1, out.length, 4).setValues(out);
  sh.setFrozenRows(1);
  var unmappedList = Object.keys(unmapped).map(function(k) { return unmapped[k]; });
  Logger.log('syncDerivedBom: ' + out.length + ' derived rows; ' + unmappedList.length +
    ' unmapped parents' + (unmappedList.length ? ': ' + unmappedList.join(', ') : ''));
  return { derived: out.length, unmapped: unmappedList };
}
// (line, part) key set for a BOM-shaped tab (col A=line, col C=part).
function bomKeySet_(ss, name) {
  var sh = ss.getSheetByName(name), out = {};
  if (!sh) return out;
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var line = String(rows[i][0] || '').trim(), part = String(rows[i][2] || '').trim();
    if (line && part) out[line.toLowerCase() + '~|~' + part.toLowerCase()] = { line: line, part: part };
  }
  return out;
}
// Compare BOM_Derived against the live BOM → BOM_Diff (review before cutover).
function diffDerivedBom() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cur = bomKeySet_(ss, 'BOM'), der = bomKeySet_(ss, 'BOM_Derived');
  var rows = [];
  Object.keys(cur).forEach(function(k) { if (!der[k]) rows.push(['IN CURRENT, NOT DERIVED (→ tooling/Uline?)', cur[k].line, cur[k].part]); });
  Object.keys(der).forEach(function(k) { if (!cur[k]) rows.push(['NEW (DERIVED, NOT IN CURRENT)', der[k].line, der[k].part]); });
  var sh = ss.getSheetByName('BOM_Diff') || ss.insertSheet('BOM_Diff');
  sh.clear();
  sh.getRange(1, 1, 1, 3).setValues([['Change', 'Line', 'Part']])
    .setFontWeight('bold').setBackground('#1a1e24').setFontColor('#ffffff');
  if (rows.length) sh.getRange(2, 1, rows.length, 3).setValues(rows);
  sh.setFrozenRows(1);
  var removed = rows.filter(function(r) { return r[0].indexOf('IN CURRENT') === 0; }).length;
  Logger.log('diffDerivedBom: ' + removed + ' in current-not-derived, ' + (rows.length - removed) + ' new-in-derived');
  return { total: rows.length };
}
// After review: back up the live BOM, then replace it with the derived rows.
function cutoverDerivedBom() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var der = ss.getSheetByName('BOM_Derived');
  if (!der) throw new Error('Run syncDerivedBom() first.');
  var bom = ss.getSheetByName('BOM');
  var backupName = '';
  if (bom) {
    backupName = 'BOM_Backup_' + Utilities.formatDate(new Date(), 'America/Chicago', 'yyyyMMdd_HHmm');
    bom.copyTo(ss).setName(backupName);
  } else {
    bom = ss.insertSheet('BOM');
  }
  var data = der.getDataRange().getValues();
  bom.clear();
  bom.getRange(1, 1, data.length, data[0].length).setValues(data);
  bom.setFrozenRows(1);
  Logger.log('cutoverDerivedBom: BOM replaced with ' + (data.length - 1) + ' rows. Backup: ' + (backupName || '(none)'));
  return { rows: data.length - 1, backup: backupName };
}
// Optional (run once AFTER you trust it): weekly auto sync + cutover so new Epicor
// BOM parts and map edits flow in without manual steps.
function setupBomSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'runBomSyncSafe') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runBomSyncSafe').timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(2).create();
  Logger.log('Installed weekly BOM-sync trigger (Sun ~02:00).');
}
function runBomSyncSafe() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) { Logger.log('runBomSyncSafe: already running'); return; }
  try { syncDerivedBom(); cutoverDerivedBom(); } finally { lock.releaseLock(); }
}
// ── Turnover tidy: organize tabs into colored groups + hide plumbing ──
// Run once from the editor. Hiding is safe — the script still reads hidden tabs —
// and fully reversible (right-click → unhide, or re-run after editing the lists).
function tidyTabs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var GREEN = '#34a853', ORANGE = '#f9ab00';
  // Visible working tabs, left-to-right, grouped by color. EVERYTHING else is
  // hidden (data preserved — scripts read/write hidden tabs just fine).
  var groups = [
    { color: GREEN,  tabs: ['Locations', 'Line Inventory'] },                                       // daily ops
    { color: ORANGE, tabs: ['Machine Line Map', 'Uline Boxes', 'Orphan Assignments', 'Bundles'] },  // manual config
  ];
  var keepVisible = {};
  groups.forEach(function(g) { g.tabs.forEach(function(t) { keepVisible[t] = true; }); });
  var pos = 1, shown = 0;
  groups.forEach(function(g) {
    g.tabs.forEach(function(name) {
      var sh = ss.getSheetByName(name);
      if (!sh) return;
      sh.showSheet();
      sh.setTabColor(g.color);
      ss.setActiveSheet(sh);
      ss.moveActiveSheet(pos++);
      shown++;
    });
  });
  var hidden = 0;
  ss.getSheets().forEach(function(sh) {
    var n = sh.getName();
    if (!keepVisible[n]) {
      sh.setTabColor(null);
      sh.hideSheet();
      hidden++;
    }
  });
  var loc = ss.getSheetByName('Locations');
  if (loc) ss.setActiveSheet(loc);
  Logger.log('tidyTabs: ' + shown + ' working tabs ordered/colored; ' + hidden + ' plumbing/legacy/backup tabs hidden.');
}
// Delete stale BOM_Backup_* tabs, keeping the newest `keep` (default 2).
// Run manually or wire to a weekly trigger. Everything else is left alone.
function pruneBomBackups(keep) {
  keep = (typeof keep === 'number' && keep >= 0) ? keep : 2;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var backups = ss.getSheets()
    .filter(function(sh) { return /^BOM_Backup_/.test(sh.getName()); })
    .sort(function(a, b) { return b.getName().localeCompare(a.getName()); }); // newest first (name embeds timestamp)
  var deleted = 0;
  for (var i = keep; i < backups.length; i++) {
    ss.deleteSheet(backups[i]);
    deleted++;
  }
  Logger.log('pruneBomBackups: deleted ' + deleted + ' old backups, kept ' + Math.min(keep, backups.length) + '.');
  return deleted;
}
// ── doGet ─────────────────────────────────────────────────────
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // Lightweight short-circuit: when called with ?epicorOnly=1, return only
    // Epicor on-hand data. Used by the server's 1-minute Epicor refresh poll
    // to avoid the cost of re-reading Locations + BOM + Bundles every minute.
    if (e && e.parameter && e.parameter.epicorOnly === '1') {
      const ep = readEpicorOnHand(ss);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, epicorOnHand: ep.onHand, epicorLastRefresh: ep.lastRefresh }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // Cycle-count portal data (additive). ?cycle=1 → today's list + settings.
    // ?cycle=1&part=XXX → the full part profile for a count screen (warehouse
    // locations + all associated lines, incl. lines with no tracked stock).
    if (e && e.parameter && e.parameter.cycle === '1') {
      // Legacy full-profile branch (old cyclecount portal). Must NOT swallow
      // requests that carry a view= (e.g. view=partraw&part=X from the PMS
      // Postgres engine) — the profile path is heavyweight (full error-rate
      // scan) and returns a nested shape the engine can't read.
      if (e.parameter.part && !e.parameter.view) {
        return ContentService
          .createTextOutput(JSON.stringify({ success: true, profile: cyclePartProfile_(ss, String(e.parameter.part)) }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      if (e.parameter.detail) {
        return ContentService
          .createTextOutput(JSON.stringify({ success: true, cycleDetail: readCycleDetail(ss, String(e.parameter.detail)) }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var cycView = String(e.parameter.view || '').toLowerCase();
      // ── Views for the Postgres cycle engine on PMS (additive) ──
      // partraw: LIVE per-part inventory snapshot for the count screen — the
      // engine adds BOM/orphan line associations + Epicor data itself.
      if (cycView === 'partraw') {
        var prPn = String(e.parameter.rawpart || e.parameter.part || '').trim(), prLc = prPn.toLowerCase();
        var prLoc = ss.getSheetByName('Locations'), prWh = [], prName = '';
        if (prLoc) {
          var prRows = prLoc.getDataRange().getValues();
          for (var pr = 1; pr < prRows.length; pr++) {
            if (String(prRows[pr][18] || '').trim().toLowerCase() === prLc) {
              prWh.push({ location: String(prRows[pr][16] || '').trim(), qty: parseInt(prRows[pr][17]) || 0 });
              if (!prName) prName = String(prRows[pr][19] || '').trim();
            }
          }
        }
        var prInv = readLineInventory(ss), prLines = [];
        for (var pj = 0; pj < prInv.length; pj++) {
          if (String(prInv[pj].partNum).trim().toLowerCase() === prLc) {
            prLines.push({ line: prInv[pj].line, onLineQty: prInv[pj].onLineQty, reorderPoint: prInv[pj].reorderPoint });
            if (!prName) prName = prInv[pj].partName;
          }
        }
        return cycleJson_({ success: true, partNum: prPn, partName: prName, warehouse: prWh, lines: prLines });
      }
      // stows: stow-receipt transactions after ?since= (yyyy-MM-dd HH:mm:ss,
      // script timezone) — feeds the engine's EOD finalizer.
      if (cycView === 'stows') {
        var stSince = new Date(String(e.parameter.since || '').trim());
        var stSheet = ss.getSheetByName('Transaction Log'), stOut = [];
        if (stSheet && !isNaN(stSince.getTime())) {
          var stRows = stSheet.getDataRange().getValues();
          for (var si = 1; si < stRows.length; si++) {
            if (String(stRows[si][6] || '').trim().toLowerCase().indexOf('stow') === -1) continue;
            var sDate = fmtDateCell_(stRows[si][0]);
            var sT = stRows[si][1];
            var sTime = (sT instanceof Date) ? Utilities.formatDate(sT, 'America/Chicago', 'HH:mm:ss') : String(sT || '').trim();
            var sDt = new Date(sDate + ' ' + sTime);
            if (isNaN(sDt.getTime()) || sDt.getTime() <= stSince.getTime()) continue;
            stOut.push({ partNum: String(stRows[si][2] || '').trim(), dateTime: sDate + ' ' + sTime, qty: parseFloat(stRows[si][3]) || 0 });
          }
        }
        return cycleJson_({ success: true, stows: stOut });
      }
      // dump: one-time cutover export of every cycle tab → Postgres import.
      if (cycView === 'dump') {
        var duSetRows = getOrCreateCycleSettingsSheet(ss).getDataRange().getValues();
        var duSettings = [];
        for (var du1 = 1; du1 < duSetRows.length; du1++) {
          if (!String(duSetRows[du1][0] || '').trim()) continue;
          duSettings.push({ key: String(duSetRows[du1][0]).trim(), value: String(duSetRows[du1][1] == null ? '' : duSetRows[du1][1]), notes: String(duSetRows[du1][2] || '') });
        }
        var duDetRows = getOrCreateCycleDetailSheet(ss).getDataRange().getValues();
        var duDetail = [];
        for (var du2 = 1; du2 < duDetRows.length; du2++) {
          if (!String(duDetRows[du2][0] || '').trim()) continue;
          duDetail.push({ sessionId: String(duDetRows[du2][0]).trim(), partNum: String(duDetRows[du2][1]).trim(),
            placeType: String(duDetRows[du2][2]).trim(), place: String(duDetRows[du2][3]).trim(),
            systemQty: duDetRows[du2][4], firstCount: duDetRows[du2][5], secondCount: duDetRows[du2][6],
            newQtyWritten: duDetRows[du2][7], action: String(duDetRows[du2][8] || '').trim() });
        }
        var duSkipRows = getOrCreateCycleSkipsSheet(ss).getDataRange().getValues();
        var duSkips = [];
        for (var du3 = 1; du3 < duSkipRows.length; du3++) {
          if (!String(duSkipRows[du3][1] || '').trim()) continue;
          duSkips.push({ date: fmtDateCell_(duSkipRows[du3][0]), partNum: String(duSkipRows[du3][1]).trim(),
            skippedBy: String(duSkipRows[du3][2] || '').trim(), sweepStarted: confirmedToIso_(duSkipRows[du3][3]) || String(duSkipRows[du3][3] || '').trim() });
        }
        var duExclRows = getOrCreateCycleExclusionsSheet(ss).getDataRange().getValues();
        var duExcl = [];
        for (var du4 = 1; du4 < duExclRows.length; du4++) {
          if (String(duExclRows[du4][0] || '').trim()) duExcl.push({ partNum: String(duExclRows[du4][0]).trim(), reason: String(duExclRows[du4][1] || '').trim() });
        }
        return cycleJson_({ success: true,
          settings: duSettings, today: readCycleToday(ss), log: readCycleLog(ss, 0),
          detail: duDetail, eod: readCycleEod(ss, ''), skips: duSkips,
          exclusions: duExcl, errorRate: readErrorRateHistory(ss, 0) });
      }
      if (cycView === 'stats') {
        var er = cycleDiscrepancyReport_(ss, 30);
        return ContentService
          .createTextOutput(JSON.stringify({ success: true, cycleLog: readCycleLog(ss, 500), cycleSettings: readCycleSettings(ss),
            leaderboard: cycleLeaderboard_(ss),
            errorRate: { current: Math.round(er.rate * 10000) / 100, sumAbsDrift: er.sumAbsDrift, sumEpicor: er.sumEpicor, parts: er.parts,
              untrackedSharePct: er.untrackedSharePct, costMode: er.costMode, drivers: er.drivers, history: readErrorRateHistory(ss, 180) } }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      if (cycView === 'eod') {
        return ContentService
          .createTextOutput(JSON.stringify({ success: true, cycleEod: readCycleEod(ss, String(e.parameter.date || '')) }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, cycleToday: readCycleToday(ss), cycleSettings: readCycleSettings(ss) }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // Read Locations
    const locSheet = ss.getSheetByName('Locations');
    if (!locSheet) throw new Error('Locations sheet not found');
    const locRows = locSheet.getDataRange().getValues();
    const locMap = {};
    const locations = [];
    for (let i = 1; i < locRows.length; i++) {
      const location = String(locRows[i][16] || '').trim();
      const quantity = String(locRows[i][17] || '').trim();
      const partNum = String(locRows[i][18] || '').trim();
      const partName = String(locRows[i][19] || '').trim();
      if (!partNum) continue;
      const entry = { location, partNum, partName, quantity };
      locations.push(entry);
      const key = partNum.toLowerCase();
      if (!locMap[key]) locMap[key] = [];
      locMap[key].push(entry);
    }
    // Read BOM
    const bomSheet = ss.getSheetByName('BOM');
    if (!bomSheet) throw new Error('BOM sheet not found');
    const bomRows = bomSheet.getDataRange().getValues();
    const inventory = {};
    const bomPartKeys = new Set();
    for (let i = 1; i < bomRows.length; i++) {
      const [parentPart, station, partNum, description] = bomRows[i];
      if (!partNum || String(partNum).trim() === 'Hardware') continue;
      const pn = String(partNum).trim();
      const line = String(parentPart).trim().toUpperCase();
      const st = String(station || '').trim();
      const desc = String(description || '').trim();
      bomPartKeys.add(pn.toLowerCase());
      const locEntries = locMap[pn.toLowerCase()];
      const totalQty = locEntries ? locEntries.reduce((sum, l) => sum + (parseInt(l.quantity) || 0), 0) : 0;
      const item = {
        partNum: String(pn),
        partName: String(locEntries ? (locEntries[0].partName || desc) : desc),
        line: String(line),
        station: String(st),
        totalQty: String(totalQty),
        allLocations: locEntries ? locEntries.map(l => ({ location: String(l.location), quantity: String(l.quantity) })) : [],
      };
      const groupKey = line === 'APOLLO' ? (st || 'APOLLO') : line;
      if (!inventory[groupKey]) inventory[groupKey] = [];
      const already = inventory[groupKey].some(i => i.partNum.toLowerCase() === pn.toLowerCase());
      if (!already) inventory[groupKey].push(item);
    }
    Object.keys(inventory).forEach(key => {
      inventory[key].sort((a, b) =>
        a.partNum.localeCompare(b.partNum, undefined, { numeric: true, sensitivity: 'base' })
      );
    });
    // Full BOM list
    const allParts = {};
    for (let i = 1; i < bomRows.length; i++) {
      const [, , partNum, description] = bomRows[i];
      if (!partNum || String(partNum).trim() === 'Hardware') continue;
      const pn = String(partNum).trim();
      const key = pn.toLowerCase();
      if (!allParts[key]) allParts[key] = { partNum: String(pn), partName: String(description || '').trim() };
    }
    const bomList = Object.values(allParts).sort((a, b) =>
      a.partNum.localeCompare(b.partNum, undefined, { numeric: true, sensitivity: 'base' })
    );
    // Read Orphan Assignments — build map of partNum.lower → [{ line, station }]
    const orphanSheet = getOrCreateOrphanSheet(ss);
    const orphanRows = orphanSheet.getDataRange().getValues();
    const orphanAssignments = {};
    const orphanLineMap = {};
    const orphanMeta = {};   // partNum.lower → { partNum, partName } (original case, from the sheet)
    for (let i = 1; i < orphanRows.length; i++) {
      const pn = String(orphanRows[i][0] || '').trim();
      const pname = String(orphanRows[i][1] || '').trim();
      const line = String(orphanRows[i][2] || '').trim();
      const station = String(orphanRows[i][3] || '').trim();
      if (!pn || !line) continue;
      const key = pn.toLowerCase();
      if (!orphanAssignments[key]) orphanAssignments[key] = { line, station };
      if (!orphanLineMap[key]) orphanLineMap[key] = [];
      if (!orphanLineMap[key].includes(line)) orphanLineMap[key].push(line);
      if (!orphanMeta[key]) orphanMeta[key] = { partNum: pn, partName: pname };
      else if (!orphanMeta[key].partName && pname) orphanMeta[key].partName = pname;
    }
    // Compute orphan parts
    const orphanParts = [];
    const seenOrphans = new Set();
    for (const entry of locations) {
      const key = entry.partNum.toLowerCase();
      if (bomPartKeys.has(key)) continue;
      if (seenOrphans.has(key)) continue;
      seenOrphans.add(key);
      const locEntries = locMap[key] || [];
      const totalQty = locEntries.reduce((sum, l) => sum + (parseInt(l.quantity) || 0), 0);
      const assignedLines = orphanLineMap[key] || [];
      orphanParts.push({
        partNum: entry.partNum,
        partName: entry.partName,
        totalQty: String(totalQty),
        allLocations: locEntries.map(l => ({ location: String(l.location), quantity: String(l.quantity) })),
        assignedLines: assignedLines,
        assignedLine: assignedLines[0] || '',
        assignedStation: orphanAssignments[key] ? orphanAssignments[key].station : '',
      });
    }
    orphanParts.sort((a, b) =>
      a.partNum.localeCompare(b.partNum, undefined, { numeric: true, sensitivity: 'base' })
    );
    // Inject EVERY assigned part into its assigned lines' inventory groups —
    // including parts already on another line's BOM and parts with no warehouse
    // location yet. An assignment is line MEMBERSHIP, independent of BOM/stock,
    // so a part on XR's BOM assigned to Apollo shows under Apollo too.
    for (const key of Object.keys(orphanLineMap)) {
      const locEntries = locMap[key] || [];
      const totalQty = locEntries.reduce((sum, l) => sum + (parseInt(l.quantity) || 0), 0);
      const meta = orphanMeta[key] || {};
      const dispPartNum = locEntries.length ? locEntries[0].partNum : (meta.partNum || key);
      const dispPartName = (locEntries.length && locEntries[0].partName) ? locEntries[0].partName : (meta.partName || '');
      for (const aLine of orphanLineMap[key]) {
        const groupKey = aLine.toUpperCase() === 'APOLLO'
          ? (orphanAssignments[key]?.station || 'APOLLO')
          : aLine.toUpperCase();
        if (!inventory[groupKey]) inventory[groupKey] = [];
        const alreadyIn = inventory[groupKey].some(i => i.partNum.toLowerCase() === key);
        if (alreadyIn) continue;
        inventory[groupKey].push({
          partNum: String(dispPartNum),
          partName: String(dispPartName),
          line: aLine,
          station: '',
          totalQty: String(totalQty),
          allLocations: locEntries.map(l => ({ location: String(l.location), quantity: String(l.quantity) })),
        });
      }
    }
    // Read bundle definitions (for Apollo dropdowns and picker bundle-pick logic)
    const bundleResult = readBundles(ss);
    const bundles = bundleResult.bundles;
    // Read Epicor factory-wide on-hand quantities. Backed by the BAQ_Data sheet
    // which is auto-refreshed every hour by refreshEpicorData(). Map keys are
    // lowercased part numbers; values are the Calculated_PartQty from Epicor.
    const epicorResult = readEpicorOnHand(ss);
    const epicorOnHand = epicorResult.onHand;
    const epicorLastRefresh = epicorResult.lastRefresh;
    // Phase 2: per-line on-hand (empty array until the first pick creates the tab).
    const lineInventory = readLineInventory(ss);
    const replenishmentQueue = readReplenishmentQueue(ss);
    const catalog = readCatalog(ss);
    // Machine→Line map rows (FG list for the scheduling service's SKU dropdown).
    const machineMap = readMachineMapRows(ss);
    // PMS v2 (P4): request journal blob for restart recovery (empty string if absent)
    let requestJournal = '';
    try {
      const rjSheet = ss.getSheetByName('Request Journal');
      if (rjSheet) requestJournal = String(rjSheet.getRange(2, 2).getValue() || '');
    } catch (rjErr) { /* non-fatal */ }
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, locations, inventory, bomList, orphanParts, orphanAssignments, orphanAssignedLines: orphanLineMap, bundles, epicorOnHand, epicorLastRefresh, lineInventory, replenishmentQueue, catalog, machineMap, requestJournal }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
// ── doPost ────────────────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // ── Stow ─────────────────────────────────────────────────
    // Optional `bundleName` re-labels txType as "Stow (Bundle Name)".
    if (data.action === 'stow') {
      const sheet = ss.getSheetByName('Locations');
      if (!sheet) throw new Error('Locations sheet not found');
      const rows = sheet.getDataRange().getValues();
      const location = String(data.location || '').trim();
      const partNum = String(data.partNum || '').trim();
      const partName = String(data.partName || '').trim();
      const qty = parseInt(data.qty) || 1;
      const bundleName = String(data.bundleName || '').trim();
      // txTypeOverride lets transfers log as 'Transfer In' instead of 'Stow'
      const txOverride = String(data.txTypeOverride || '').trim();
      const stowType = txOverride || (bundleName ? ('Stow (' + bundleName + ')') : 'Stow');
      const newLocType = txOverride ? (txOverride + ' (New Location)') : (bundleName ? ('Stow (' + bundleName + ', New Location)') : 'Stow (New Location)');
      for (let i = 1; i < rows.length; i++) {
        const rowLoc = String(rows[i][16] || '').trim();
        const rowPn = String(rows[i][18] || '').trim();
        if (rowLoc.toLowerCase() === location.toLowerCase() &&
            rowPn.toLowerCase() === partNum.toLowerCase()) {
          const currentQty = parseInt(rows[i][17]) || 0;
          const newQty = currentQty + qty;
          sheet.getRange(i + 1, 18).setValue(newQty);
          const totalOnHand = computeTotalOnHand(sheet, partNum);
          appendTransaction(ss, { partNum, qtyTransacted: qty, newQty, totalOnHand, txType: stowType, location, line: String(data.line || ''), user: String(data.user || '') });
          return ContentService
            .createTextOutput(JSON.stringify({ success: true, message: 'Added ' + qty + ' to ' + location + ' — new qty: ' + newQty }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      const lastRow = sheet.getLastRow() + 1;
      sheet.getRange(lastRow, 17).setValue(location);
      sheet.getRange(lastRow, 18).setValue(qty);
      sheet.getRange(lastRow, 19).setValue(partNum);
      sheet.getRange(lastRow, 20).setValue(partName);
      const totalOnHandNew = computeTotalOnHand(sheet, partNum);
      appendTransaction(ss, { partNum, qtyTransacted: qty, newQty: qty, totalOnHand: totalOnHandNew, txType: newLocType, location, line: String(data.line || ''), user: String(data.user || '') });
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'New row added: ' + partNum + ' at ' + location }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── Subtract ──────────────────────────────────────────────
    // Optional `bundleName` in payload re-labels txType as "Pick (Bundle Name)"
    // so bundle picks are auditable in the Transaction Log.
    if (data.action === 'subtract') {
      const sheet = ss.getSheetByName('Locations');
      if (!sheet) throw new Error('Locations sheet not found');
      const rows = sheet.getDataRange().getValues();
      const partNum = String(data.partNum || '').trim().toLowerCase();
      const location = String(data.location || '').trim().toLowerCase();
      const qty = parseInt(data.qty) || 1;
      const bundleName = String(data.bundleName || '').trim();
      // txTypeOverride lets transfers log as 'Transfer Out' instead of 'Pick'
      const txType = String(data.txTypeOverride || '').trim() || (bundleName ? ('Pick (' + bundleName + ')') : 'Pick');
      for (let i = 1; i < rows.length; i++) {
        const rowLoc = String(rows[i][16] || '').trim().toLowerCase();
        const rowPn = String(rows[i][18] || '').trim().toLowerCase();
        if (rowLoc !== location || rowPn !== partNum) continue;
        const currentQty = parseInt(rows[i][17]) || 0;
        const newQty = Math.max(0, currentQty - qty);
        if (newQty === 0) {
          // Declutter: an emptied location is removed outright (A–P are unused,
          // so deleting the whole row is safe). Keeps the Locations tab from
          // accumulating 0-qty rows. rows[i][...] stays valid in memory below.
          sheet.deleteRow(i + 1);
        } else {
          sheet.getRange(i + 1, 18).setValue(newQty);
        }
        const totalOnHand = computeTotalOnHand(sheet, rows[i][18]);
        appendTransaction(ss, {
          partNum: rows[i][18],
          qtyTransacted: qty,
          newQty: newQty,
          totalOnHand: totalOnHand,
          txType: txType,
          location: rows[i][16],
          line: String(data.line || ''),
          priority: String(data.priority || ''),
          submittedAt: String(data.submittedAt || ''),
          totalTime: String(data.totalTime || ''),
          user: String(data.user || ''),
        });
        // Phase 2: a Pick destined for a line also moves that qty onto the line.
        // Wrapped so a Line-Inventory hiccup can never break the core pick.
        var lineForInv = String(data.line || '').trim();
        if (lineForInv) {
          try { bumpLineInventory(ss, lineForInv, rows[i][18], rows[i][19], qty); }
          catch (e) { Logger.log('bumpLineInventory failed: ' + e.message); }
        }
        return ContentService
          .createTextOutput(JSON.stringify({ success: true, newQty, location: rows[i][16] }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'No match: ' + location + ' / ' + partNum }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── Request journal (PMS v2, P4) ──────────────────────────
    // The PMS server posts its open-request set as a JSON blob every ~20s.
    // Stored in a single cell; doGet returns it so a restarted server can
    // restore the live queue. Purely additive — nothing else reads this tab.
    if (data.action === 'journalRequests') {
      var rjSheet = ss.getSheetByName('Request Journal');
      if (!rjSheet) {
        rjSheet = ss.insertSheet('Request Journal');
        rjSheet.getRange(1, 1).setValue('Updated (CST)');
        rjSheet.getRange(2, 1).setValue('JSON');
      }
      rjSheet.getRange(1, 2).setValue(Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy HH:mm:ss'));
      rjSheet.getRange(2, 2).setValue(String(data.json || ''));
      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── Line inventory bump (line↔warehouse/line↔line transfers) ──
    // Signed qty: positive adds to a line, negative removes. Negative bumps
    // require sufficient on-line qty (no silent floor — a transfer must move
    // real tracked stock). Logs a Transaction Log row; manual reorder columns
    // are never touched (bumpLineInventory guarantees that).
    if (data.action === 'bumpLine') {
      var blLine = String(data.line || '').trim();
      var blPn = String(data.partNum || '').trim();
      var blQty = parseInt(data.qty);
      if (!blLine || !blPn || !blQty || isNaN(blQty)) {
        return ContentService
          .createTextOutput(JSON.stringify({ success: false, error: 'line, partNum and non-zero qty are required' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var blFloored = false, blShortfall = 0;
      if (blQty < 0) {
        var blInv = readLineInventory(ss);
        var blCur = 0;
        for (var bli = 0; bli < blInv.length; bli++) {
          if (String(blInv[bli].line).toLowerCase() === blLine.toLowerCase() &&
              String(blInv[bli].partNum).toLowerCase() === blPn.toLowerCase()) {
            blCur = parseFloat(blInv[bli].onLineQty) || 0;
            break;
          }
        }
        if (blCur < -blQty) {
          // allowFloor (2026-07-21, ship-out ledger): material that physically
          // shipped must come off the ledger even when tracking is short —
          // subtract what's there, report the shortfall so the caller can log
          // an exception. Without allowFloor, keep the strict transfer rule.
          if (data.allowFloor) {
            blFloored = true;
            blShortfall = -blQty - blCur;
            blQty = -blCur; // may be 0 → nothing to subtract, exception only
          } else {
            return ContentService
              .createTextOutput(JSON.stringify({ success: false, error: 'Only ' + blCur + ' of ' + blPn + ' tracked on ' + blLine }))
              .setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
      if (blFloored && blQty === 0) {
        return ContentService
          .createTextOutput(JSON.stringify({ success: true, newQty: 0, line: blLine, floored: true, subtracted: 0, shortfall: blShortfall }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var blNew = bumpLineInventory(ss, blLine, blPn, String(data.partName || ''), blQty);
      var blLocSheet = ss.getSheetByName('Locations');
      appendTransaction(ss, {
        partNum: blPn,
        qtyTransacted: Math.abs(blQty),
        newQty: (blNew === null || blNew === undefined) ? '' : blNew,
        totalOnHand: blLocSheet ? computeTotalOnHand(blLocSheet, blPn) : '',
        txType: String(data.txTypeOverride || '').trim() || (blQty > 0 ? 'Transfer In (Line)' : 'Transfer Out (Line)'),
        location: '',
        line: blLine,
        user: String(data.user || ''),
      });
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, newQty: blNew, line: blLine, floored: blFloored, subtracted: Math.abs(blQty), shortfall: blShortfall }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── Log request completion (cancellations only) ──────────
    // Picks are logged by the subtract handler as 'Pick' rows with priority/
    // submittedAt/totalTime already attached. The only completion outcome that
    // doesn't trigger a subtract is cancel/dismiss, so that's the only case that
    // needs a row written here.
    if (data.action === 'logRequest') {
      var outcome = String(data.outcome || '');
      if (outcome === 'fulfilled') {
        return ContentService
          .createTextOutput(JSON.stringify({ success: true, message: 'Fulfillment already logged via Pick' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var locSheet = ss.getSheetByName('Locations');
      var totalOnHand = locSheet ? computeTotalOnHand(locSheet, data.partNum) : '';
      // PMS v2 (P5): cancel reasons arrive as 'dismissed: <reason>' — surface
      // them in the txType so the Transaction Log captures the why.
      var ccReason = '';
      var ccM = String(outcome).match(/^dismissed:\s*(.+)$/);
      if (ccM) ccReason = ccM[1];
      appendTransaction(ss, {
        partNum: String(data.partNum || ''),
        qtyTransacted: 0,
        newQty: '',
        totalOnHand: totalOnHand,
        txType: ccReason ? ('Cancelled (' + ccReason + ')') : 'Cancelled',
        location: '',
        user: String(data.user || ''),
        line: String(data.line || ''),
        priority: String(data.priority || ''),
        submittedAt: String(data.submittedAt || ''),
        totalTime: String(data.totalTime || ''),
      });
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'Cancellation logged' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── Titan cycle log ──────────────────────────────────────
    // One row per completed Titan unit. Auto-creates the sheet if needed.
    if (data.action === 'logTitanCycle') {
      var tSheet = ss.getSheetByName('Titan Cycle Log');
      if (!tSheet) {
        tSheet = ss.insertSheet('Titan Cycle Log');
        tSheet.appendRow(['Date', 'Cycle #', 'Cycle Start (CST)', 'Cycle End (CST)', 'Active Time', 'Pause Time', 'Takt Target', 'Variance', 'Compliance']);
        var thead = tSheet.getRange(1, 1, 1, 9);
        thead.setFontWeight('bold');
        thead.setBackground('#1a1e24');
        thead.setFontColor('#ffffff');
        tSheet.setFrozenRows(1);
        tSheet.setColumnWidth(1, 100);
        tSheet.setColumnWidth(2, 80);
        tSheet.setColumnWidth(3, 180);
        tSheet.setColumnWidth(4, 180);
        tSheet.setColumnWidth(5, 100);
        tSheet.setColumnWidth(6, 100);
        tSheet.setColumnWidth(7, 100);
        tSheet.setColumnWidth(8, 100);
        tSheet.setColumnWidth(9, 100);
      }
      var cstDate = Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy');
      tSheet.appendRow([
        cstDate,
        data.cycleNumber || 0,
        String(data.cycleStart || ''),
        String(data.cycleEnd || ''),
        String(data.activeTime || ''),
        String(data.pauseTime || ''),
        String(data.taktTarget || ''),
        String(data.variance || ''),
        String(data.compliance || ''),
      ]);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'Titan cycle logged' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── Apollo station cycle log (PR 5a) ─────────────────────
    // One row per completed Apollo station cycle (Done click).
    if (data.action === 'logStationCycle') {
      var sSheet = getOrCreateStationCycleSheet(ss);
      var sDate = Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy');
      sSheet.appendRow([
        sDate,
        String(data.stationName || ''),
        data.cycleNumber || 0,
        String(data.cycleStart || ''),
        String(data.cycleEnd || ''),
        String(data.activeTime || ''),
        String(data.holdTime || ''),
        String(data.breakTime || ''),
        String(data.andonTime || ''),
      ]);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'Station cycle logged' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── Line cycle log (PR 5a — scaffolded, unused) ──────────
    // Wired to Skirting station completion in PR 5c.
    if (data.action === 'logLineCycle') {
      var lSheet = getOrCreateLineCycleSheet(ss);
      var lDate = Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy');
      lSheet.appendRow([
        lDate,
        String(data.lineName || ''),
        data.cycleNumber || 0,
        String(data.cycleStart || ''),
        String(data.cycleEnd || ''),
        String(data.activeTime || ''),
        String(data.taktTarget || ''),
        String(data.variance || ''),
        String(data.compliance || ''),
      ]);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'Line cycle logged' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── Assign orphan to line ─────────────────────────────────
    if (data.action === 'assignOrphan') {
      const partNum = String(data.partNum || '').trim();
      const partName = String(data.partName || '').trim();
      const line = String(data.line || '').trim();
      const station = String(data.station || '').trim();
      if (!partNum || !line) {
        return ContentService
          .createTextOutput(JSON.stringify({ success: false, error: 'partNum and line are required' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const sheet = getOrCreateOrphanSheet(ss);
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const existing = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
        for (let i = 0; i < existing.length; i++) {
          const rowPn = String(existing[i][0] || '').trim().toLowerCase();
          const rowLine = String(existing[i][2] || '').trim().toLowerCase();
          if (rowPn === partNum.toLowerCase() && rowLine === line.toLowerCase()) {
            return ContentService
              .createTextOutput(JSON.stringify({ success: true, message: partNum + ' already assigned to ' + line }))
              .setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
      const cstDate = Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy');
      sheet.appendRow([partNum, partName, line, station, cstDate]);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'Assigned ' + partNum + ' to ' + line }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── Update a replenishment-queue row (Phase 4) ────────────
    if (data.action === 'updateReplenishment') {
      var qid = String(data.queueId || '').trim();
      if (!qid) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'queueId required' })).setMimeType(ContentService.MimeType.JSON);
      }
      var qSheet = getOrCreateReplenishmentQueueSheet(ss);
      var qRows = qSheet.getDataRange().getValues();
      for (var qi = 1; qi < qRows.length; qi++) {
        if (String(qRows[qi][0]).trim() === qid) {
          if (data.status) qSheet.getRange(qi + 1, 7).setValue(String(data.status));
          if (data.requestId !== undefined) qSheet.getRange(qi + 1, 8).setValue(String(data.requestId || ''));
          qSheet.getRange(qi + 1, 9).setValue(Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy HH:mm:ss'));
          return ContentService.createTextOutput(JSON.stringify({ success: true, queueId: qid, status: data.status || '' })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Queue ID not found: ' + qid })).setMimeType(ContentService.MimeType.JSON);
    }
    // ── Cycle Count actions (additive — see cyclecount/DESIGN.md) ──
    if (data.action === 'cycleGenerateToday') {
      return cycleJson_({ success: true, result: generateTodayList(ss, String(data.date || ''), !!data.force) });
    }
    if (data.action === 'cycleFirstCount')  return cycleJson_(cycleSubmitFirstCount_(ss, data));
    if (data.action === 'cycleConfirm')     return cycleJson_(cycleConfirmCount_(ss, data));
    if (data.action === 'cycleSkip')        return cycleJson_(cycleSkipCount_(ss, data));
    if (data.action === 'cycleAddMore')     return cycleJson_(cycleAddToToday_(ss, data.count));
    if (data.action === 'cycleAddPart')     return cycleJson_(cycleAddPart_(ss, data.partNum));
    if (data.action === 'cycleFinalizeEod') return cycleJson_(finalizeCycleEod(ss, String(data.date || '')));
    if (data.action === 'cycleSetEodEntered') return cycleJson_(cycleSetEodEntered_(ss, data));
    // ── Cycle count write-back (Postgres engine on PMS) ────────
    // The cycle-count session logic now runs in the PMS server against Railway
    // Postgres; this action is how a PIN-confirmed count still corrects the
    // LIVE inventory here: absolute location/line sets + Transaction Log rows,
    // via the same helpers the old cycleConfirmCount_ used. sysQty is the
    // system qty recorded at first-count time, so deltas match old semantics.
    if (data.action === 'cycleApplyWrites') return cycleJson_(cycleApplyWrites_(ss, data));
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ═══════════════════════════════════════════════════════════════
// CYCLE COUNT  (all additive — new tabs + actions; nothing above changes)
//
// Pool = the BF_OnHandInventory on-hand list (BAQ_Data). Priority = signed
// overage (warehouse + line) − Epicor, descending, so parts where our sheet
// shows MORE than Epicor sort to the top. Full sweep: every part counted once
// before repeats. See cyclecount/DESIGN.md for the full spec.
//
// Setup on the host (run once from the editor): setupCycleTriggers()
//   → generateTodayListSafe ~06:00 (freeze the day's list)
//   → finalizeCycleEodSafe  ~06:30 (publish prior-day EOD before 0800)
// Set confirm_pins in the "Cycle Count Settings" tab before go-live.
// ═══════════════════════════════════════════════════════════════

function cycleJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function round2_(x) { return Math.round((parseFloat(x) || 0) * 100) / 100; }
function isoFromDisplay_(disp) { // 'MM/dd/yyyy' → 'yyyy-MM-dd'
  var p = String(disp || '').split('/');
  if (p.length !== 3) return Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  var pad = function(s){ s = String(s); return s.length < 2 ? '0' + s : s; };
  return p[2] + '-' + pad(p[0]) + '-' + pad(p[1]);
}
function confirmedToIso_(v) { // Date OR 'MM/dd/yyyy HH:mm:ss' string → 'yyyy-MM-dd'
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, 'America/Chicago', 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim(); if (!s) return '';
  var d = new Date(s); if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, 'America/Chicago', 'yyyy-MM-dd');
}

// ── Settings ─────────────────────────────────────────────────
function getOrCreateCycleSettingsSheet(ss) {
  var sheet = ss.getSheetByName('Cycle Count Settings');
  if (!sheet) {
    sheet = ss.insertSheet('Cycle Count Settings');
    sheet.appendRow(['Key', 'Value', 'Notes']);
    var h = sheet.getRange(1, 1, 1, 3); h.setFontWeight('bold'); h.setBackground('#1a1e24'); h.setFontColor('#ffffff'); sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 200); sheet.setColumnWidth(2, 120); sheet.setColumnWidth(3, 460);
    sheet.appendRow(['daily_count_n', '10', 'How many parts to surface each day']);
    sheet.appendRow(['accuracy_tolerance_pct', '10', 'A count is "accurate" if within this % of system (tighten over time)']);
    sheet.appendRow(['require_pin_on_confirm', 'yes', 'Require a PIN before any record is overwritten']);
    sheet.appendRow(['confirm_pins', '', 'Comma-separated PIN(s) allowed to confirm — SET THIS before go-live']);
    sheet.appendRow(['sweep_started', '', 'Auto-managed: date (yyyy-MM-dd) the current full sweep began']);
    sheet.appendRow(['cost_column', '', 'Optional: exact BAQ_Data header for unit cost. Blank = auto-detect (prefers Calculated_TotalCost).']);
    sheet.appendRow(['exclude_part_types', 'M', 'Part type/class values to drop from ALL metrics (comma-sep). Default M = manufactured / finished goods (not tracked in our system).']);
    sheet.appendRow(['part_type_column', '', 'Optional: BAQ_Data header that holds the part type/class. Blank = auto-detect (Part_TypeCode / ProdCode / ClassID).']);
  }
  return sheet;
}
function readCycleSettings(ss) {
  var sheet = getOrCreateCycleSettingsSheet(ss);
  var rows = sheet.getDataRange().getValues();
  var kv = {};
  for (var i = 1; i < rows.length; i++) { var k = String(rows[i][0] || '').trim(); if (k) kv[k] = rows[i][1]; }
  var pins = String(kv.confirm_pins || '').split(',').map(function(s){ return String(s).trim(); }).filter(function(s){ return s; });
  return {
    dailyCountN: parseInt(kv.daily_count_n) || 10,
    tolerancePct: (kv.accuracy_tolerance_pct === '' || kv.accuracy_tolerance_pct === undefined) ? 10 : (parseFloat(kv.accuracy_tolerance_pct) || 0),
    requirePin: String(kv.require_pin_on_confirm || 'yes').trim().toLowerCase() !== 'no',
    confirmPins: pins,
    sweepStarted: String(kv.sweep_started || '').trim(),
    costColumn: String(kv.cost_column || '').trim(),
    excludePartTypes: String((kv.exclude_part_types === undefined || kv.exclude_part_types === null) ? 'M' : kv.exclude_part_types).split(',').map(function(s) { return String(s).trim(); }).filter(function(s) { return s; }),
    partTypeColumn: String(kv.part_type_column || '').trim()
  };
}
function setCycleSetting_(ss, key, val) {
  var sheet = getOrCreateCycleSettingsSheet(ss);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) { if (String(rows[i][0] || '').trim() === key) { sheet.getRange(i + 1, 2).setValue(val); return; } }
  sheet.appendRow([key, val, '']);
}

// ── Tabs ─────────────────────────────────────────────────────
function getOrCreateCycleTodaySheet(ss) {
  var sheet = ss.getSheetByName('Cycle Count Today');
  if (!sheet) {
    sheet = ss.insertSheet('Cycle Count Today');
    sheet.appendRow(['Date', 'Part #', 'Part Name', 'Epicor OnHand', 'Warehouse Total', 'Line Total', 'Overage', 'Score', 'Status', 'Session ID', 'First Checker', 'Second Checker', 'Count Time']);
    var h = sheet.getRange(1, 1, 1, 13); h.setFontWeight('bold'); h.setBackground('#1a1e24'); h.setFontColor('#ffffff'); sheet.setFrozenRows(1);
    sheet.setColumnWidth(2, 120); sheet.setColumnWidth(3, 220); sheet.setColumnWidth(10, 130); sheet.setColumnWidth(13, 160);
  }
  return sheet;
}
function getOrCreateCycleLogSheet(ss) {
  var sheet = ss.getSheetByName('Cycle Count Log');
  if (!sheet) {
    sheet = ss.insertSheet('Cycle Count Log');
    sheet.appendRow(['Session ID', 'Date', 'Part #', 'Part Name', 'First Checker', 'Second Checker', 'System Total (pre)', 'Counted Total', 'Variance', 'Warehouse Sys', 'Warehouse Counted', 'Line Sys', 'Line Counted', 'Epicor OnHand', '1st-2nd Agreed?', 'Confirmed At']);
    var h = sheet.getRange(1, 1, 1, 16); h.setFontWeight('bold'); h.setBackground('#1a1e24'); h.setFontColor('#ffffff'); sheet.setFrozenRows(1);
  }
  return sheet;
}
function getOrCreateCycleDetailSheet(ss) {
  var sheet = ss.getSheetByName('Cycle Count Detail');
  if (!sheet) {
    sheet = ss.insertSheet('Cycle Count Detail');
    sheet.appendRow(['Session ID', 'Part #', 'Place Type', 'Place', 'System Qty', 'First Count', 'Second Count', 'New Qty Written', 'Action']);
    var h = sheet.getRange(1, 1, 1, 9); h.setFontWeight('bold'); h.setBackground('#1a1e24'); h.setFontColor('#ffffff'); sheet.setFrozenRows(1);
  }
  return sheet;
}
function getOrCreateCycleEodSheet(ss) {
  var sheet = ss.getSheetByName('Cycle Count EOD');
  if (!sheet) {
    sheet = ss.insertSheet('Cycle Count EOD');
    sheet.appendRow(['Date Counted', 'Part #', 'Counted Total', 'Count Time', 'Post-Count Adjustment', 'EOD Total', 'Current Epicor OnHand', 'EOD vs Epicor', 'Finalized?', 'Entered in Epicor?']);
    var h = sheet.getRange(1, 1, 1, 10); h.setFontWeight('bold'); h.setBackground('#1a1e24'); h.setFontColor('#ffffff'); sheet.setFrozenRows(1);
  }
  return sheet;
}

// ── Data maps for the priority engine ────────────────────────
function readEpicorRows_(ss) { // [{partNum, partNumLower, qty}] with original case
  var sheet = ss.getSheetByName(TARGET_SHEET);
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  var headers = rows[0], pnCol = -1, qtyCol = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim();
    if (h === 'Part_PartNum') pnCol = i;
    if (h === 'Calculated_PartQty') qtyCol = i;
  }
  if (pnCol === -1 || qtyCol === -1) return [];
  var out = [], seen = {};
  for (var r = 1; r < rows.length; r++) {
    var pn = String(rows[r][pnCol] || '').trim(); if (!pn) continue;
    var q = parseFloat(rows[r][qtyCol]); if (isNaN(q)) q = 0;
    var lc = pn.toLowerCase();
    if (seen[lc] !== undefined) { out[seen[lc]].qty = q; continue; }
    seen[lc] = out.length; out.push({ partNum: pn, partNumLower: lc, qty: q });
  }
  return out;
}
function buildWarehouseTotals_(ss) { // {totals:{lower:qty}, names:{lower:name}}
  var sheet = ss.getSheetByName('Locations');
  var totals = {}, names = {};
  if (!sheet) return { totals: totals, names: names };
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var pn = String(rows[i][18] || '').trim(); if (!pn) continue;
    var lc = pn.toLowerCase();
    totals[lc] = (totals[lc] || 0) + (parseInt(rows[i][17]) || 0);
    if (!names[lc]) names[lc] = String(rows[i][19] || '').trim();
  }
  return { totals: totals, names: names };
}
function buildLineAggregates_(ss) { // {lower:{lineTotal, reorderSum, partName}}
  var inv = readLineInventory(ss), agg = {};
  for (var i = 0; i < inv.length; i++) {
    var lc = String(inv[i].partNum).trim().toLowerCase();
    if (!agg[lc]) agg[lc] = { lineTotal: 0, reorderSum: 0, partName: '' };
    agg[lc].lineTotal += (parseFloat(inv[i].onLineQty) || 0);
    var rp = parseFloat(inv[i].reorderPoint); if (!isNaN(rp)) agg[lc].reorderSum += rp;
    if (!agg[lc].partName && inv[i].partName) agg[lc].partName = inv[i].partName;
  }
  return agg;
}
function associatedLinesForPart_(ss, partNum) { // distinct lines from BOM + orphan map
  var pn = String(partNum || '').trim().toLowerCase(), lines = {};
  var bom = ss.getSheetByName('BOM');
  if (bom) {
    var br = bom.getDataRange().getValues();
    for (var i = 1; i < br.length; i++) {
      if (String(br[i][2] || '').trim().toLowerCase() === pn) { var ln = String(br[i][0] || '').trim(); if (ln) lines[ln] = true; }
    }
  }
  try {
    var orph = getOrCreateOrphanSheet(ss);
    var or = orph.getDataRange().getValues();
    for (var j = 1; j < or.length; j++) {
      if (String(or[j][0] || '').trim().toLowerCase() === pn) { var ln2 = String(or[j][2] || '').trim(); if (ln2) lines[ln2] = true; }
    }
  } catch (e) {}
  return Object.keys(lines);
}
function countedPartsSince_(ss, sweepStartIso) { // {partLower:true} confirmed in current sweep
  var sheet = ss.getSheetByName('Cycle Count Log'); var set = {};
  if (!sheet) return set;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var pn = String(rows[i][2] || '').trim(); if (!pn) continue;
    var iso = confirmedToIso_(rows[i][15]);
    if (iso && iso >= sweepStartIso) set[pn.toLowerCase()] = true;
  }
  return set;
}

// ── Selection engine ─────────────────────────────────────────
// Every Epicor part, scored by signed overage (warehouse + line − Epicor),
// descending — over-tracked parts first. No exclusions applied here.
// Per-part unit cost from BAQ_Data. Alias the chosen Epicor cost (average suggested) to a
// column named "Calculated_UnitCost". Returns {map:{partLower:cost}, mode:bool}. When no cost
// column exists, mode=false → every metric falls back to unit weight (cost 1) — no change.
function readEpicorCost_(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TARGET_SHEET);
  if (!sheet) return { map: {}, mode: false };
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { map: {}, mode: false };
  var headers = rows[0], pnCol = -1, costCol = -1;
  var norm = function(h) { return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  for (var i = 0; i < headers.length; i++) { if (String(headers[i] || '').trim() === 'Part_PartNum') pnCol = i; }
  if (pnCol === -1) return { map: {}, mode: false };
  // 1) explicit cost_column setting wins (matched ignoring case/spaces/punctuation)
  var cfg = norm(readCycleSettings(ss).costColumn);
  if (cfg) { for (var a = 0; a < headers.length; a++) { if (norm(headers[a]) === cfg) { costCol = a; break; } } }
  // 2) auto-detect, preferring full total cost, then other known cost fields (in priority order)
  if (costCol === -1) {
    var prefer = ['calculatedtotalcost', 'calculatedunitcost', 'partunitcost', 'unitcost', 'calculatedavgunitcost', 'partcoststdmaterialcost', 'calculatedstdmaterialburden', 'calculatedcost'];
    for (var p = 0; p < prefer.length && costCol === -1; p++) {
      for (var b = 0; b < headers.length; b++) { if (norm(headers[b]) === prefer[p]) { costCol = b; break; } }
    }
    if (costCol === -1) {  // last-resort fuzzy
      for (var f = 0; f < headers.length; f++) {
        var hn = norm(headers[f]);
        if (hn.indexOf('totalcost') !== -1 || hn.indexOf('materialcost') !== -1 || hn.indexOf('unitcost') !== -1 || hn.indexOf('materialburden') !== -1) { costCol = f; break; }
      }
    }
  }
  if (costCol === -1) return { map: {}, mode: false };
  var map = {};
  for (var r = 1; r < rows.length; r++) {
    var pn = String(rows[r][pnCol] || '').trim(); if (!pn) continue;
    var cv = parseFloat(rows[r][costCol]); if (isNaN(cv) || cv < 0) cv = 0;
    map[pn.toLowerCase()] = cv;
  }
  return { map: map, mode: true };
}
// Per-part type/class from BAQ_Data (Part_TypeCode / ProdCode / ClassID). Used to drop
// finished goods (manufactured 'M') from every metric. {map:{partLower:valueLower}, mode, column}.
function readEpicorTypeMap_(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TARGET_SHEET);
  if (!sheet) return { map: {}, mode: false, column: '' };
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { map: {}, mode: false, column: '' };
  var headers = rows[0], pnCol = -1, typeCol = -1;
  var norm = function(h) { return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  for (var i = 0; i < headers.length; i++) { if (String(headers[i] || '').trim() === 'Part_PartNum') pnCol = i; }
  if (pnCol === -1) return { map: {}, mode: false, column: '' };
  var cfg = norm(readCycleSettings(ss).partTypeColumn);
  if (cfg) { for (var a = 0; a < headers.length; a++) { if (norm(headers[a]) === cfg) { typeCol = a; break; } } }
  if (typeCol === -1) {
    var prefer = ['parttypecode', 'calculatedtypecode', 'typecode', 'partprodcode', 'calculatedprodcode', 'prodcode', 'partclassid', 'classid'];
    for (var p = 0; p < prefer.length && typeCol === -1; p++) { for (var b = 0; b < headers.length; b++) { if (norm(headers[b]) === prefer[p]) { typeCol = b; break; } } }
  }
  if (typeCol === -1) return { map: {}, mode: false, column: '' };
  var map = {};
  for (var r = 1; r < rows.length; r++) {
    var pn = String(rows[r][pnCol] || '').trim(); if (!pn) continue;
    map[pn.toLowerCase()] = String(rows[r][typeCol] || '').trim().toLowerCase();
  }
  return { map: map, mode: true, column: String(headers[typeCol]) };
}
// Every Epicor part scored for priority = |warehouse − Epicor| × unit cost ÷ reorder point,
// descending. `cost` is carried so the error rate + drivers dollar-weight too.
function cycleScoredCandidates_(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var epi = readEpicorRows_(ss);
  var wh = buildWarehouseTotals_(ss);
  var lineAgg = buildLineAggregates_(ss);
  var excl = readCycleExclusions(ss);
  var costInfo = readEpicorCost_(ss);
  var typeInfo = readEpicorTypeMap_(ss);
  var exTypes = {}; (readCycleSettings(ss).excludePartTypes || []).forEach(function(t) { exTypes[String(t).trim().toLowerCase()] = true; });
  var c = [];
  for (var k = 0; k < epi.length; k++) {
    var pl = epi[k].partNumLower;
    if (excl[pl]) continue;   // excluded parts (e.g. generic HARDWARE) drop out of every metric
    var tv = typeInfo.mode ? (typeInfo.map[pl] || '') : '';
    if (tv && exTypes[tv]) continue;   // finished goods / excluded part types — not tracked in our system
    var whTot = wh.totals[pl] || 0;
    var la = lineAgg[pl] || { lineTotal: 0, reorderSum: 0, partName: '' };
    var tracked = whTot + la.lineTotal;
    var overage = tracked - epi[k].qty;   // signed total drift (units) — for the error metric + display
    var basis = la.reorderSum > 0 ? la.reorderSum : 1;
    var cost = costInfo.mode ? (costInfo.map[pl] || 0) : 1;   // dollar weight (1 until a cost column exists)
    var score = Math.abs(whTot - epi[k].qty) * cost / basis;
    c.push({ partNum: epi[k].partNum, partNumLower: pl, partName: (la.partName || wh.names[pl] || ''), epicor: epi[k].qty, wh: whTot, line: la.lineTotal, overage: overage, cost: cost, score: score });
  }
  c.sort(function(a, b) { if (b.score !== a.score) return b.score - a.score; return (Math.abs(b.wh - b.epicor) * b.cost) - (Math.abs(a.wh - a.epicor) * a.cost); });
  return c;
}
// Parts to exclude from the ENTIRE cycle-count metric (selection, error rate, drivers).
// For generic Epicor parts that don't correspond to anything in warehouse/line tracking.
// Seeded with HARDWARE; add more by part number in the "Cycle Count Exclusions" tab.
function getOrCreateCycleExclusionsSheet(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Cycle Count Exclusions');
  if (!sheet) {
    sheet = ss.insertSheet('Cycle Count Exclusions');
    sheet.appendRow(['Part #', 'Reason']);
    var h = sheet.getRange(1, 1, 1, 2); h.setFontWeight('bold'); h.setBackground('#1a1e24'); h.setFontColor('#ffffff'); sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 170); sheet.setColumnWidth(2, 380);
    sheet.appendRow(['HARDWARE', 'Generic Epicor part — does not correspond to anything in warehouse/line tracking']);
  }
  return sheet;
}
function readCycleExclusions(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateCycleExclusionsSheet(ss);
  var rows = sheet.getDataRange().getValues();
  var set = {};
  for (var i = 1; i < rows.length; i++) {
    var p = String(rows[i][0] || '').trim().toLowerCase();
    if (p) set[p] = true;
  }
  return set;
}
// Builds today's frozen list. No-op if today's list already has work in
// progress (unless force), so a re-run never clobbers a started count.
// Excludes parts already counted OR skipped in the current sweep.
function generateTodayList(ss, dateStr, force) {
  var settings = readCycleSettings(ss);
  var N = settings.dailyCountN || 10;
  var todaySheet = getOrCreateCycleTodaySheet(ss);
  var dayDisplay = dateStr || Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy');
  var existing = todaySheet.getDataRange().getValues();
  var hasToday = false, started = false;
  for (var i = 1; i < existing.length; i++) {
    if (fmtDateCell_(existing[i][0]) === dayDisplay) { hasToday = true; if (String(existing[i][8] || '').trim().toLowerCase() !== 'pending') started = true; }
  }
  if (hasToday && started && !force) return { skipped: true, reason: 'today list already in progress', date: dayDisplay };
  var sweepStart = settings.sweepStarted;
  if (!sweepStart) { sweepStart = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd'); setCycleSetting_(ss, 'sweep_started', sweepStart); }
  var cands0 = cycleScoredCandidates_(ss);
  var excluded = countedPartsSince_(ss, sweepStart);
  var sk = skippedPartsSince_(ss, sweepStart);
  Object.keys(sk).forEach(function(k) { excluded[k] = true; });
  var cands = cands0.filter(function(c) { return !excluded[c.partNumLower]; });
  var newSweep = false;
  if (cands.length === 0) { // sweep complete (everything counted/skipped) → open a new one
    setCycleSetting_(ss, 'sweep_started', Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd'));
    cands = cands0.slice(); newSweep = true;
  }
  var top = cands.slice(0, N);
  if (todaySheet.getLastRow() > 1) todaySheet.getRange(2, 1, todaySheet.getLastRow() - 1, 13).clearContent();
  var stamp = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyyMMdd');
  var outRows = [];
  for (var t = 0; t < top.length; t++) {
    outRows.push([dayDisplay, top[t].partNum, top[t].partName, top[t].epicor, top[t].wh, top[t].line, round2_(top[t].overage), round2_(top[t].score), 'pending', 'CC' + stamp + '-' + (t + 1), '', '', '']);
  }
  if (outRows.length) todaySheet.getRange(2, 1, outRows.length, 13).setValues(outRows);
  return { date: dayDisplay, generated: outRows.length, newSweep: newSweep, poolConsidered: cands0.length, n: N };
}
// ── Skip — bypass a part and pull in the next-ranked candidate ──
function getOrCreateCycleSkipsSheet(ss) {
  var sheet = ss.getSheetByName('Cycle Count Skips');
  if (!sheet) {
    sheet = ss.insertSheet('Cycle Count Skips');
    sheet.appendRow(['Date', 'Part #', 'Skipped By', 'Sweep Started']);
    var h = sheet.getRange(1, 1, 1, 4); h.setFontWeight('bold'); h.setBackground('#1a1e24'); h.setFontColor('#ffffff'); sheet.setFrozenRows(1);
  }
  return sheet;
}
function skippedPartsSince_(ss, sweepStartIso) {
  var sheet = ss.getSheetByName('Cycle Count Skips'); var set = {};
  if (!sheet) return set;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var pn = String(rows[i][1] || '').trim(); if (!pn) continue;
    var iso = confirmedToIso_(rows[i][0]);
    if (iso && iso >= sweepStartIso) set[pn.toLowerCase()] = true;
  }
  return set;
}
// Mark a Today row skipped (no reason needed), log it for the sweep, and append
// the next-best candidate not already counted/skipped/on-today.
function cycleSkipCount_(ss, data) {
  var sessionId = String(data.sessionId || '').trim();
  if (!sessionId) return { success: false, error: 'sessionId required' };
  var tr = getTodayRow_(ss, sessionId);
  if (!tr) return { success: false, error: 'session not found' };
  if (tr.status === 'verified') return { success: false, error: 'already verified — cannot skip' };
  tr.sheet.getRange(tr.ri + 1, 9).setValue('skipped');
  var settings = readCycleSettings(ss);
  var sweepStart = settings.sweepStarted || Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  getOrCreateCycleSkipsSheet(ss).appendRow([Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy'), tr.partNum, String(data.skippedBy || ''), sweepStart]);
  var onToday = {};
  var todaySheet = getOrCreateCycleTodaySheet(ss);
  var rows = todaySheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) { var p = String(rows[i][1] || '').trim().toLowerCase(); if (p) onToday[p] = true; }
  var counted = countedPartsSince_(ss, sweepStart);
  var skipped = skippedPartsSince_(ss, sweepStart);
  var cands = cycleScoredCandidates_(ss);
  var next = null;
  for (var c = 0; c < cands.length; c++) {
    var pl = cands[c].partNumLower;
    if (counted[pl] || skipped[pl] || onToday[pl]) continue;
    next = cands[c]; break;
  }
  if (!next) return { success: true, skipped: tr.partNum, next: null, note: 'no more candidates left in this sweep' };
  var dayDisplay = tr.date || Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy');
  var sid = 'CC' + Utilities.formatDate(new Date(), 'America/Chicago', 'yyyyMMdd') + '-X' + Math.floor(Math.random() * 100000);
  todaySheet.appendRow([dayDisplay, next.partNum, next.partName, next.epicor, next.wh, next.line, round2_(next.overage), round2_(next.score), 'pending', sid, '', '', '']);
  return { success: true, skipped: tr.partNum, next: next.partNum, nextSession: sid };
}
// Append the next-ranked uncounted parts to today's list WITHOUT clearing it —
// for high-volume days when you blow through the daily N and want more. Excludes
// parts already counted/skipped this sweep or already on today's list.
function cycleAddToToday_(ss, count) {
  var settings = readCycleSettings(ss);
  var n = parseInt(count) || settings.dailyCountN || 10;
  var todaySheet = getOrCreateCycleTodaySheet(ss);
  var dayDisplay = Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy');
  var sweepStart = settings.sweepStarted;
  if (!sweepStart) { sweepStart = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd'); setCycleSetting_(ss, 'sweep_started', sweepStart); }
  var onToday = {};
  var rows = todaySheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) { var p = String(rows[i][1] || '').trim().toLowerCase(); if (p) onToday[p] = true; }
  var counted = countedPartsSince_(ss, sweepStart);
  var skipped = skippedPartsSince_(ss, sweepStart);
  var cands = cycleScoredCandidates_(ss);
  var stamp = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyyMMdd');
  var base = todaySheet.getLastRow();
  var newRows = [], added = [];
  for (var c = 0; c < cands.length && newRows.length < n; c++) {
    var pl = cands[c].partNumLower;
    if (counted[pl] || skipped[pl] || onToday[pl]) continue;
    var sid = 'CC' + stamp + '-A' + (base + newRows.length + 1);
    newRows.push([dayDisplay, cands[c].partNum, cands[c].partName, cands[c].epicor, cands[c].wh, cands[c].line, round2_(cands[c].overage), round2_(cands[c].score), 'pending', sid, '', '', '']);
    onToday[pl] = true; added.push(cands[c].partNum);
  }
  if (newRows.length) todaySheet.getRange(base + 1, 1, newRows.length, 13).setValues(newRows);
  return { success: true, added: added.length, parts: added };
}
// Manually add ONE specific part to today's list (target a known error / high priority).
// If it's already on the list and not done, just point back to it.
function cycleAddPart_(ss, partNum) {
  var pn = String(partNum || '').trim();
  if (!pn) return { success: false, error: 'Enter a part number' };
  var todaySheet = getOrCreateCycleTodaySheet(ss);
  var rows = todaySheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1] || '').trim().toLowerCase() === pn.toLowerCase()) {
      var st = String(rows[i][8] || '').trim().toLowerCase();
      if (st !== 'verified' && st !== 'skipped') {
        return { success: true, added: false, already: true, partNum: String(rows[i][1]).trim(), sessionId: String(rows[i][9]).trim() };
      }
    }
  }
  var epiMap = readEpicorOnHand(ss).onHand, lc = pn.toLowerCase();
  var epi = (epiMap[lc] !== undefined) ? epiMap[lc] : '';
  var wh = buildWarehouseTotals_(ss), whTot = wh.totals[lc] || 0, name = wh.names[lc] || '';
  var la = (buildLineAggregates_(ss)[lc]) || { lineTotal: 0, reorderSum: 0, partName: '' };
  if (!name) name = la.partName || '';
  var overage = (whTot + la.lineTotal) - (epi === '' ? 0 : epi);
  var basis = la.reorderSum > 0 ? la.reorderSum : 1;
  var sid = 'CC' + Utilities.formatDate(new Date(), 'America/Chicago', 'yyyyMMdd') + '-M' + (todaySheet.getLastRow() + 1);
  var dayDisplay = Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy');
  todaySheet.appendRow([dayDisplay, pn, name, epi, whTot, la.lineTotal, round2_(overage), round2_(overage / basis), 'pending', sid, '', '', '']);
  return { success: true, added: true, partNum: pn, sessionId: sid };
}

// ── Reads for the portal ─────────────────────────────────────
function readCycleToday(ss) {
  var sheet = getOrCreateCycleTodaySheet(ss);
  var rows = sheet.getDataRange().getValues(); var out = [];
  for (var i = 1; i < rows.length; i++) {
    if (!String(rows[i][1] || '').trim()) continue;
    out.push({ date: fmtDateCell_(rows[i][0]), partNum: String(rows[i][1]).trim(), partName: String(rows[i][2]).trim(),
      epicorOnHand: rows[i][3], warehouseTotal: rows[i][4], lineTotal: rows[i][5], overage: rows[i][6], score: rows[i][7],
      status: String(rows[i][8] || '').trim(), sessionId: String(rows[i][9] || '').trim(),
      firstChecker: String(rows[i][10] || '').trim(), secondChecker: String(rows[i][11] || '').trim(), countTime: fmtDtCell_(rows[i][12]) });
  }
  return out;
}
function cyclePartProfile_(ss, partNum) {
  var pn = String(partNum || '').trim(), lc = pn.toLowerCase();
  var locSheet = ss.getSheetByName('Locations'), wh = [], whTot = 0, name = '';
  if (locSheet) {
    var rows = locSheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][18] || '').trim().toLowerCase() === lc) {
        var q = parseInt(rows[i][17]) || 0;
        wh.push({ location: String(rows[i][16] || '').trim(), qty: q }); whTot += q;
        if (!name) name = String(rows[i][19] || '').trim();
      }
    }
  }
  var inv = readLineInventory(ss), lineMap = {}, lineTot = 0;
  for (var j = 0; j < inv.length; j++) {
    if (String(inv[j].partNum).trim().toLowerCase() === lc) {
      lineMap[String(inv[j].line).trim()] = { line: inv[j].line, onLineQty: inv[j].onLineQty, tracked: true, reorderPoint: inv[j].reorderPoint };
      lineTot += (parseFloat(inv[j].onLineQty) || 0);
      if (!name) name = inv[j].partName;
    }
  }
  var assoc = associatedLinesForPart_(ss, pn);
  for (var a = 0; a < assoc.length; a++) { if (!lineMap[assoc[a]]) lineMap[assoc[a]] = { line: assoc[a], onLineQty: 0, tracked: false, reorderPoint: '' }; }
  var epi = readEpicorOnHand(ss).onHand;
  var lineArr = Object.keys(lineMap).map(function(k){ return lineMap[k]; });
  var epiOnHand = (epi[lc] !== undefined ? epi[lc] : null);
  var contrib = null;   // this part's share of the total error rate (points it could remove)
  if (epiOnHand !== null) {
    var t = computeInventoryErrorRate_(ss);
    var ci = readEpicorCost_(ss); var cst = ci.mode ? (ci.map[lc] || 0) : 1;
    contrib = t.sumEpicor > 0 ? Math.round(Math.abs((whTot + lineTot) - epiOnHand) * cst / t.sumEpicor * 10000) / 100 : 0;
  }
  return { partNum: pn, partName: name, epicorOnHand: epiOnHand, warehouse: wh, warehouseTotal: whTot, lines: lineArr, lineTotal: lineTot, errorContributionPct: contrib };
}

// ── Today-row + detail helpers ───────────────────────────────
function getTodayRow_(ss, sessionId) {
  var sheet = getOrCreateCycleTodaySheet(ss);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][9] || '').trim() === String(sessionId).trim()) {
      return { ri: i, sheet: sheet, date: fmtDateCell_(rows[i][0]), partNum: String(rows[i][1]).trim(), partName: String(rows[i][2]).trim(),
        status: String(rows[i][8]).trim(), firstChecker: String(rows[i][10] || '').trim(), secondChecker: String(rows[i][11] || '').trim(), countTime: fmtDtCell_(rows[i][12]) };
    }
  }
  return null;
}
function updateTodayStatus_(ss, sessionId, fields) {
  var row = getTodayRow_(ss, sessionId); if (!row) return false;
  if (fields.status !== undefined) row.sheet.getRange(row.ri + 1, 9).setValue(fields.status);
  if (fields.firstChecker) row.sheet.getRange(row.ri + 1, 11).setValue(fields.firstChecker);
  if (fields.secondChecker) row.sheet.getRange(row.ri + 1, 12).setValue(fields.secondChecker);
  if (fields.countTime) row.sheet.getRange(row.ri + 1, 13).setValue(fields.countTime);
  return true;
}
function clearDetailFor_(sheet, sessionId, partNum) {
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]).trim() === String(sessionId).trim() && String(rows[i][1]).trim().toLowerCase() === String(partNum).trim().toLowerCase()) sheet.deleteRow(i + 1);
  }
}

// ── Absolute write helpers (cycle count overwrites set, not delta) ──
function setLocationQtyAbsolute_(ss, location, partNum, partName, qty) {
  var sheet = ss.getSheetByName('Locations'); if (!sheet) throw new Error('Locations sheet not found');
  var rows = sheet.getDataRange().getValues();
  var loc = String(location || '').trim(), pn = String(partNum || '').trim();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][16] || '').trim().toLowerCase() === loc.toLowerCase() && String(rows[i][18] || '').trim().toLowerCase() === pn.toLowerCase()) {
      if (qty <= 0) { sheet.deleteRow(i + 1); return 'remove'; }
      sheet.getRange(i + 1, 18).setValue(qty); return 'overwrite';
    }
  }
  if (qty > 0) {
    var lr = sheet.getLastRow() + 1;
    sheet.getRange(lr, 17).setValue(loc); sheet.getRange(lr, 18).setValue(qty); sheet.getRange(lr, 19).setValue(pn); sheet.getRange(lr, 20).setValue(String(partName || ''));
    return 'add';
  }
  return 'none';
}
function setLineInventoryQty_(ss, line, partNum, partName, qty) {
  var ln = String(line || '').trim(), pn = String(partNum || '').trim(); if (!ln || !pn) return 'none';
  var sheet = getOrCreateLineInventorySheet(ss);
  var rows = sheet.getDataRange().getValues();
  var now = Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy HH:mm:ss');
  var q = Math.max(0, qty);
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toLowerCase() === ln.toLowerCase() && String(rows[i][1] || '').trim().toLowerCase() === pn.toLowerCase()) {
      sheet.getRange(i + 1, 4).setValue(q); sheet.getRange(i + 1, 8).setValue(now); sheet.getRange(i + 1, 9).setValue(lineInvStatus_(q, rows[i][4]));
      if (partName && !String(rows[i][2] || '').trim()) sheet.getRange(i + 1, 3).setValue(String(partName));
      return 'overwrite';
    }
  }
  sheet.appendRow([ln, pn, String(partName || ''), q, '', '', 'off', now, lineInvStatus_(q, '')]);
  return 'add';
}

// Apply a confirmed count's inventory overwrites, posted by the Postgres cycle
// engine on PMS. Each item: { placeType: 'warehouse'|'line', place, qty, sysQty }.
// qty is the verified count (absolute set); sysQty is the system qty recorded at
// first-count time, so Transaction Log deltas match the old cycleConfirmCount_
// semantics exactly. Purely a write executor — no session state lives here.
function cycleApplyWrites_(ss, data) {
  var pn = String(data.partNum || '').trim();
  if (!pn) return { success: false, error: 'partNum required' };
  var pname = String(data.partName || '').trim();
  var items = data.items || [];
  var locSheet = ss.getSheetByName('Locations');
  var results = [];
  for (var w = 0; w < items.length; w++) {
    var it = items[w] || {};
    var pt = String(it.placeType || '').trim().toLowerCase();
    var place = String(it.place || '').trim();
    var q = parseFloat(it.qty); if (isNaN(q)) q = 0;
    var sys = parseFloat(it.sysQty); if (isNaN(sys)) sys = 0;
    var delta = q - sys;
    var action = 'none';
    if (pt === 'warehouse') {
      action = setLocationQtyAbsolute_(ss, place, pn, pname, q);
      if (delta !== 0 || action === 'add' || action === 'remove') {
        appendTransaction(ss, { partNum: pn, qtyTransacted: delta, newQty: q, totalOnHand: computeTotalOnHand(locSheet, pn), txType: 'Cycle Count', location: place, line: '' });
      }
    } else if (pt === 'line') {
      action = setLineInventoryQty_(ss, place, pn, pname, q);
      if (delta !== 0) {
        appendTransaction(ss, { partNum: pn, qtyTransacted: delta, newQty: q, totalOnHand: computeTotalOnHand(locSheet, pn), txType: 'Cycle Count (Line)', location: place, line: place });
      }
    }
    results.push({ placeType: pt, place: place, action: action, delta: delta });
  }
  return { success: true, partNum: pn, applied: results.length, results: results };
}

// ── Count workflow actions ───────────────────────────────────
function cycleSubmitFirstCount_(ss, data) {
  var sessionId = String(data.sessionId || '').trim(), partNum = String(data.partNum || '').trim();
  if (!sessionId || !partNum) return { success: false, error: 'sessionId and partNum required' };
  var counts = data.counts || [], firstChecker = String(data.checker || data.firstChecker || '').trim();
  var prof = cyclePartProfile_(ss, partNum);
  var whMap = {}, lnMap = {};
  for (var i = 0; i < prof.warehouse.length; i++) whMap[prof.warehouse[i].location.toLowerCase()] = prof.warehouse[i].qty;
  for (var j = 0; j < prof.lines.length; j++) lnMap[prof.lines[j].line.toLowerCase()] = prof.lines[j].onLineQty;
  var detail = getOrCreateCycleDetailSheet(ss);
  clearDetailFor_(detail, sessionId, partNum);
  var outRows = [];
  for (var c = 0; c < counts.length; c++) {
    var pt = String(counts[c].placeType || '').trim().toLowerCase(), place = String(counts[c].place || '').trim();
    var sysQty = pt === 'warehouse' ? (whMap[place.toLowerCase()] || 0) : (pt === 'line' ? (lnMap[place.toLowerCase()] || 0) : 0);
    var fc = parseFloat(counts[c].count); if (isNaN(fc)) fc = 0;
    outRows.push([sessionId, partNum, pt, place, sysQty, fc, '', '', '']);
  }
  if (outRows.length) detail.getRange(detail.getLastRow() + 1, 1, outRows.length, 9).setValues(outRows);
  updateTodayStatus_(ss, sessionId, { status: 'counted', firstChecker: firstChecker, countTime: Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy HH:mm:ss') });
  return { success: true, sessionId: sessionId, partNum: partNum, places: outRows.length };
}
// (single-checker model — the former two-checker second-count step was removed.)
function cycleConfirmCount_(ss, data) {
  var sessionId = String(data.sessionId || '').trim(), partNum = String(data.partNum || '').trim();
  if (!sessionId || !partNum) return { success: false, error: 'sessionId and partNum required' };
  var settings = readCycleSettings(ss);
  if (settings.requirePin) {
    var pin = String(data.pin || '').trim();
    if (!pin || settings.confirmPins.indexOf(pin) === -1) return { success: false, error: 'Invalid or missing PIN' };
  }
  var tr = getTodayRow_(ss, sessionId);
  var nameForWrite = (tr && tr.partName) ? tr.partName : '';
  var dayDisplay = (tr && tr.date) ? tr.date : Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy');
  var firstChecker = tr ? tr.firstChecker : '', secondChecker = tr ? tr.secondChecker : '';
  var detail = getOrCreateCycleDetailSheet(ss);
  var rows = detail.getDataRange().getValues();
  var lines = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === sessionId && String(rows[i][1]).trim().toLowerCase() === partNum.toLowerCase()) {
      lines.push({ ri: i, pt: String(rows[i][2]).trim().toLowerCase(), place: String(rows[i][3]).trim(), sys: parseFloat(rows[i][4]) || 0, first: rows[i][5], second: rows[i][6] });
    }
  }
  if (!lines.length) return { success: false, error: 'No counts found for this session/part' };
  var whSys = 0, whCounted = 0, lineSys = 0, lineCounted = 0, agreed = true;
  var nowStr = Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy HH:mm:ss');
  var locSheet = ss.getSheetByName('Locations');
  for (var k = 0; k < lines.length; k++) {
    var L = lines[k];
    var firstNum = (L.first === '' || L.first === null || isNaN(parseFloat(L.first))) ? null : parseFloat(L.first);
    var secondNum = (L.second === '' || L.second === null || isNaN(parseFloat(L.second))) ? null : parseFloat(L.second);
    var verified = (secondNum !== null) ? secondNum : (firstNum !== null ? firstNum : 0);
    if (firstNum !== null && secondNum !== null && firstNum !== secondNum) agreed = false;
    var delta = verified - L.sys;
    var action = 'none';
    if (L.pt === 'warehouse') {
      whSys += L.sys; whCounted += verified;
      action = setLocationQtyAbsolute_(ss, L.place, partNum, nameForWrite, verified);
      // Log every real warehouse adjustment to the Transaction Log (incl. add/remove).
      if (delta !== 0 || action === 'add' || action === 'remove') {
        appendTransaction(ss, { partNum: partNum, qtyTransacted: delta, newQty: verified, totalOnHand: computeTotalOnHand(locSheet, partNum), txType: 'Cycle Count', location: L.place, line: '' });
      }
    } else if (L.pt === 'line') {
      lineSys += L.sys; lineCounted += verified;
      action = setLineInventoryQty_(ss, L.place, partNum, nameForWrite, verified);
      // Log line adjustments too, tagged with the line in the Production Line column.
      if (delta !== 0) {
        appendTransaction(ss, { partNum: partNum, qtyTransacted: delta, newQty: verified, totalOnHand: computeTotalOnHand(locSheet, partNum), txType: 'Cycle Count (Line)', location: L.place, line: L.place });
      }
    }
    detail.getRange(L.ri + 1, 8).setValue(verified);
    detail.getRange(L.ri + 1, 9).setValue(action);
  }
  var systemTotal = whSys + lineSys, countedTotal = whCounted + lineCounted, variance = countedTotal - systemTotal;
  var epi = readEpicorOnHand(ss).onHand;
  var epiQty = (epi[partNum.toLowerCase()] !== undefined) ? epi[partNum.toLowerCase()] : '';
  // How many points this count knocks off the inventory error rate:
  // (|old tracked − Epicor| − |new count − Epicor|) ÷ Σ Epicor.
  var reductionPct = 0;
  if (epiQty !== '' && !isNaN(parseFloat(epiQty))) {
    var totalsC = computeInventoryErrorRate_(ss);
    var ciC = readEpicorCost_(ss); var cstC = ciC.mode ? (ciC.map[partNum.toLowerCase()] || 0) : 1;
    if (totalsC.sumEpicor > 0) {
      reductionPct = Math.round((Math.abs(systemTotal - epiQty) - Math.abs(countedTotal - epiQty)) * cstC / totalsC.sumEpicor * 10000) / 100;
    }
  }
  getOrCreateCycleLogSheet(ss).appendRow([sessionId, dayDisplay, partNum, nameForWrite, firstChecker, secondChecker, systemTotal, countedTotal, variance, whSys, whCounted, lineSys, lineCounted, epiQty, 'n/a', nowStr]);
  getOrCreateCycleEodSheet(ss).appendRow([dayDisplay, partNum, countedTotal, nowStr, '', '', epiQty, '', 'no', 'no']);
  updateTodayStatus_(ss, sessionId, { status: 'verified' });
  return { success: true, sessionId: sessionId, partNum: partNum, systemTotal: systemTotal, countedTotal: countedTotal, variance: variance, agreed: agreed, reductionPct: reductionPct, action: 'overwritten' };
}

// ── EOD finalizer (runs each morning, before 0800) ───────────
// EOD Total = counted total + receipts after the count − full prior-day
// consumption − scrap. Counts run early AM, so attributing the whole day's
// consumption to "after the count" is accurate (DESIGN §8).
// Recompute EVERY EOD row that hasn't been entered in Epicor yet (col 10), each run,
// pulling the full window of transactions since each count. So a row keeps its Epicor
// adjustment current — day after day — until it's marked entered (it may not be entered
// the next morning). dateStr is ignored; we always process all open rows.
function finalizeCycleEod(ss, dateStr) {
  var eod = getOrCreateCycleEodSheet(ss);
  var rows = eod.getDataRange().getValues();
  var yesterday = Utilities.formatDate(new Date(Date.now() - 86400000), 'America/Chicago', 'yyyy-MM-dd');
  var open = [];
  for (var r = 1; r < rows.length; r++) {
    var pn = String(rows[r][1] || '').trim(); if (!pn) continue;
    if (String(rows[r][9] || '').trim().toLowerCase() === 'yes') continue;   // already entered → frozen
    open.push({ r: r, pn: pn, lc: pn.toLowerCase(), dIso: isoFromDisplay_(fmtDateCell_(rows[r][0])),
      counted: parseFloat(rows[r][2]) || 0, countTime: fmtDtCell_(rows[r][3]) });
  }
  if (!open.length) return { success: true, updated: 0 };
  // One consumption + one scrap pull covering the whole open window (count date → yesterday,
  // capped at 45 days back to bound the request). Bucketed per part per day.
  var minD = open.reduce(function(m, o) { return (o.dIso && o.dIso < m) ? o.dIso : m; }, yesterday);
  var cap = Utilities.formatDate(new Date(Date.now() - 45 * 86400000), 'America/Chicago', 'yyyy-MM-dd');
  if (minD < cap) minD = cap;
  var consByPart = {}, scrapByPart = {};
  if (minD <= yesterday) {
    try {
      var con = fetchBaqRows_(BAQ_CONSUMPTION, { FromDate: minD, ToDate: yesterday });
      for (var i = 0; i < con.length; i++) {
        var comp = String(pick_(con[i], ['Component', 'Calculated_Component', 'PartTran_PartNum']) || '').trim().toLowerCase();
        var q = parseFloat(pick_(con[i], ['Quantity', 'Calculated_Quantity', 'PartTran_TranQty']) || 0) || 0;
        var cd = isoFromDisplay_(fmtDateCell_(pick_(con[i], ['TranDate', 'Calculated_TranDate', 'PartTran_TranDate'])));
        if (comp && q > 0) { consByPart[comp] = consByPart[comp] || {}; consByPart[comp][cd] = (consByPart[comp][cd] || 0) + q; }
      }
    } catch (e) {}
    try {
      var scr = fetchBaqRows_(BAQ_SCRAP, { FromDate: minD, ToDate: yesterday });
      for (var j = 0; j < scr.length; j++) {
        var sp = String(pick_(scr[j], ['Part', 'Calculated_Part', 'PartTran_PartNum']) || '').trim().toLowerCase();
        var sq = Math.abs(parseFloat(pick_(scr[j], ['Quantity', 'Calculated_Quantity', 'PartTran_TranQty']) || 0) || 0);
        var sd = isoFromDisplay_(fmtDateCell_(pick_(scr[j], ['TranDate', 'Calculated_TranDate', 'PartTran_TranDate'])));
        if (sp && sq > 0) { scrapByPart[sp] = scrapByPart[sp] || {}; scrapByPart[sp][sd] = (scrapByPart[sp][sd] || 0) + sq; }
      }
    } catch (e2) {}
  }
  var epi = readEpicorOnHand(ss).onHand;
  var updated = 0;
  for (var k = 0; k < open.length; k++) {
    var o = open[k];
    var cons = 0, cm = consByPart[o.lc] || {}; for (var d1 in cm) { if (d1 >= o.dIso) cons += cm[d1]; }
    var scrp = 0, sm = scrapByPart[o.lc] || {}; for (var d2 in sm) { if (d2 >= o.dIso) scrp += sm[d2]; }
    var receipts = receiptsSinceCount_(ss, o.pn, o.countTime);
    var postAdj = receipts - cons - scrp;
    var eodTotal = o.counted + postAdj;
    var curEpi = (epi[o.lc] !== undefined) ? epi[o.lc] : '';
    var eodVs = (curEpi === '') ? '' : (eodTotal - curEpi);
    eod.getRange(o.r + 1, 5).setValue(round2_(postAdj));
    eod.getRange(o.r + 1, 6).setValue(round2_(eodTotal));
    eod.getRange(o.r + 1, 7).setValue(curEpi);
    eod.getRange(o.r + 1, 8).setValue(eodVs === '' ? '' : round2_(eodVs));
    eod.getRange(o.r + 1, 9).setValue('yes');   // computed/ready (keeps updating until entered)
    updated++;
  }
  return { success: true, updated: updated };
}
function receiptsAfter_(ss, partNum, dayDisplay, countTime) { // sum of Stow (receipt) qty after the count
  var sheet = ss.getSheetByName('Transaction Log'); if (!sheet) return 0;
  var rows = sheet.getDataRange().getValues();
  var pn = String(partNum).toLowerCase();
  var ct = new Date(countTime);
  var sum = 0;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][2] || '').trim().toLowerCase() !== pn) continue;
    if (fmtDateCell_(rows[i][0]) !== dayDisplay) continue;
    if (String(rows[i][6] || '').trim().toLowerCase().indexOf('stow') === -1) continue;
    var dt = new Date(String(rows[i][0]).trim() + ' ' + String(rows[i][1]).trim());
    if (!isNaN(ct.getTime()) && !isNaN(dt.getTime()) && dt.getTime() <= ct.getTime()) continue;
    sum += (parseFloat(rows[i][3]) || 0);
  }
  return sum;
}
// Cumulative receipt (stow) qty for a part across ALL dates after the count time.
function receiptsSinceCount_(ss, partNum, countTime) {
  var sheet = ss.getSheetByName('Transaction Log'); if (!sheet) return 0;
  var rows = sheet.getDataRange().getValues();
  var pn = String(partNum).toLowerCase();
  var ct = new Date(countTime); if (isNaN(ct.getTime())) return 0;
  var sum = 0;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][2] || '').trim().toLowerCase() !== pn) continue;
    if (String(rows[i][6] || '').trim().toLowerCase().indexOf('stow') === -1) continue;
    var datePart = fmtDateCell_(rows[i][0]);
    var t = rows[i][1];
    var timePart = (t instanceof Date) ? Utilities.formatDate(t, 'America/Chicago', 'HH:mm:ss') : String(t || '').trim();
    var dt = new Date(datePart + ' ' + timePart);
    if (!isNaN(dt.getTime()) && dt.getTime() > ct.getTime()) sum += (parseFloat(rows[i][3]) || 0);
  }
  return sum;
}
// Set the "Entered in Epicor?" flag for one EOD row (identified by part + count time),
// from the app. Marking it 'yes' freezes the row (the finalizer stops updating it).
function cycleSetEodEntered_(ss, data) {
  var pn = String(data.partNum || '').trim().toLowerCase();
  var ct = String(data.countTime || '').trim();
  if (!pn || !ct) return { success: false, error: 'partNum and countTime required' };
  var entered = (data.entered === true || String(data.entered).toLowerCase() === 'true' || String(data.entered).toLowerCase() === 'yes') ? 'yes' : 'no';
  var eod = getOrCreateCycleEodSheet(ss);
  var rows = eod.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1] || '').trim().toLowerCase() === pn && fmtDtCell_(rows[i][3]) === ct) {
      eod.getRange(i + 1, 10).setValue(entered);
      return { success: true, partNum: data.partNum, countTime: ct, entered: entered };
    }
  }
  return { success: false, error: 'EOD row not found' };
}

// ── Triggers + manual test ───────────────────────────────────
function generateTodayListSafe() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try { generateTodayList(ss, '', false); } catch (e) { Logger.log('generateTodayListSafe: ' + e.message); }
  try { snapshotErrorRate_(ss); } catch (e) { Logger.log('snapshotErrorRate_: ' + e.message); }
}
function finalizeCycleEodSafe() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try { finalizeCycleEod(ss, ''); } catch (e) { Logger.log('finalizeCycleEodSafe: ' + e.message); }
}
// Run ONCE from the editor to install both daily triggers (before 0800).
function setupCycleTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var n = t.getHandlerFunction();
    if (n === 'generateTodayListSafe' || n === 'finalizeCycleEodSafe') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('generateTodayListSafe').timeBased().everyDays(1).atHour(6).nearMinute(0).create();
  ScriptApp.newTrigger('finalizeCycleEodSafe').timeBased().everyDays(1).atHour(6).nearMinute(30).create();
  Logger.log('Installed cycle triggers: generate ~06:00, finalize EOD ~06:30 (both before 0800).');
}
// Manual validation from the editor: generate today's list and dump it.
function testCycleCount() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('generateTodayList: ' + JSON.stringify(generateTodayList(ss, '', true)));
  Logger.log('cycleToday: ' + JSON.stringify(readCycleToday(ss)));
  Logger.log('errorRate snapshot: ' + JSON.stringify(snapshotErrorRate_(ss)));
}
// Diagnostic: shows whether cost-weighting is active and which BAQ_Data column it found.
// Run from the editor after refreshEpicorData() (which pulls the latest BAQ columns).
function testCostColumn() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TARGET_SHEET);
  if (!sheet) { Logger.log('No BAQ_Data sheet — run refreshEpicorData() first.'); return; }
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('BAQ_Data headers: ' + JSON.stringify(headers));
  Logger.log('cost_column setting: "' + readCycleSettings(ss).costColumn + '"');
  var ci = readEpicorCost_(ss);
  Logger.log('COST MODE (column detected?): ' + ci.mode);
  var keys = Object.keys(ci.map);
  Logger.log('cost map size: ' + keys.length + '  samples: ' + JSON.stringify(keys.slice(0, 6).map(function(k) { return k + '=' + ci.map[k]; })));
  var ti = readEpicorTypeMap_(ss);
  Logger.log('TYPE column detected: ' + ti.mode + (ti.mode ? ' (' + ti.column + ')' : '') + '  | exclude_part_types: ' + JSON.stringify(readCycleSettings(ss).excludePartTypes));
  if (ti.mode) { var tks = Object.keys(ti.map); Logger.log('type samples: ' + JSON.stringify(tks.slice(0, 8).map(function(k) { return k + '=' + ti.map[k]; }))); }
  var er = computeInventoryErrorRate_(ss);
  Logger.log('error rate now: ' + (Math.round(er.rate * 10000) / 100) + '%  | sumAbsDrift=' + er.sumAbsDrift + '  sumEpicor=' + er.sumEpicor + '  (these are $ when cost mode is true, units when false)');
}

// Cycle Count Log → objects (most recent first, capped at `limit`). For stats page.
function readCycleLog(ss, limit) {
  var sheet = ss.getSheetByName('Cycle Count Log');
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    if (!String(rows[i][0] || '').trim()) continue;
    out.push({
      sessionId: String(rows[i][0]).trim(), date: fmtDateCell_(rows[i][1]), partNum: String(rows[i][2]).trim(), partName: String(rows[i][3]).trim(),
      firstChecker: String(rows[i][4]).trim(), secondChecker: String(rows[i][5]).trim(),
      systemTotal: rows[i][6], countedTotal: rows[i][7], variance: rows[i][8],
      warehouseSys: rows[i][9], warehouseCounted: rows[i][10], lineSys: rows[i][11], lineCounted: rows[i][12],
      epicorOnHand: rows[i][13], agreed: String(rows[i][14]).trim(), confirmedAt: fmtDtCell_(rows[i][15])
    });
  }
  out.reverse();
  if (limit && out.length > limit) out = out.slice(0, limit);
  return out;
}
// Cycle Count EOD → objects (most recent first), optionally filtered to one Date Counted.
function readCycleEod(ss, dateFilter) {
  var sheet = ss.getSheetByName('Cycle Count EOD');
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  var df = String(dateFilter || '').trim();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    if (!String(rows[i][1] || '').trim()) continue;
    if (df && fmtDateCell_(rows[i][0]) !== df) continue;
    out.push({
      dateCounted: fmtDateCell_(rows[i][0]), partNum: String(rows[i][1]).trim(), countedTotal: rows[i][2], countTime: fmtDtCell_(rows[i][3]),
      postCountAdjustment: rows[i][4], eodTotal: rows[i][5], currentEpicorOnHand: rows[i][6], eodVsEpicor: rows[i][7],
      finalized: String(rows[i][8]).trim(), enteredInEpicor: String(rows[i][9]).trim()
    });
  }
  out.reverse();
  return out;
}
// Cycle Count Detail rows for one session — for the confirm screen (1st vs 2nd).
function readCycleDetail(ss, sessionId) {
  var sheet = ss.getSheetByName('Cycle Count Detail');
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  var sid = String(sessionId || '').trim();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() !== sid) continue;
    out.push({
      placeType: String(rows[i][2]).trim(), place: String(rows[i][3]).trim(),
      systemQty: rows[i][4], firstCount: rows[i][5], secondCount: rows[i][6],
      newQtyWritten: rows[i][7], action: String(rows[i][8] || '').trim()
    });
  }
  return out;
}

// ── Inventory error rate ─────────────────────────────────────
// Overall warehouse accuracy = Σ |（warehouse + line) − Epicor| ÷ Σ Epicor across
// ALL Epicor parts. Lower is better. Reuses the candidate scorer (overage per part).
function computeInventoryErrorRate_(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var cands = cycleScoredCandidates_(ss);
  var sumAbs = 0, sumEpi = 0;   // dollar-weighted when a cost column exists, else unit-weighted
  for (var i = 0; i < cands.length; i++) {
    var cost = cands[i].cost;
    sumAbs += Math.abs(cands[i].overage) * cost;
    var e = parseFloat(cands[i].epicor); if (!isNaN(e)) sumEpi += e * cost;
  }
  return {
    rate: sumEpi > 0 ? (sumAbs / sumEpi) : 0,
    sumAbsDrift: Math.round(sumAbs * 100) / 100,
    sumEpicor: Math.round(sumEpi * 100) / 100,
    parts: cands.length
  };
}
// Rank parts by their contribution to the error rate (|overage|), to find the few
// parts driving the percentage — typically items in Epicor but not yet tracked.
function cycleDiscrepancyReport_(ss, limit) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var cands = cycleScoredCandidates_(ss);
  var costMode = readEpicorCost_(ss).mode;
  var sumAbs = 0, sumEpi = 0, untrackedAbs = 0;   // dollar-weighted when costMode
  for (var i = 0; i < cands.length; i++) {
    var dollar = Math.abs(cands[i].overage) * cands[i].cost;
    sumAbs += dollar;
    var e = parseFloat(cands[i].epicor); if (!isNaN(e)) sumEpi += e * cands[i].cost;
    if ((cands[i].wh + cands[i].line) === 0) untrackedAbs += dollar;
  }
  var byAbs = cands.slice().sort(function(a, b) { return (Math.abs(b.overage) * b.cost) - (Math.abs(a.overage) * a.cost); });
  var n = limit || 25, cum = 0, top = [];
  for (var j = 0; j < Math.min(n, byAbs.length); j++) {
    var c = byAbs[j], a = Math.abs(c.overage), dollar2 = a * c.cost;
    var contrib = sumAbs > 0 ? dollar2 / sumAbs : 0; cum += contrib;
    top.push({
      partNum: c.partNum, partName: c.partName, epicor: c.epicor, warehouse: c.wh, line: c.line,
      tracked: c.wh + c.line, overage: round2_(c.overage), absOverage: round2_(a),
      cost: round2_(c.cost), dollarImpact: round2_(dollar2),
      contributionPct: Math.round(contrib * 10000) / 100, cumulativePct: Math.round(cum * 10000) / 100,
      untracked: (c.wh + c.line) === 0
    });
  }
  return {
    rate: sumEpi > 0 ? sumAbs / sumEpi : 0,
    sumAbsDrift: Math.round(sumAbs * 100) / 100, sumEpicor: Math.round(sumEpi * 100) / 100,
    parts: cands.length, untrackedSharePct: sumAbs > 0 ? Math.round(untrackedAbs / sumAbs * 10000) / 100 : 0,
    costMode: costMode, drivers: top
  };
}
// Leaderboard: error corrected per checker = Σ |variance| × unit cost, from the Cycle Count
// Log. Returns ranked lists for today / last 7 days / all-time.
function cycleLeaderboard_(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = readCycleLog(ss, 5000);
  var costInfo = readEpicorCost_(ss);
  var today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  var weekAgo = Utilities.formatDate(new Date(Date.now() - 6 * 86400000), 'America/Chicago', 'yyyy-MM-dd');
  var all = {}, week = {}, day = {};
  function add(b, name, v, dollars) { if (!b[name]) b[name] = { name: name, counts: 0, units: 0, dollars: 0 }; b[name].counts++; b[name].units += v; b[name].dollars += dollars; }
  for (var i = 0; i < log.length; i++) {
    var name = String(log[i].firstChecker || '').trim(); if (!name) continue;
    var v = Math.abs(parseFloat(log[i].variance) || 0);
    var cost = costInfo.mode ? (costInfo.map[String(log[i].partNum).toLowerCase()] || 0) : 1;
    var dollars = v * cost;
    var iso = confirmedToIso_(log[i].confirmedAt);
    add(all, name, v, dollars);
    if (iso && iso >= weekAgo) add(week, name, v, dollars);
    if (iso && iso === today) add(day, name, v, dollars);
  }
  function rank(b) { return Object.keys(b).map(function(k) { var x = b[k]; return { name: x.name, counts: x.counts, units: Math.round(x.units * 100) / 100, dollars: Math.round(x.dollars * 100) / 100 }; }).sort(function(p, q) { return (q.dollars - p.dollars) || (q.units - p.units); }); }
  return { all: rank(all), week: rank(week), today: rank(day), costMode: costInfo.mode };
}
function getOrCreateErrorRateSheet(ss) {
  var sheet = ss.getSheetByName('Inventory Error Rate');
  if (!sheet) {
    sheet = ss.insertSheet('Inventory Error Rate');
    sheet.appendRow(['Date', 'Error Rate %', 'Sum |Drift|', 'Sum Epicor', 'Parts', 'Logged At']);
    var h = sheet.getRange(1, 1, 1, 6); h.setFontWeight('bold'); h.setBackground('#1a1e24'); h.setFontColor('#ffffff'); sheet.setFrozenRows(1);
  }
  return sheet;
}
// One row per day (overwrites today's if re-run). Called from the 6am trigger.
function snapshotErrorRate_(ss) {
  var m = computeInventoryErrorRate_(ss);
  var dayDisplay = Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy');
  var nowStr = Utilities.formatDate(new Date(), 'America/Chicago', 'MM/dd/yyyy HH:mm:ss');
  var ratePct = Math.round(m.rate * 10000) / 100;
  var sheet = getOrCreateErrorRateSheet(ss);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (fmtDateCell_(rows[i][0]) === dayDisplay) {
      sheet.getRange(i + 1, 2, 1, 5).setValues([[ratePct, m.sumAbsDrift, m.sumEpicor, m.parts, nowStr]]);
      return { date: dayDisplay, ratePct: ratePct, sumAbsDrift: m.sumAbsDrift, sumEpicor: m.sumEpicor, parts: m.parts };
    }
  }
  sheet.appendRow([dayDisplay, ratePct, m.sumAbsDrift, m.sumEpicor, m.parts, nowStr]);
  return { date: dayDisplay, ratePct: ratePct, sumAbsDrift: m.sumAbsDrift, sumEpicor: m.sumEpicor, parts: m.parts };
}
function readErrorRateHistory(ss, limit) {
  var sheet = ss.getSheetByName('Inventory Error Rate');
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    if (!String(rows[i][0]).trim()) continue;
    out.push({ date: fmtDateCell_(rows[i][0]), rate: parseFloat(rows[i][1]) || 0, sumAbsDrift: rows[i][2], sumEpicor: rows[i][3], parts: rows[i][4] });
  }
  if (limit && out.length > limit) out = out.slice(out.length - limit);
  return out;
}

// ── Date cell helpers ────────────────────────────────────────
// Sheets auto-converts "MM/dd/yyyy" strings to Date values on write, so cells
// read back as Date objects (String() then yields a full locale date-time). These
// render them cleanly AND tolerate plain strings — used for display and for every
// date-equality check (the EOD finalizer / "today list exists?" match on these).
function fmtDateCell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Chicago', 'MM/dd/yyyy');
  return String(v == null ? '' : v).trim();
}
function fmtDtCell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Chicago', 'MM/dd/yyyy HH:mm:ss');
  return String(v == null ? '' : v).trim();
}
// One-time (run from the editor): set clean date formats on the cycle tabs so the
// SHEET also displays plain dates instead of full date-time values.
function normalizeCycleDateFormats_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var D = 'MM/dd/yyyy', DT = 'MM/dd/yyyy HH:mm:ss';
  var jobs = [['Cycle Count Today', { 1: D, 13: DT }], ['Cycle Count Log', { 2: D, 16: DT }],
    ['Cycle Count EOD', { 1: D, 4: DT }], ['Inventory Error Rate', { 1: D, 6: DT }], ['Cycle Count Skips', { 1: D }]];
  for (var k = 0; k < jobs.length; k++) {
    var sh = ss.getSheetByName(jobs[k][0]); if (!sh || sh.getLastRow() < 2) continue;
    var cols = jobs[k][1];
    for (var col in cols) sh.getRange(2, parseInt(col), sh.getLastRow() - 1, 1).setNumberFormat(cols[col]);
  }
  Logger.log('normalizeCycleDateFormats_ done');
}