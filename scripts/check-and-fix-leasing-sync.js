#!/usr/bin/env node
/**
 * Check each leasing table for entirely-NULL columns (sync mapping issue), then fix by:
 * 1) Fetching Domo CSV headers for that dataset
 * 2) Adding a matching Domo header as alias (POST /api/leasing/sync-add-alias)
 * 3) Wiping that table (POST /api/leasing/wipe?table=alias)
 * 4) Syncing only that table (POST /api/leasing/sync-from-domo?dataset=alias)
 * 5) Re-checking until no all-NULL columns or max attempts
 *
 * Requires: API server running, .env with API_BASE_URL (default http://localhost:3000),
 * DOMO_CLIENT_ID, DOMO_CLIENT_SECRET, DOMO_DATASET_* for each table, and optionally
 * LEASING_SYNC_WEBHOOK_SECRET for wipe/sync/add-alias.
 *
 * Usage: node scripts/check-and-fix-leasing-sync.js
 *    or: cd api && node -r dotenv/config ../scripts/check-and-fix-leasing-sync.js (loads api/.env)
 */

const path = require('path');
const fs = require('fs');

// Load .env from repo root or api/
for (const p of [
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', 'api', '.env'),
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
    break;
  }
}

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.LEASING_SYNC_WEBHOOK_SECRET || '';

const DOMO_DATASET_KEYS = {
  leasing: 'DOMO_DATASET_LEASING',
  MMRData: 'DOMO_DATASET_MMR',
  unitbyunittradeout: 'DOMO_DATASET_TRADEOUT',
  portfolioUnitDetails: 'DOMO_DATASET_PUD',
  units: 'DOMO_DATASET_UNITS',
  unitmix: 'DOMO_DATASET_UNITMIX',
  pricing: 'DOMO_DATASET_PRICING',
  recentrents: 'DOMO_DATASET_RECENTRENTS',
};

const LEASING_ALIASES = Object.keys(DOMO_DATASET_KEYS);

function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '');
}

/** Insert space before capitals then lowercase: UnitNumber -> unit number */
function columnToPhrase(col) {
  return col.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
}

async function getDomoToken() {
  const clientId = process.env.DOMO_CLIENT_ID?.trim();
  const clientSecret = process.env.DOMO_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('DOMO_CLIENT_ID and DOMO_CLIENT_SECRET required');
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://api.domo.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  });
  if (!res.ok) throw new Error(`Domo token failed: ${res.status}`);
  const json = await res.json();
  if (!json.access_token) throw new Error('Domo token missing access_token');
  return json.access_token;
}

async function fetchDomoCsvHeaders(datasetId, token) {
  const url = `https://api.domo.com/v1/datasets/${datasetId}/data?includeHeader=true&format=csv`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Domo dataset ${datasetId}: ${res.status}`);
  const text = await res.text();
  const firstLine = text.split(/\r?\n/)[0] || '';
  const headers = parseCsvLine(firstLine);
  return headers;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

async function apiGet(pathname) {
  const url = `${API_BASE}${pathname}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || res.statusText || res.status);
  return json;
}

async function apiPost(pathname, body = null) {
  const url = `${API_BASE}${pathname}`;
  const headers = { 'Content-Type': 'application/json' };
  if (SECRET) headers['X-Sync-Secret'] = SECRET;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || res.statusText || res.status);
  return json;
}

/** Pick best Domo header for an all-null DB column (by normalized name match). */
function pickBestDomoHeader(columnName, domoHeaders) {
  const colNorm = normalize(columnName);
  const colPhrase = normalize(columnToPhrase(columnName));
  for (const h of domoHeaders) {
    const hNorm = normalize(h);
    if (hNorm === colNorm || hNorm === colPhrase) return h;
    if (hNorm.includes(colNorm) || colNorm.includes(hNorm)) return h;
  }
  return null;
}

