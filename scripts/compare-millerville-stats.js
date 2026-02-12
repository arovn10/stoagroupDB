#!/usr/bin/env node
/**
 * Fetch leasing dashboard and compare Millerville (The Waters at Millerville) stats.
 * Dashboard values are calculated from the database only (PUD, leasing, MMR, etc.).
 * Performance_Overview_Properties.csv is for reference only — the API never uses it for display.
 *
 * Usage (from repo root):
 *   node scripts/compare-millerville-stats.js           # use cached snapshot
 *   node scripts/compare-millerville-stats.js --rebuild  # POST rebuild then GET dashboard
 *
 * To test backend logic locally:
 *   1. Start API: cd api && npm run dev
 *   2. API_BASE_URL=http://localhost:3000 node scripts/compare-millerville-stats.js [--rebuild]
 *
 * To log all units and their status per property (for debugging occupancy):
 *   DEBUG_LEASING_UNITS=1 (API) or window.__LV_DEBUG_UNITS__ = true (front-end overview render).
 *
 * Env: API_BASE_URL (default from .env), LEASING_SYNC_WEBHOOK_SECRET if needed.
 */
const path = require('path');
const fs = require('fs');

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
const secret = process.env.LEASING_SYNC_SECRET || process.env.LEASING_SYNC_WEBHOOK_SECRET || '';
const headers = { 'Content-Type': 'application/json' };
if (secret) headers['X-Sync-Secret'] = secret;

// Millerville 2/12: expected values from DB-only calculation (occupancy, leased, velocity, etc.).
const TARGET = {
  units: 295,
  totalUnits: 295,
  occupancyPct: 90.2,
  occupied: 266,       // 90.2% of 295
  leased: 259,         // 87.8% of 295
  leasedPct: 87.8,
  availableUnits: 36,  // 295 - 259
  leases7d: 2,         // 1 new + 1 renewal
  leases28d: 15,       // 8 new + 7 renewal
  newLeases7d: 1,
  newLeases28d: 8,
  renewal7d: 1,
  renewal28d: 7,
  projectedOccupancy4WeeksPct: 89.2,
  leasesNeeded: 36,   // available units
  sustainableCapacityPct: 96.0,
  averageRent: 1487,
};

function findMillervilleRow(rows) {
  if (!Array.isArray(rows)) return null;
  return rows.find((r) => {
    const p = (r.Property ?? r.property ?? '').toString();
    return /millerville/i.test(p);
  }) || null;
}

function findMillervilleKpis(kpis, rowProperty) {
  if (!kpis || typeof kpis !== 'object') return { kpi: null, key: null };
  const byProperty = kpis.byProperty || {};
  const keys = Object.keys(byProperty).filter((k) => /millerville/i.test(k));
  // Prefer key that matches the leasing row Property (e.g. "The Waters at Millerville")
  const exact = rowProperty && keys.find((k) => k.trim() === String(rowProperty).trim());
  const key = exact || keys[0] || null;
  return { kpi: key ? byProperty[key] : null, key, allKeys: keys };
}

function compare(name, actual, expected, formatter = (x) => x) {
  const a = actual == null ? '—' : formatter(actual);
  const e = formatter(expected);
  const ok = actual != null && expected != null && Math.abs(Number(actual) - Number(expected)) < 0.01;
  const status = ok ? '✓' : (actual == null ? '?' : '✗');
  console.log(`  ${name}: ${a} (expected ${e}) ${status}`);
  return ok;
}

