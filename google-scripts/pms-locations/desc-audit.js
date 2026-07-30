// ── ONE-TIME: Part description audit vs Epicor ────────────────────────────────
// TEMPORARY FILE — delete after use (see workflow at the bottom).
//
// Compares every PMS-side part descriptor against Epicor's Part_PartDescription
// (already synced hourly into the BAQ_Data tab) and reports the drift — the
// "ghost descriptions" that crept in because names are captured at stow/pick
// time from whatever the client sent, not re-checked against Epicor.
//
// Descriptor columns audited:
//   Locations       col T (Part Name)
//   Line Inventory  col C (Part Name)
//   BOM             col D (description)
// Uline Boxes is intentionally SKIPPED — those are manual non-Epicor parts.
//
// 1) auditDescriptions()  — READ-ONLY. Writes a "Description Audit" tab:
//      Sheet | Part # | PMS Name | Epicor Description | Issue | Rows
//    Issues: "Different text" (real ghost), "Part not in Epicor or Uline",
//    "Epicor description blank", "Blank in PMS", "Case/spacing only",
//    "Different from Uline desc". Uline parts are compared against the
//    Uline Boxes Description column instead of Epicor.
// 2) fixDescriptions()    — run ONLY after reviewing the audit tab. Overwrites
//    every mismatched descriptor with the exact Epicor (or Uline) description
//    (batched, one column write per sheet, LockService-guarded). Parts found
//    nowhere and blank-desc rows are left untouched — those need a human call.
// 3) auditPartNumbers()   — READ-ONLY. Writes a "Part Number Audit" tab:
//    every part number that is in NEITHER BAQ_Data (Epicor) NOR the Uline
//    Boxes tab, plus case-mismatches vs Epicor. Includes a closest-match
//    suggestion (edit distance ≤ 2) so typos are easy to spot. There is
//    deliberately NO auto-fix — a wrong part number on rows with real qty
//    is a human decision: correct the sheet, or add the part to Uline Boxes.

// BAQ_Data → { partNumLower: { partNum, desc } }
function descAuditEpicorMap_(ss) {
  var sheet = ss.getSheetByName('BAQ_Data');
  if (!sheet) throw new Error('BAQ_Data sheet not found — run refreshEpicorData first');
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) throw new Error('BAQ_Data is empty — run refreshEpicorData first');
  var pnC = -1, dC = -1;
  for (var i = 0; i < rows[0].length; i++) {
    var h = String(rows[0][i] || '').trim();
    if (h === 'Part_PartNum') pnC = i;
    if (h === 'Part_PartDescription') dC = i;
  }
  if (pnC === -1 || dC === -1) throw new Error('BAQ_Data missing Part_PartNum / Part_PartDescription columns');
  var map = {};
  for (var r = 1; r < rows.length; r++) {
    var pn = String(rows[r][pnC] || '').trim();
    if (!pn) continue;
    map[pn.toLowerCase()] = { partNum: pn, desc: String(rows[r][dC] || '').trim() };
  }
  return map;
}

// Uline Boxes tab → { partNumLower: { partNum, desc } } (manual non-Epicor parts).
function descAuditUlineMap_(ss) {
  var sheet = ss.getSheetByName('Uline Boxes');
  var map = {};
  if (!sheet) return map;
  var rows = sheet.getDataRange().getValues();
  for (var r = 1; r < rows.length; r++) {
    var pn = String(rows[r][0] || '').trim();          // A = Part #
    if (!pn) continue;
    map[pn.toLowerCase()] = { partNum: pn, desc: String(rows[r][1] || '').trim() };  // B = Description
  }
  return map;
}

// The three descriptor sources: sheet name + 0-based part / name columns.
var DESC_AUDIT_SOURCES = [
  { sheet: 'Locations',      partCol: 18, nameCol: 19 },  // S / T
  { sheet: 'Line Inventory', partCol: 1,  nameCol: 2  },  // B / C
  { sheet: 'BOM',            partCol: 2,  nameCol: 3  },  // C / D
];

