// Apps Script backend for langmuir-tooling.
// Bound to the "Tooling Requests" Google Sheet. Deployed as a Web App;
// tooling/server.js calls this via the SHEETS_URL env var.
//
// Tabs:
//   requests     — one row per request
//   transitions  — append-only audit log of status changes
//   ai_usage     — append-only log of Claude API calls (for the cost badge)
//
// First-time setup: open this script, Run → setup(). Grants permissions
// and creates the three tabs with headers. Idempotent — safe to re-run.

const SHEET_REQUESTS    = 'requests';
const SHEET_TRANSITIONS = 'transitions';
const SHEET_AI_USAGE    = 'ai_usage';

const REQUEST_HEADERS = [
  'id', 'submitted_at', 'submitted_by', 'line', 'description', 'quantity',
  'justification', 'urgency', 'status', 'path', 'vendor_preference',
  'ai_recs_json', 'chosen_rec_idx',
  'purchase_url', 'purchase_price', 'eta', 'tracking_url', 'image_url',
  'photo_url', 'approved_by', 'approved_at', 'last_updated_at', 'notes',
];

const TRANSITION_HEADERS = [
  'tid', 'request_id', 'from_status', 'to_status', 'actor', 'at', 'comment',
];

const USAGE_HEADERS = [
  'usage_id', 'request_id', 'at', 'input_tokens', 'output_tokens',
  'web_searches', 'estimated_cost_usd',
];

const ALLOWED_TRANSITIONS = {
  // awaiting_operator_review is the initial state for new requests. The
  // operator reviews the AI's interpretation (or the link metadata for
  // manual path) and confirms it before the purchaser sees it. This is
  // where misinterpretations get caught.
  awaiting_operator_review: ['requested', 'denied'],
  // requested → ordered is allowed because the queue "Order This" button is
  // one-click: approve + order in a single step. The intermediate "approved"
  // state exists for the case where the purchaser wants to approve without
  // committing to a specific vendor link yet.
  requested:       ['approved', 'ordered', 'denied', 'needs_re_search'],
  approved:        ['ordered', 'needs_re_search', 'denied'],
  ordered:         ['delivered'],
  needs_re_search: ['requested', 'denied', 'awaiting_operator_review'],
  denied:          [],
  delivered:       [],
};

// ── Entry points ───────────────────────────────────────────────────────────
function setup() {
  ensureTab_(SHEET_REQUESTS,    REQUEST_HEADERS);
  ensureTab_(SHEET_TRANSITIONS, TRANSITION_HEADERS);
  ensureTab_(SHEET_AI_USAGE,    USAGE_HEADERS);
  return 'Initialized: ' + [SHEET_REQUESTS, SHEET_TRANSITIONS, SHEET_AI_USAGE].join(', ');
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'ping';
  try {
    switch (action) {
      case 'ping':                return json_({ ok: true, sheet: SpreadsheetApp.getActiveSpreadsheet().getName() });
      case 'list_requests':       return json_(listRequests_(e.parameter));
      case 'get_request':         return json_(getRequest_(e.parameter.id));
      case 'usage_current_month': return json_(usageCurrentMonth_());
      default:                    return json_({ error: 'unknown action: ' + action });
    }
  } catch (err) {
    return json_({ error: String(err && err.message || err) });
  }
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); }
  catch (parseErr) { return json_({ error: 'invalid JSON body' }); }

  const action = body.action;
  try {
    switch (action) {
      case 'create_request':     return json_(createRequest_(body));
      case 'save_recs':          return json_(saveRecs_(body));
      case 'transition_request': return json_(transitionRequest_(body));
      case 'log_ai_usage':       return json_(logAiUsage_(body));
      default:                   return json_({ error: 'unknown action: ' + action });
    }
  } catch (err) {
    return json_({ error: String(err && err.message || err) });
  }
}

// ── Handlers ───────────────────────────────────────────────────────────────
function listRequests_(params) {
  params = params || {};
  const sheet = getSheet_(SHEET_REQUESTS);
  const rows = readAll_(sheet, REQUEST_HEADERS);
  const status = params.status;
  const line   = params.line;
  const name   = (params.name || '').toLowerCase();
  const filtered = rows.filter(r => {
    if (status === 'open') {
      if (!['requested', 'approved', 'ordered', 'needs_re_search'].includes(r.status)) return false;
    } else if (status && status !== 'all' && r.status !== status) {
      return false;
    }
    if (line && r.line !== line) return false;
    if (name && !String(r.submitted_by || '').toLowerCase().includes(name)) return false;
    return true;
  });
  filtered.sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));
  return { requests: filtered };
}

