#!/usr/bin/env node
/**
 * Render cron (e.g. every 15 min): call GET /api/leasing/sync-check first.
 * Only when Domo data has changed (response.changes === true) do we run POST /api/leasing/sync-from-domo.
 * Otherwise exit 0 immediately so we don't full-sync every run.
 * Needs: API_BASE_URL; optional: LEASING_SYNC_WEBHOOK_SECRET.
 */
const https = require('https');
const http = require('http');

const base = (process.env.API_BASE_URL || '').replace(/\/$/, '');
const secret = process.env.LEASING_SYNC_WEBHOOK_SECRET || '';
// Sync-from-domo can take several minutes; 10 min client timeout
const SYNC_TIMEOUT_MS = Number(process.env.LEASING_SYNC_TIMEOUT_MS) || 600000;
if (!base) {
  console.error('API_BASE_URL not set');
  process.exit(1);
}

const lib = base.startsWith('https') ? https : http;
const headers = { 'Content-Type': 'application/json' };
if (secret) headers['X-Sync-Secret'] = secret;

function get(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const req = lib.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', reject);
  });
}

function post(path, timeoutMs = SYNC_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const req = lib.request(url, { method: 'POST', headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`sync-from-domo timed out after ${timeoutMs / 1000}s`));
    });
    req.end();
  });
}

(async () => {
  try {
    const { statusCode, body } = await get('/api/leasing/sync-check');
    if (statusCode !== 200) {
      console.error('sync-check failed:', statusCode, body.slice(0, 200));
      process.exit(1);
    }
    let data;
    try {
      data = JSON.parse(body);
    } catch (_) {
      console.error('sync-check response not JSON:', body.slice(0, 200));
      process.exit(1);
    }
    if (data.changes !== true) {
      console.log('No Domo changes; skipping full sync. Rebuilding snapshot from current DB...');
      const rebuildRes = await post('/api/leasing/rebuild-snapshot', 120000);
      if (rebuildRes.statusCode === 200) {
        console.log('Snapshot rebuilt.');
      } else {
        console.warn('rebuild-snapshot:', rebuildRes.statusCode, rebuildRes.body?.slice(0, 100));
      }
      process.exit(0);
    }
    console.log('Domo changes detected; running sync-from-domo...');
    const syncRes = await post('/api/leasing/sync-from-domo');
    const ok = syncRes.statusCode === 200 || syncRes.statusCode === 207;
    if (!ok) {
      console.error('sync-from-domo failed:', syncRes.statusCode, syncRes.body.slice(0, 300));
      process.exit(1);
    }
    let summary;
    try {
      summary = JSON.parse(syncRes.body);
    } catch (_) {
      summary = null;
    }
    if (syncRes.statusCode === 207 && summary?.errors?.length) {
      console.log('Sync completed with partial errors:', summary.synced?.length || 0, 'synced,', summary.errors?.length || 0, 'errors');
      summary.errors.forEach((e) => console.error('  -', e.dataset + ':', e.message?.slice(0, 80)));
    } else {
      console.log('Sync completed.', summary?.synced?.length ? summary.synced.length + ' tables synced.' : '');
    }
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