async function main() {
  console.log('Leasing sync check-and-fix: checking for all-NULL columns...\n');

  let health;
  try {
    health = await apiGet('/api/leasing/sync-health');
  } catch (e) {
    console.error('Failed to GET /api/leasing/sync-health. Is the API running at', API_BASE, '?', e.message);
    process.exit(1);
  }

  const tables = health.tables || {};
  const problematic = LEASING_ALIASES.filter((alias) => Array.isArray(tables[alias]) && tables[alias].length > 0);
  if (problematic.length === 0) {
    console.log('All leasing tables have no entirely-NULL columns. Nothing to fix.');
    process.exit(0);
  }

  let token;
  try {
    token = await getDomoToken();
  } catch (e) {
    console.error('Domo token failed:', e.message);
    process.exit(1);
  }

  const maxAttemptsPerTable = 3;
  let anyFixed = false;

  for (const alias of problematic) {
    const allNullColumns = tables[alias];
    console.log(`\n--- ${alias}: ${allNullColumns.length} all-NULL column(s): ${allNullColumns.join(', ')}`);

    const envKey = DOMO_DATASET_KEYS[alias];
    const datasetId = process.env[envKey]?.trim();
    if (!datasetId) {
      console.warn(`  Skip: ${envKey} not set.`);
      continue;
    }

    let domoHeaders;
    try {
      domoHeaders = await fetchDomoCsvHeaders(datasetId, token);
      console.log(`  Domo headers (${domoHeaders.length}): ${domoHeaders.slice(0, 10).join(', ')}${domoHeaders.length > 10 ? '...' : ''}`);
    } catch (e) {
      console.warn(`  Skip: could not fetch Domo CSV: ${e.message}`);
      continue;
    }

    let attempt = 0;
    let stillNull = [...allNullColumns];

    while (stillNull.length > 0 && attempt < maxAttemptsPerTable) {
      attempt++;
      console.log(`  Attempt ${attempt}: adding aliases for ${stillNull.length} column(s), then wipe + sync.`);

      for (const column of stillNull) {
        const bestHeader = pickBestDomoHeader(column, domoHeaders);
        if (!bestHeader) {
          console.warn(`    No matching Domo header for column "${column}". Try adding manually via POST /api/leasing/sync-add-alias.`);
          continue;
        }
        try {
          await apiPost('/api/leasing/sync-add-alias', {
            table: alias,
            column,
            domoHeader: bestHeader,
          });
          console.log(`    Added alias: ${alias}.${column} <- "${bestHeader}"`);
          anyFixed = true;
        } catch (e) {
          console.warn(`    Failed to add alias: ${e.message}`);
        }
      }

      try {
        await apiPost(`/api/leasing/wipe?table=${encodeURIComponent(alias)}`);
        console.log(`    Wiped table ${alias}.`);
      } catch (e) {
        console.error(`    Wipe failed: ${e.message}`);
        break;
      }

      try {
        const syncRes = await apiPost(`/api/leasing/sync-from-domo?dataset=${encodeURIComponent(alias)}`);
        console.log(`    Sync: ${syncRes.synced?.length ? syncRes.synced.join(', ') : 'none'}; errors: ${syncRes.errors?.length || 0}.`);
      } catch (e) {
        console.error(`    Sync failed: ${e.message}`);
        break;
      }

      const nextHealth = await apiGet('/api/leasing/sync-health');
      stillNull = nextHealth.tables?.[alias] || [];
      if (stillNull.length > 0) {
        console.log(`    Still all-NULL: ${stillNull.join(', ')}. Will retry with remaining headers.`);
      }
    }

    if (stillNull.length > 0) {
      console.log(`  Done with ${alias}; ${stillNull.length} column(s) still all-NULL: ${stillNull.join(', ')}.`);
    } else {
      console.log(`  ${alias}: all columns now syncing.`);
    }
  }

  console.log('\nCheck-and-fix run complete.');
  process.exit(anyFixed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
