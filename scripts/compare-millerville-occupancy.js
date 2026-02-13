#!/usr/bin/env node
/**
 * Fetch backend vs frontend occupancy comparison for Millerville.
 * Run with API up: node scripts/compare-millerville-occupancy.js
 * API_BASE_URL=http://localhost:3000 node scripts/compare-millerville-occupancy.js
 */
const base = process.env.API_BASE_URL || 'http://localhost:3000';
const url = base.replace(/\/$/, '') + '/api/leasing/debug/compare-millerville';

async function main() {
  console.log('GET', url);
  let res;
  try {
    res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  } catch (e) {
    console.error('Fetch failed:', e.message);
    console.error('Start the API (e.g. cd api && npm run start) first.');
    process.exit(1);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    console.error('Status:', res.status, body?.error || body);
    process.exit(1);
  }
  const c = body.compare;
  if (!c) {
    console.error('No compare data');
    process.exit(1);
  }
  console.log('\n--- Millerville occupancy comparison (same PUD data) ---');
  console.log('Report date:', c.latestReportDate);
  console.log('Total units:', c.totalUnits);
  console.log('Backend  occupied:', c.backendOccupied, '  vacant:', c.vacantByBackend);
  console.log('Frontend occupied:', c.frontendOccupied, '  vacant:', c.vacantByFrontend);
  console.log('Difference:', c.frontendOccupied - c.backendOccupied, 'units');
  if (c.diff && c.diff.length > 0) {
    console.log('\n--- Units where backend ≠ frontend (' + c.diff.length + ') ---');
    c.diff.forEach((u) => {
      console.log('  ', u.unitKey, '|', u.status, '| backendOccupied=', u.backendOccupied, 'frontendVacant=', u.frontendVacant);
    });
  } else {
    console.log('\n--- No diff: every unit has same classification ---');
  }
  if (c.sampleUnits && c.sampleUnits.length > 0) {
    console.log('\n--- Sample units (first 15) ---');
    c.sampleUnits.slice(0, 15).forEach((u) => {
      console.log('  ', u.unitKey, u.status, 'notice=', u.notice || '—', 'moveOut=', u.moveOut || '—', 'occ=', u.backendOccupied, 'vacant=', u.frontendVacant);
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