function getRequest_(id) {
  if (!id) throw new Error('id required');
  const sheet = getSheet_(SHEET_REQUESTS);
  const rows = readAll_(sheet, REQUEST_HEADERS);
  const found = rows.find(r => r.id === id);
  if (!found) throw new Error('request not found: ' + id);
  return found;
}

function createRequest_(body) {
  // path defaults to 'ai' for backward compatibility. 'manual' means the
  // operator provided a URL; AI-lite extracts product metadata from it.
  const path = body.path === 'manual' ? 'manual' : 'ai';
  // submitted_by, line, quantity are always required. description is
  // required only on the AI path (it's the prompt Claude searches from).
  // purchase_url is required only on the manual path.
  const required = ['submitted_by', 'line', 'quantity'];
  if (path === 'ai')     required.push('description');
  if (path === 'manual') required.push('purchase_url');
  for (const f of required) {
    if (body[f] === undefined || body[f] === null || body[f] === '') {
      throw new Error('missing field: ' + f);
    }
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_(SHEET_REQUESTS);
    const now = new Date().toISOString();
    const id  = 'req_' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
    const row = {
      id: id,
      submitted_at:     now,
      submitted_by:     body.submitted_by,
      line:             body.line,
      description:      body.description,
      quantity:         body.quantity,
      justification:    body.justification || '',
      urgency:          body.urgency || 'routine',
      // New requests start in awaiting_operator_review. They only become
      // visible to the purchaser after the operator confirms via /review.
      status:           'awaiting_operator_review',
      path:             path,
      vendor_preference: body.vendor_preference || '',
      ai_recs_json:     '[]',
      // For manual path the URL goes into purchase_url so the existing
      // chosen-rec rendering picks it up after confirmation.
      purchase_url:     body.purchase_url || '',
      photo_url:        body.photo_url || '',
      last_updated_at:  now,
    };
    appendRow_(sheet, REQUEST_HEADERS, row);
    appendTransition_({
      request_id: id, from_status: '', to_status: 'awaiting_operator_review',
      actor: body.submitted_by, comment: 'submitted via ' + path + ' path',
    });
    return row;
  } finally {
    lock.releaseLock();
  }
}

function saveRecs_(body) {
  if (!body.request_id) throw new Error('request_id required');
  if (!Array.isArray(body.recs)) throw new Error('recs must be an array');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_(SHEET_REQUESTS);
    return updateRow_(sheet, REQUEST_HEADERS, body.request_id, {
      ai_recs_json: JSON.stringify(body.recs),
      last_updated_at: new Date().toISOString(),
    });
  } finally {
    lock.releaseLock();
  }
}

function transitionRequest_(body) {
  if (!body.id)    throw new Error('id required');
  if (!body.to)    throw new Error('to status required');
  if (!body.actor) throw new Error('actor required');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_(SHEET_REQUESTS);
    const existing = readAll_(sheet, REQUEST_HEADERS).find(r => r.id === body.id);
    if (!existing) throw new Error('request not found: ' + body.id);
    const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(body.to)) {
      throw new Error('cannot transition ' + existing.status + ' → ' + body.to);
    }
    const updates = { status: body.to, last_updated_at: new Date().toISOString() };
    // chosen_rec_idx records which rec the actor committed to. Operators
    // set it when confirming (awaiting_operator_review → requested);
    // purchasers can update it on approve/order.
    if (['requested', 'approved', 'ordered'].includes(body.to) && Number.isInteger(body.chosen_rec_idx)) {
      updates.chosen_rec_idx = body.chosen_rec_idx;
    }
    if (body.to === 'approved') {
      updates.approved_by = body.actor;
      updates.approved_at = new Date().toISOString();
    }
    if (body.to === 'ordered') {
      // One-click approve+order (requested → ordered): also stamp approval
      // fields so we know who said yes. If the row was already approved
      // first, don't overwrite the original approver.
      if (!existing.approved_by) {
        updates.approved_by = body.actor;
        updates.approved_at = new Date().toISOString();
      }
      if (body.purchase_url   !== undefined) updates.purchase_url   = body.purchase_url;
      if (body.purchase_price !== undefined) updates.purchase_price = body.purchase_price;
      if (body.eta            !== undefined) updates.eta            = body.eta;
      if (body.tracking_url   !== undefined) updates.tracking_url   = body.tracking_url;
      if (body.image_url      !== undefined) updates.image_url      = body.image_url;
    }
    if (body.notes !== undefined) updates.notes = body.notes;
    const updated = updateRow_(sheet, REQUEST_HEADERS, body.id, updates);
    appendTransition_({
      request_id: body.id, from_status: existing.status, to_status: body.to,
      actor: body.actor, comment: body.comment || '',
    });
    return updated;
  } finally {
    lock.releaseLock();
  }
}

