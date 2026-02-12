#!/usr/bin/env node
/**
 * Verify that MMR table has budgeted occupancy data (columns not all NULL).
 * Exits 0 if BudgetedOccupancyCurrentMonth and BudgetedOccupancyPercentCurrentMonth are populated; 1 otherwise.
 *
 * Usage: node scripts/verify-mmr-budgeted-occupancy.js
 * Env: API_BASE_URL (default http://localhost:3000)
 */
const path = require('path');
const fs = require('fs');

for (const p of [
  path.join(__dirname, '..', 'api', '.env'),
  path.join(__dirname, '..', '.env'),
]) {
  if (!fs.existsSync(p)) continue;
  const content = fs.readFileSync(p, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

const base = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const BUDGETED_OCC_COLS = ['BudgetedOccupancyCurrentMonth', 'BudgetedOccupancyPercentCurrentMonth'];

async function main() {
  const res = await fetch(`${base}/api/leasing/sync-health`);
  if (!res.ok) {
    console.error('sync-health failed:', res.status);
    process.exit(1);
  }
  const body = await res.json().catch(() => ({}));
  const allNull = body.tables?.MMRData ?? [];
  const missing = BUDGETED_OCC_COLS.filter((c) => allNull.includes(c));
  if (missing.length) {
    console.error('MMR budgeted occupancy columns still all NULL:', missing.join(', '));
    process.exit(1);
  }
  console.log('OK: MMR has budgeted occupancy data (no longer all NULL for', BUDGETED_OCC_COLS.join(', ') + ')');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
