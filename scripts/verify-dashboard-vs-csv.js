#!/usr/bin/env node
/**
 * Verify local API dashboard KPIs match Performance_Overview_Properties.csv (reference values).
 * The backend computes occupancy, budgeted occ, and leased % from MMR + PUD/unit mix (see app.js).
 * This script checks that API output matches the reference CSV (e.g. same-day export from report).
 *
 * Run with API started: cd api && npm run dev
 * Then: node scripts/verify-dashboard-vs-csv.js
 * Or: API_BASE_URL=http://localhost:3000 node scripts/verify-dashboard-vs-csv.js
 *
 * Optional: USE_PERFORMANCE_OVERVIEW_CSV=true makes the API overlay CSV values (for testing).
 * Exits 0 if all CSV properties match; 1 if any mismatch or API/CSV error.
 */
const path = require('path');
const fs = require('fs');

// Load .env from api/ or repo root
for (const p of [
  path.join(__dirname, '..', 'api', '.env'),
  path.join(__dirname, '..', '.env'),
]) {
  if (fs.existsSync(p)) {
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
}

const base = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const COL_PROPERTY = 1;
const COL_ACTUAL_OCC = 3;
const COL_BUDGETED_OCC = 4;
const COL_LEASED_PCT = 8;
const COL_UNITS = 14;

function parseNum(s) {
  const t = (s ?? '').toString().trim();
  if (t === '' || t.toUpperCase() === 'NA') return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function normalizeProp(s) {
  return (s ?? '').toString().trim().toLowerCase();
}

function loadCsv() {
  const csvPath =
    process.env.PERFORMANCE_OVERVIEW_CSV?.trim() ||
    path.join(__dirname, 'Performance_Overview_Properties.csv') ||
    path.join(__dirname, '..', 'scripts', 'Performance_Overview_Properties.csv');
  const p = path.isAbsolute(csvPath) ? csvPath : path.join(__dirname, csvPath);
  const resolved = fs.existsSync(p) ? p : path.join(__dirname, '..', 'scripts', 'Performance_Overview_Properties.csv');
  if (!fs.existsSync(resolved)) {
    console.error('CSV not found. Tried:', resolved);
    process.exit(1);
  }
  const content = fs.readFileSync(resolved, 'utf8');
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    console.error('CSV has no data rows');
    process.exit(1);
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length <= Math.max(COL_PROPERTY, COL_UNITS)) continue;
    const property = parts[COL_PROPERTY]?.trim() ?? '';
    if (!property) continue;
    rows.push({
      property,
      key: normalizeProp(property),
      actualOccPct: parseNum(parts[COL_ACTUAL_OCC]),
      budgetedOccPct: parseNum(parts[COL_BUDGETED_OCC]),
      leasedPct: parseNum(parts[COL_LEASED_PCT]),
      units: parseNum(parts[COL_UNITS]),
    });
  }
  return rows;
}

function findApiKpi(byProperty, csvKey) {
  if (!byProperty || typeof byProperty !== 'object') return null;
  for (const [displayKey, data] of Object.entries(byProperty)) {
    const norm = (displayKey ?? '').toString().trim().replace(/\*/g, '').toLowerCase();
    if (norm === csvKey) return { key: displayKey, data };
  }
  return null;
}

const TOLERANCE_PCT = 0.15; // allow small float variance for percentages
const TOLERANCE_UNITS = 0;   // exact for unit counts (after round)

function eqPct(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return Math.abs(na - nb) <= TOLERANCE_PCT;
}

function eqUnits(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.round(Number(a)) === Math.round(Number(b));
}

async function main() {
  const csvRows = loadCsv();
  console.log('CSV properties:', csvRows.length, csvRows.map((r) => r.property).join(', '));

  const doRebuild = process.argv.includes('--rebuild');
  if (doRebuild) {
    console.log('POST', base + '/api/leasing/rebuild-snapshot');
    const rebuildRes = await fetch(`${base}/api/leasing/rebuild-snapshot`, { method: 'POST', headers: { Accept: 'application/json' } });
    const rebuildBody = await rebuildRes.json().catch(() => ({}));
    if (!rebuildRes.ok) {
      console.error('Rebuild failed:', rebuildRes.status, rebuildBody);
      process.exit(1);
    }
    console.log('Rebuild done. builtAt:', rebuildBody.builtAt ?? '');
  }

  const res = await fetch(`${base}/api/leasing/dashboard`, {
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('API error', res.status, body);
    process.exit(1);
  }
  const dashboard = body.dashboard || body;
  const kpis = dashboard.kpis || {};
  const byProperty = kpis.byProperty || {};
  console.log('API byProperty keys:', Object.keys(byProperty).length, Object.keys(byProperty).slice(0, 10).join(', '), '...');

  let failed = 0;
  for (const row of csvRows) {
    const found = findApiKpi(byProperty, row.key);
    if (!found) {
      console.log(`\n${row.property}: MISSING in API byProperty`);
      failed++;
      continue;
    }
    const k = found.data;
    const apiLeasedPct = k.totalUnits > 0 && k.leased != null ? (k.leased / k.totalUnits) * 100 : null;
    const occOk = eqPct(k.occupancyPct, row.actualOccPct);
    const budgetOk = row.budgetedOccPct == null || eqPct(k.budgetedOccupancyPct, row.budgetedOccPct);
    const leasedOk = eqPct(apiLeasedPct, row.leasedPct);
    const unitsOk = eqUnits(k.totalUnits, row.units);

    if (!occOk || !budgetOk || !leasedOk || !unitsOk) {
      console.log(`\n${row.property}: MISMATCH`);
      if (!unitsOk) console.log(`  totalUnits: API ${k.totalUnits} vs CSV ${row.units}`);
      if (!occOk) console.log(`  occupancyPct: API ${k.occupancyPct} vs CSV ${row.actualOccPct}`);
      if (!budgetOk) console.log(`  budgetedOccupancyPct: API ${k.budgetedOccupancyPct} vs CSV ${row.budgetedOccPct}`);
      if (!leasedOk) console.log(`  leased%: API ${apiLeasedPct != null ? apiLeasedPct.toFixed(1) : '—'} vs CSV ${row.leasedPct}`);
      failed++;
    } else {
      console.log(`\n${row.property}: OK (occ ${k.occupancyPct}%, leased ${apiLeasedPct != null ? apiLeasedPct.toFixed(1) : '—'}%, units ${k.totalUnits})`);
    }
  }

  if (failed > 0) {
    console.log('\n' + failed + ' property(ies) did not match CSV. Fix overrides or CSV path.');
    process.exit(1);
  }
  console.log('\nAll', csvRows.length, 'properties match CSV.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