function descAuditNorm_(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

function descAuditClassify_(pmsName, epicor, uline) {
  if (!epicor && uline) {
    // Manual Uline part — its truth is the Uline Boxes Description column.
    if (pmsName === uline.desc) return null;
    if (!uline.desc || !pmsName) return null;          // nothing solid to compare — leave alone
    if (descAuditNorm_(pmsName) === descAuditNorm_(uline.desc)) return 'Case/spacing only';
    return 'Different from Uline desc';
  }
  if (!epicor) return 'Part not in Epicor or Uline';
  if (pmsName === epicor.desc) return null;                       // exact — fine
  if (!epicor.desc) return 'Epicor description blank';
  if (!pmsName) return 'Blank in PMS';
  if (descAuditNorm_(pmsName) === descAuditNorm_(epicor.desc)) return 'Case/spacing only';
  return 'Different text';
}

function auditDescriptions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var epicorMap = descAuditEpicorMap_(ss);
  var ulineMap = descAuditUlineMap_(ss);
  // key: sheet|pnLower|pmsName → { ...display fields, rows: n }
  var findings = {}, checked = 0;
  DESC_AUDIT_SOURCES.forEach(function (src) {
    var sheet = ss.getSheetByName(src.sheet);
    if (!sheet) return;
    var rows = sheet.getDataRange().getValues();
    for (var r = 1; r < rows.length; r++) {
      var pn = String(rows[r][src.partCol] || '').trim();
      if (!pn || pn === 'Hardware') continue;
      checked++;
      var pmsName = String(rows[r][src.nameCol] || '').trim();
      var epicor = epicorMap[pn.toLowerCase()];
      var uline = ulineMap[pn.toLowerCase()];
      var issue = descAuditClassify_(pmsName, epicor, uline);
      if (!issue) continue;
      var truth = epicor ? epicor.desc : (uline ? uline.desc : '');
      var k = src.sheet + '|' + pn.toLowerCase() + '|' + pmsName;
      if (!findings[k]) {
        findings[k] = { sheet: src.sheet, partNum: pn, pmsName: pmsName,
          epicorDesc: truth, issue: issue, rows: 0 };
      }
      findings[k].rows++;
    }
  });
  var order = { 'Different text': 0, 'Different from Uline desc': 1, 'Part not in Epicor or Uline': 2,
    'Epicor description blank': 3, 'Blank in PMS': 4, 'Case/spacing only': 5 };
  var list = Object.keys(findings).map(function (k) { return findings[k]; })
    .sort(function (a, b) {
      return (order[a.issue] - order[b.issue]) || a.sheet.localeCompare(b.sheet) || a.partNum.localeCompare(b.partNum);
    });

  var out = ss.getSheetByName('Description Audit') || ss.insertSheet('Description Audit');
  out.clear();
  out.appendRow(['Sheet', 'Part #', 'PMS Name', 'Epicor / Uline Description', 'Issue', 'Rows']);
  var h = out.getRange(1, 1, 1, 6);
  h.setFontWeight('bold'); h.setBackground('#1a1e24'); h.setFontColor('#ffffff');
  out.setFrozenRows(1);
  out.setColumnWidth(1, 110); out.setColumnWidth(2, 140); out.setColumnWidth(3, 300);
  out.setColumnWidth(4, 300); out.setColumnWidth(5, 170); out.setColumnWidth(6, 60);
  if (list.length) {
    out.getRange(2, 1, list.length, 6).setValues(list.map(function (f) {
      return [f.sheet, f.partNum, f.pmsName, f.epicorDesc, f.issue, f.rows];
    }));
  }
  var msg = 'auditDescriptions: checked ' + checked + ' descriptor rows across ' +
    DESC_AUDIT_SOURCES.length + ' sheets → ' + list.length + ' unique finding(s). ' +
    'See the "Description Audit" tab.';
  Logger.log(msg);
  return msg;
}

// Overwrite mismatched descriptors with the exact Epicor description (or the
// Uline Boxes description for manual Uline parts).
// Fixes: Different text, Different from Uline desc, Case/spacing only, Blank in PMS.
// Leaves alone: Part not in Epicor or Uline, blank truth descriptions.
function fixDescriptions() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var epicorMap = descAuditEpicorMap_(ss);
    var ulineMap = descAuditUlineMap_(ss);
    var totalFixed = 0;
    DESC_AUDIT_SOURCES.forEach(function (src) {
      var sheet = ss.getSheetByName(src.sheet);
      if (!sheet) return;
      var rows = sheet.getDataRange().getValues();
      if (rows.length < 2) return;
      // Batched single-column write: read col, mutate, write back once.
      var colVals = sheet.getRange(2, src.nameCol + 1, rows.length - 1, 1).getValues();
      var fixed = 0;
      for (var r = 1; r < rows.length; r++) {
        var pn = String(rows[r][src.partCol] || '').trim();
        if (!pn || pn === 'Hardware') continue;
        var epicor = epicorMap[pn.toLowerCase()];
        var uline = ulineMap[pn.toLowerCase()];
        var truth = (epicor && epicor.desc) || (!epicor && uline && uline.desc) || '';
        if (!truth) continue;                    // human-review cases — untouched
        var pmsName = String(rows[r][src.nameCol] || '').trim();
        if (pmsName === truth) continue;
        colVals[r - 1][0] = truth;
        fixed++;
      }
      if (fixed) {
        sheet.getRange(2, src.nameCol + 1, rows.length - 1, 1).setValues(colVals);
        totalFixed += fixed;
        Logger.log('fixDescriptions: ' + src.sheet + ' — ' + fixed + ' row(s) updated');
      }
    });
    var msg = 'fixDescriptions: ' + totalFixed + ' descriptor row(s) overwritten with Epicor descriptions. ' +
      'Re-run auditDescriptions() to confirm — only human-review issues should remain.';
    Logger.log(msg);
    return msg;
  } finally {
    lock.releaseLock();
  }
}

