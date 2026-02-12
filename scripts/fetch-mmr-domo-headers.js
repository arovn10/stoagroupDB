#!/usr/bin/env node
/**
 * Fetch MMR dataset from Domo and print CSV headers + first row for budgeted/occupancy columns.
 * Use to see exact Domo column names so we can add them to the sync mapper.
 *
 * Env: DOMO_CLIENT_ID, DOMO_CLIENT_SECRET, DOMO_DATASET_MMR (from .env in repo root or api/)
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

async function main() {
  const clientId = process.env.DOMO_CLIENT_ID?.trim();
  const clientSecret = process.env.DOMO_CLIENT_SECRET?.trim();
  const datasetId = process.env.DOMO_DATASET_MMR?.trim();
  if (!clientId || !clientSecret || !datasetId) {
    console.error('Set DOMO_CLIENT_ID, DOMO_CLIENT_SECRET, DOMO_DATASET_MMR');
    process.exit(1);
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenRes = await fetch('https://api.domo.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${auth}` },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  });
  if (!tokenRes.ok) {
    console.error('Domo token failed:', tokenRes.status);
    process.exit(1);
  }
  const tokenJson = await tokenRes.json();
  const token = tokenJson.access_token;
  if (!token) {
    console.error('No access_token in response');
    process.exit(1);
  }

  const url = `https://api.domo.com/v1/datasets/${datasetId}/data?includeHeader=true&format=csv&limit=2`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error('Domo dataset fetch failed:', res.status);
    process.exit(1);
  }
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    console.error('Need at least header + 1 row');
    process.exit(1);
  }

  const headers = parseCsvLine(lines[0]);
  const firstRow = parseCsvLine(lines[1]);
  const rowObj = {};
  headers.forEach((h, j) => { rowObj[h] = firstRow[j] ?? ''; });

  const budgetedOrOcc = (h) => {
    const low = h.toLowerCase();
    return low.includes('budget') || low.includes('occupancy') || low.includes('leased');
  };

  console.log('All MMR headers (' + headers.length + '):');
  console.log(JSON.stringify(headers, null, 0));
  console.log('\nHeaders containing "budget", "occupancy", or "leased" and first-row value:');
  headers.forEach((h, i) => {
    if (budgetedOrOcc(h)) console.log('  ', JSON.stringify(h), '=>', JSON.stringify(firstRow[i]));
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
