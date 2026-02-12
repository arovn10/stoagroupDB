#!/usr/bin/env node
/**
 * Clear only the MMR (Monday Morning Report) data table and re-sync it from Domo.
 * Use this when leasing.MMRData has NULLs because Domo column names didn't match the DB
 * (after fixing mappings in leasingRepository syncMMRData and/or domo-alias-overrides.json).
 *
 * Usage (from repo root):
 *   node scripts/reseed-mmr-from-domo.js
 *
 * Env (from .env in repo root or api/):
 *   API_BASE_URL     — default http://localhost:3000
 *   LEASING_SYNC_WEBHOOK_SECRET — if set on API, set here (or LEASING_SYNC_SECRET)
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
const secret = process.env.LEASING_SYNC_SECRET || process.env.LEASING_SYNC_WEBHOOK_SECRET || '';
const headers = { 'Content-Type': 'application/json' };
if (secret) headers['X-Sync-Secret'] = secret;

async function main() {
  console.log('1. Wiping leasing.MMRData only...');
  // Use exact alias the API expects (MMRData) so it works even if server hasn't restarted with case-insensitive fix
  const wipeRes = await fetch(`${base}/api/leasing/wipe?table=MMRData`, {
    method: 'POST',
    headers,
  });
  const wipeBody = await wipeRes.json().catch(() => ({}));
  if (!wipeRes.ok) {
    console.error('Wipe failed:', wipeRes.status, wipeBody);
    process.exit(1);
  }
  console.log('   ', wipeBody.truncated || wipeBody);

  console.log('2. Syncing MMR from Domo (force=true)...');
  const syncRes = await fetch(`${base}/api/leasing/sync-from-domo?dataset=MMRData&force=true`, {
    method: 'POST',
    headers,
  });
  const syncBody = await syncRes.json().catch(() => ({}));
  if (!syncRes.ok && syncRes.status !== 207) {
    console.error('Sync failed:', syncRes.status, syncBody);
    process.exit(1);
  }
  console.log('   fetched:', syncBody.fetched);
  console.log('   synced:', syncBody.synced);
  if (syncBody.errors?.length) console.log('   errors:', syncBody.errors);
  if (syncBody.errors?.length) process.exit(1);
  console.log('Done. MMR table reseeded.');
  console.log('Tip: Check API server logs for [MMR sync] Domo first-row column names (to fix NULL columns).');
  console.log('Tip: GET /api/leasing/sync-health shows which DB columns are all NULL.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