async function main() {
  const doRebuild = process.argv.includes('--rebuild');
  if (doRebuild) {
    console.log('POST', base + '/api/leasing/rebuild-snapshot');
    const rebuildRes = await fetch(`${base}/api/leasing/rebuild-snapshot`, { method: 'POST', headers });
    const rebuildBody = await rebuildRes.json().catch(() => ({}));
    if (!rebuildRes.ok) {
      console.error('Rebuild failed:', rebuildRes.status, rebuildBody);
      process.exit(1);
    }
    console.log('Rebuild done. builtAt:', rebuildBody.builtAt ?? '');
  }

  console.log('GET', base + '/api/leasing/dashboard');
  const res = await fetch(`${base}/api/leasing/dashboard`, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Dashboard failed:', res.status, body);
    process.exit(1);
  }
  const dashboard = body.dashboard || body;
  const rows = dashboard.rows || [];
  const kpis = dashboard.kpis || {};

  const row = findMillervilleRow(rows);
  const rowProperty = row ? (row.Property ?? row.property) : null;
  const { kpi, key: kpiKey, allKeys } = findMillervilleKpis(kpis, rowProperty);
  if (allKeys.length > 1) console.log('  (byProperty keys containing "millerville":', allKeys.join(', '), ')');

  const availBreakdown = dashboard.portfolioAvailableBreakdown || [];
  const occBreakdown = dashboard.portfolioOccupancyBreakdown || [];
  const millervilleAvail = availBreakdown.find((b) => /millerville/i.test(b.property || ''));
  const millervilleOcc = occBreakdown.find((b) => /millerville/i.test(b.property || ''));

  // Effective row display: prefer kpis.byProperty when present (UI uses kpis as source of truth)
  const effectiveLeasesNeeded = kpi?.available != null ? kpi.available : (row?.LeasesNeeded ?? row?.leasesNeeded);
  const effective7d = kpi?.leases7d != null ? kpi.leases7d : (row?.['7DayLeasingVelocity'] ?? row?.LeasingVelocity7Day);
  const effective28d = kpi?.leases28d != null ? kpi.leases28d : (row?.['28DayLeasingVelocity'] ?? row?.LeasingVelocity28Day);

  console.log('\n--- Millerville: row (leasing) ---');
  if (!row) {
    console.log('  No leasing row found for Millerville. Properties in rows:', rows.map((r) => r.Property || r.property).slice(0, 5).join(', '), '...');
  } else {
    const units = row.Units ?? row.units ?? null;
    console.log('  Property:', row.Property ?? row.property);
    compare('Units', units, TARGET.units);
    if (TARGET.leasesNeeded != null) compare('LeasesNeeded (effective)', effectiveLeasesNeeded, TARGET.leasesNeeded);
    if (TARGET.leases7d != null) compare('7DayLeasingVelocity (effective)', effective7d, TARGET.leases7d);
    if (TARGET.leases28d != null) compare('28DayLeasingVelocity (effective)', effective28d, TARGET.leases28d);
  }

  console.log('\n--- Millerville: kpis.byProperty ---');
  if (!kpi) {
    console.log('  No kpis.byProperty entry for Millerville. Keys:', Object.keys(kpis.byProperty || {}).slice(0, 15).join(', '), '...');
  } else {
    if (kpiKey) console.log('  (key:', kpiKey, ')');
    const occPct = kpi.occupancyPct ?? null;
    const tot = kpi.totalUnits ?? null;
    const occ = kpi.occupied ?? null;
    const leas = kpi.leased ?? null;
    const av = kpi.available ?? null;
    const leasedPct = tot > 0 && leas != null ? (leas / tot) * 100 : null;
    compare('totalUnits', tot, TARGET.totalUnits);
    compare('occupancyPct', occPct, TARGET.occupancyPct, (x) => (typeof x === 'number' ? x.toFixed(1) : x) + '%');
    compare('leased (count)', leas, TARGET.leased);
    compare('leasedPct (derived)', leasedPct != null ? leasedPct.toFixed(1) : null, TARGET.leasedPct, (x) => (x != null ? x + '%' : '—'));
    compare('available', av, TARGET.availableUnits);
    if (TARGET.leases7d != null) compare('leases7d', kpi.leases7d, TARGET.leases7d);
    if (TARGET.leases28d != null) compare('leases28d', kpi.leases28d, TARGET.leases28d);
    const vb = kpi.velocityBreakdown;
    if (vb && TARGET.newLeases7d != null) compare('velocityBreakdown.newLeases7d', vb.newLeases7d, TARGET.newLeases7d);
    if (vb && TARGET.newLeases28d != null) compare('velocityBreakdown.newLeases28d', vb.newLeases28d, TARGET.newLeases28d);
    if (vb && TARGET.renewal7d != null) compare('velocityBreakdown.renewal7d', vb.renewal7d, TARGET.renewal7d);
    if (vb && TARGET.renewal28d != null) compare('velocityBreakdown.renewal28d', vb.renewal28d, TARGET.renewal28d);
    if (TARGET.projectedOccupancy4WeeksPct != null && kpi.projectedOccupancy4WeeksPct != null) {
      compare('projectedOccupancy4WeeksPct', kpi.projectedOccupancy4WeeksPct, TARGET.projectedOccupancy4WeeksPct, (x) => (typeof x === 'number' ? x.toFixed(1) : x) + '%');
    } else if (TARGET.projectedOccupancy4WeeksPct != null) {
      console.log('  projectedOccupancy4WeeksPct:', kpi.projectedOccupancy4WeeksPct ?? '—', '(expected ' + TARGET.projectedOccupancy4WeeksPct + '%)');
    }
    // Consistency: kpis.byProperty should match portfolio breakdown (same PUD source)
    if (millervilleOcc && occ != null && millervilleOcc.occupied != null) {
      console.log('  occupancy consistency (kpis.occupied vs portfolio breakdown):', occ === millervilleOcc.occupied ? '✓' : '✗', `(${occ} vs ${millervilleOcc.occupied})`);
    }
  }

  if (millervilleAvail || millervilleOcc) {
    console.log('\n--- Portfolio breakdowns (Millerville) ---');
    if (millervilleAvail) console.log('  available:', millervilleAvail.available, 'totalUnits:', millervilleAvail.totalUnits);
    if (millervilleOcc) console.log('  occupancyPct:', millervilleOcc.occupancyPct, 'occupied:', millervilleOcc.occupied);
  }

  // MMR source: OccupancyPercent from MMR (Domo/source of truth for 90.2%)
  const mmrOcc = body.dashboard?.mmrOcc || dashboard.mmrOcc || {};
  const mmrKeys = Object.keys(mmrOcc).filter((k) => /millerville/i.test(k));
  if (mmrKeys.length > 0) {
    console.log('\n--- MMR OccupancyPercent (source for display when present) ---');
    mmrKeys.forEach((k) => console.log('  ', k + ':', mmrOcc[k] + '%'));
  }

  const latestReportDate = body._meta?.latestReportDate ?? dashboard?.kpis?.latestReportDate ?? null;
  const overlayApplied = body._meta?.performanceOverviewOverlayApplied;
  console.log('\n--- PUD report date ---');
  console.log('  latestReportDate:', latestReportDate ? (typeof latestReportDate === 'string' ? latestReportDate : latestReportDate?.toISOString?.() ?? latestReportDate) : '—');
  console.log('  performanceOverviewOverlayApplied:', overlayApplied ?? '—', '(always false — dashboard uses DB only)');

  console.log('');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
