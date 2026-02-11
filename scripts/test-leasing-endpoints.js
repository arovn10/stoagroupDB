#!/usr/bin/env node
/**
 * Test all API endpoints the leasing dashboard frontend uses.
 * Usage: node scripts/test-leasing-endpoints.js [baseUrl]
 * Default baseUrl: http://localhost:3000
 */
const base = process.argv[2] || 'http://localhost:3000';

function fetchOk(url, opts = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), opts.timeout || 15000);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .then((r) => {
      clearTimeout(to);
      return r;
    })
    .catch((e) => {
      clearTimeout(to);
      throw e;
    });
}

async function run() {
  const results = [];
  function log(name, ok, detail) {
    const line = ok ? `OK  ${name}` : `FAIL ${name}`;
    results.push({ name, ok, detail });
    console.log(ok ? `\x1b[32m${line}\x1b[0m` : `\x1b[31m${line}\x1b[0m`, detail || '');
  }

  console.log(`\nTesting base: ${base}\n`);

  // 1. Health
  try {
    const r = await fetchOk(`${base}/health`);
    const j = await r.json();
    log('GET /health', r.ok && j.success, r.status + ' ' + (j.message || ''));
  } catch (e) {
    log('GET /health', false, e.message || 'fetch failed');
  }

  // 2. Dashboard (long timeout; this can take 1–2 min if no snapshot). Set env DASHBOARD_TIMEOUT_MS to override.
  const dashboardTimeout = Number(process.env.DASHBOARD_TIMEOUT_MS) || 125000;
  try {
    const start = Date.now();
    const r = await fetchOk(`${base}/api/leasing/dashboard`, { timeout: dashboardTimeout });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const j = await r.json();
    const hasDashboard = j && j.success && j.dashboard != null;
    const rowsLen = Array.isArray(j?.dashboard?.rows) ? j.dashboard.rows.length : 'n/a';
    log(
      'GET /api/leasing/dashboard',
      hasDashboard,
      `${r.status} in ${elapsed}s, dashboard.rows.length = ${rowsLen}, fromSnapshot = ${j._meta?.fromSnapshot ?? 'n/a'}`
    );
    if (!hasDashboard && j) {
      console.log('   Response keys:', Object.keys(j));
      if (j.error) console.log('   Error:', j.error);
    }
  } catch (e) {
    log('GET /api/leasing/dashboard', false, (e.name === 'AbortError' ? 'timeout' : e.message));
  }

  // 3. Rebuild snapshot (optional; may 404 if server not updated)
  try {
    const r = await fetchOk(`${base}/api/leasing/rebuild-snapshot`, {
      method: 'POST',
      timeout: 5000,
    });
    const j = r.ok ? await r.json().catch(() => ({})) : {};
    log(
      'POST /api/leasing/rebuild-snapshot',
      r.ok,
      r.status === 404 ? '404 (route not deployed?)' : r.status + ' ' + (j.builtAt ? 'builtAt ' + j.builtAt : '')
    );
  } catch (e) {
    log('POST /api/leasing/rebuild-snapshot', false, e.message || '');
  }

  // 4. Aggregates available (optional; frontend may not use in backend-only mode)
  try {
    const r = await fetchOk(`${base}/api/leasing/aggregates/available`);
    const j = await r.json();
    log('GET /api/leasing/aggregates/available', r.ok && j.success != null, r.status + ' available=' + j.available);
  } catch (e) {
    log('GET /api/leasing/aggregates/available', false, e.message);
  }

  console.log('\n--- Summary ---');
  const failed = results.filter((x) => !x.ok);
  if (failed.length) {
    console.log('Failed:', failed.map((x) => x.name).join(', '));
    process.exit(1);
  }
  console.log('All endpoints OK for frontend.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
