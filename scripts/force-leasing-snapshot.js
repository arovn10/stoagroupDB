#!/usr/bin/env node
/**
 * Force the leasing dashboard snapshot to be rebuilt and stored on the server.
 * Use after deploy or when you want the dashboard to reflect the latest DB + new logic.
 *
 * Usage (from repo root):
 *   node scripts/force-leasing-snapshot.js
 *
 * Env (from .env in repo root or api/):
 *   API_BASE_URL            — default http://localhost:3000 (use your Render URL for production)
 *   LEASING_SYNC_WEBHOOK_SECRET — if set on API, set here so the request is authorized
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
  console.log('POST', base + '/api/leasing/rebuild-snapshot');
  const res = await fetch(`${base}/api/leasing/rebuild-snapshot`, {
    method: 'POST',
    headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Failed:', res.status, body);
    process.exit(1);
  }
  console.log('Snapshot rebuilt. builtAt:', body.builtAt ?? '');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