function logAiUsage_(body) {
  if (!body.request_id) throw new Error('request_id required');
  const sheet = getSheet_(SHEET_AI_USAGE);
  const row = {
    usage_id:           'use_' + Utilities.getUuid().replace(/-/g, '').slice(0, 10),
    request_id:         body.request_id,
    at:                 new Date().toISOString(),
    input_tokens:       body.input_tokens  || 0,
    output_tokens:      body.output_tokens || 0,
    web_searches:       body.web_searches  || 0,
    estimated_cost_usd: body.estimated_cost_usd || 0,
  };
  appendRow_(sheet, USAGE_HEADERS, row);
  return row;
}

function usageCurrentMonth_() {
  const sheet = getSheet_(SHEET_AI_USAGE);
  const rows  = readAll_(sheet, USAGE_HEADERS);
  const yyyymm = new Date().toISOString().slice(0, 7);
  let total_usd = 0, request_count = 0;
  for (const r of rows) {
    if (String(r.at).slice(0, 7) === yyyymm) {
      total_usd     += Number(r.estimated_cost_usd) || 0;
      request_count += 1;
    }
  }
  return { total_usd: Math.round(total_usd * 100) / 100, request_count };
}

// ── Sheet plumbing ─────────────────────────────────────────────────────────
function ensureTab_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    let dirty = false;
    for (let i = 0; i < headers.length; i++) {
      if (existing[i] !== headers[i]) { dirty = true; break; }
    }
    if (dirty) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  return sheet;
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    const headers =
      name === SHEET_REQUESTS    ? REQUEST_HEADERS    :
      name === SHEET_TRANSITIONS ? TRANSITION_HEADERS :
      name === SHEET_AI_USAGE    ? USAGE_HEADERS      : null;
    if (!headers) throw new Error('unknown sheet: ' + name);
    sheet = ensureTab_(name, headers);
  }
  return sheet;
}

function readAll_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(rowValues => {
    const obj = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = rowValues[i];
    return obj;
  });
}

function appendRow_(sheet, headers, obj) {
  const row = headers.map(h => (obj[h] === undefined || obj[h] === null) ? '' : obj[h]);
  sheet.appendRow(row);
}

function updateRow_(sheet, headers, id, updates) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('no rows');
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const idx = ids.findIndex(v => v === id);
  if (idx < 0) throw new Error('id not found: ' + id);
  const sheetRow = idx + 2;
  const current  = sheet.getRange(sheetRow, 1, 1, headers.length).getValues()[0];
  const merged   = {};
  for (let i = 0; i < headers.length; i++) merged[headers[i]] = current[i];
  Object.assign(merged, updates);
  sheet.getRange(sheetRow, 1, 1, headers.length).setValues(
    [headers.map(h => (merged[h] === undefined || merged[h] === null) ? '' : merged[h])]
  );
  return merged;
}

function appendTransition_(t) {
  const sheet = getSheet_(SHEET_TRANSITIONS);
  appendRow_(sheet, TRANSITION_HEADERS, {
    tid:         'tx_' + Utilities.getUuid().replace(/-/g, '').slice(0, 10),
    request_id:  t.request_id,
    from_status: t.from_status,
    to_status:   t.to_status,
    actor:       t.actor,
    at:          new Date().toISOString(),
    comment:     t.comment || '',
  });
}

function json_(obj) {
  // Apps Script web apps can't set HTTP status codes from ContentService —
  // everything is 200. Convention: success returns its payload directly;
  // errors return { error: "..." }. Node side checks for `error` key.
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