// ── Part number audit: everything must be an Epicor part OR a Uline box ──────
// Edit distance (Levenshtein, capped) for closest-match typo suggestions.
function descAuditEditDist_(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  var prev = [], cur = [];
  for (var j = 0; j <= b.length; j++) prev[j] = j;
  for (var i = 1; i <= a.length; i++) {
    cur[0] = i;
    var rowMin = i;
    for (var k = 1; k <= b.length; k++) {
      cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
      if (cur[k] < rowMin) rowMin = cur[k];
    }
    if (rowMin > max) return max + 1;   // early out — already too far
    var t = prev; prev = cur; cur = t;
  }
  return prev[b.length];
}
function descAuditClosest_(pnLower, allParts) {
  var best = null, bestD = 3;           // suggest only within distance 2
  for (var i = 0; i < allParts.length; i++) {
    var d = descAuditEditDist_(pnLower, allParts[i].toLowerCase(), 2);
    if (d < bestD) { bestD = d; best = allParts[i]; if (d === 1) break; }
  }
  return best ? (best + ' (distance ' + bestD + ')') : '';
}

function auditPartNumbers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var epicorMap = descAuditEpicorMap_(ss);
  var ulineMap = descAuditUlineMap_(ss);
  var allParts = [];
  Object.keys(epicorMap).forEach(function (k) { allParts.push(epicorMap[k].partNum); });
  Object.keys(ulineMap).forEach(function (k) { allParts.push(ulineMap[k].partNum); });

  var findings = {}, checked = 0;
  DESC_AUDIT_SOURCES.forEach(function (src) {
    var sheet = ss.getSheetByName(src.sheet);
    if (!sheet) return;
    var rows = sheet.getDataRange().getValues();
    for (var r = 1; r < rows.length; r++) {
      var pn = String(rows[r][src.partCol] || '').trim();
      if (!pn || pn === 'Hardware') continue;
      checked++;
      var key = pn.toLowerCase();
      var epicor = epicorMap[key], uline = ulineMap[key];
      var issue = null, expected = '';
      if (!epicor && !uline) {
        issue = 'Not in Epicor or Uline';
      } else if (epicor && epicor.partNum !== pn) {
        issue = 'Case differs from Epicor'; expected = epicor.partNum;
      } else if (!epicor && uline && uline.partNum !== pn) {
        issue = 'Case differs from Uline'; expected = uline.partNum;
      }
      if (!issue) continue;
      var k = src.sheet + '|' + pn;
      if (!findings[k]) {
        findings[k] = { sheet: src.sheet, partNum: pn,
          pmsName: String(rows[r][src.nameCol] || '').trim(),
          issue: issue, expected: expected, rows: 0 };
      }
      findings[k].rows++;
    }
  });

  var list = Object.keys(findings).map(function (k) { return findings[k]; })
    .sort(function (a, b) {
      var oa = a.issue === 'Not in Epicor or Uline' ? 0 : 1;
      var ob = b.issue === 'Not in Epicor or Uline' ? 0 : 1;
      return (oa - ob) || a.sheet.localeCompare(b.sheet) || a.partNum.localeCompare(b.partNum);
    });
  // Closest-match suggestions only for true orphans (the expensive bit).
  list.forEach(function (f) {
    if (f.issue === 'Not in Epicor or Uline') f.expected = descAuditClosest_(f.partNum.toLowerCase(), allParts);
  });

  var out = ss.getSheetByName('Part Number Audit') || ss.insertSheet('Part Number Audit');
  out.clear();
  out.appendRow(['Sheet', 'Part #', 'PMS Name', 'Issue', 'Closest / correct match', 'Rows']);
  var h = out.getRange(1, 1, 1, 6);
  h.setFontWeight('bold'); h.setBackground('#1a1e24'); h.setFontColor('#ffffff');
  out.setFrozenRows(1);
  out.setColumnWidth(1, 110); out.setColumnWidth(2, 150); out.setColumnWidth(3, 300);
  out.setColumnWidth(4, 170); out.setColumnWidth(5, 220); out.setColumnWidth(6, 60);
  if (list.length) {
    out.getRange(2, 1, list.length, 6).setValues(list.map(function (f) {
      return [f.sheet, f.partNum, f.pmsName, f.issue, f.expected, f.rows];
    }));
  }
  var msg = 'auditPartNumbers: checked ' + checked + ' part-number rows → ' + list.length +
    ' unique finding(s). See the "Part Number Audit" tab. No auto-fix on purpose: ' +
    'correct the sheet row, or add the part to Uline Boxes if it\'s a real manual part.';
  Logger.log(msg);
  return msg;
}

// ── Workflow (one-time use) ──────────────────────────────────────────────────
// 1. clasp push (from google-scripts/pms-locations)
// 2. In the Apps Script editor: run auditDescriptions() and auditPartNumbers()
//    → review the "Description Audit" / "Part Number Audit" tabs.
// 3. Fix part numbers BY HAND first (typos → correct part, or add to Uline
//    Boxes), re-run auditPartNumbers() until clean, THEN run fixDescriptions()
//    (a typo'd part can't get the right description until its number is right).
// 4. Re-run auditDescriptions() to confirm.
// 5. Delete this file locally, clasp push again (removes it from the project),
//    and delete both audit tabs when you're done.
