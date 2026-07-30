#!/usr/bin/env bash
# One-time (re-runnable) Transaction Log history import for the inventory
# decoupling (Phase 0). Converts the tracking workbook's "Transaction Log"
# tab to JSON and posts it to pms in batches.
#
# Usage (pre-converted JSON — Claude generates these from the tracking xlsx):
#   bash scripts/import-inv-history.sh scripts/inv-history-2026-07-21.json \
#       https://langmuirproduction.up.railway.app
#
# Needs: node ≥18, nothing else.
set -euo pipefail

TMP_JSON="${1:?path to inv-history .json required (see scripts/inv-history-*.json)}"
PMS_URL="${2:?pms base url required (e.g. https://langmuirproduction.up.railway.app)}"

# Post in batches of 200 rows — express.json() on pms caps bodies at 100KB.
node -e '
  const rows = JSON.parse(require("fs").readFileSync(process.argv[1]));
  const base = process.argv[2].replace(/\/+$/, "");
  const BATCH = 200;
  (async () => {
    let inserted = 0, skipped = 0;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      let j;
      for (;;) { // retry loop — the endpoint is rate-limited to 30 req/min
        const r = await fetch(base + "/api/inv/import-history", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batch }),
        });
        const text = await r.text();
        try { j = JSON.parse(text); }
        catch (e) {
          console.error(`batch ${i / BATCH + 1} failed — HTTP ${r.status}, non-JSON response:\n` + text.slice(0, 300));
          process.exit(1);
        }
        if (j.success) break;
        if (/too many requests/i.test(j.error || "")) {
          console.error(`  rate-limited — waiting 30s before retrying batch ${i / BATCH + 1}…`);
          await sleep(30000);
          continue;
        }
        console.error("batch failed:", j.error); process.exit(1);
      }
      inserted += j.inserted; skipped += j.skipped;
      console.error(`batch ${i / BATCH + 1}/${Math.ceil(rows.length / BATCH)}: +${j.inserted} (dup-skipped ${j.skipped})`);
      await sleep(2100); // ~28/min steady-state, safely under the 30/min cap
    }
    console.log(`DONE — inserted ${inserted}, skipped ${skipped} duplicates`);
  })();
' "$TMP_JSON" "$PMS_URL"
