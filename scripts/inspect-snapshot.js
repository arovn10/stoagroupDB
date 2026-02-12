#!/usr/bin/env node
/**
 * Inspect leasing dashboard snapshot table(s). Shows exactly what is stored so you can
 * verify the API is writing to the same DB/table you're querying.
 *
 * Usage (from repo root):
 *   node scripts/inspect-snapshot.js
 *
 * Loads .env from api/ or repo root. Requires: DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD.
 * The API writes to leasing.DashboardSnapshot (Id, Payload, BuiltAt). If you see
 * leasing.Dashboard in your DB client, that may be a different table.
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

const sql = require(path.join(__dirname, '..', 'api', 'node_modules', 'mssql'));

const config = {
  server: process.env.DB_SERVER || '',
  database: process.env.DB_DATABASE || '',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
  },
  pool: { max: 2, min: 0 },
};

async function inspectTable(pool, tableName) {
  console.log(`\n--- ${tableName} ---`);
  try {
    const r = await pool.request().query(`
      SELECT
        Id,
        BuiltAt,
        CASE WHEN Payload IS NULL THEN 1 ELSE 0 END AS PayloadIsNull,
        LEN(CAST(Payload AS NVARCHAR(MAX))) AS PayloadLen,
        LEFT(CAST(ISNULL(Payload, N'') AS NVARCHAR(200)), 120) AS PayloadPrefix
      FROM ${tableName}
    `);
    if (r.recordset.length === 0) {
      console.log('  (no rows)');
      return;
    }
    for (const row of r.recordset) {
      console.log('  Id:', row.Id, '| BuiltAt:', row.BuiltAt);
      console.log('  Payload: ', row.PayloadIsNull ? 'NULL' : `length=${row.PayloadLen}`);
      if (row.PayloadPrefix && String(row.PayloadPrefix).trim())
        console.log('  Prefix: ', JSON.stringify(String(row.PayloadPrefix).slice(0, 100)));
    }
  } catch (e) {
    console.log('  ERROR:', e.message);
  }
}

async function run() {
  if (!config.server || !config.database) {
    console.error('Missing DB_SERVER or DB_DATABASE. Set in api/.env or .env');
    process.exit(1);
  }
  console.log('Connecting to', config.server, 'database', config.database, '...');
  const pool = await sql.connect(config);
  console.log('Connected.\n');

  try {
    console.log('API writes to: leasing.DashboardSnapshot (Id=1, Payload, BuiltAt)');
    await inspectTable(pool, 'leasing.DashboardSnapshot');

    // In case the DB has a table named Dashboard (without "Snapshot")
    console.log('\n(Checking leasing.Dashboard in case that is the table you see in SSMS)');
    await inspectTable(pool, 'leasing.Dashboard');

    console.log('\n--- Summary ---');
    const countSnap = await pool.request().query('SELECT COUNT(*) AS n FROM leasing.DashboardSnapshot');
    const n = countSnap.recordset[0]?.n ?? 0;
    const withPayload = await pool.request().query(`
      SELECT COUNT(*) AS n FROM leasing.DashboardSnapshot WHERE Payload IS NOT NULL AND LEN(CAST(Payload AS NVARCHAR(MAX))) > 0
    `);
    const hasData = withPayload.recordset[0]?.n ?? 0;
    console.log('leasing.DashboardSnapshot: total rows =', n, '| rows with non-empty Payload =', hasData);
    if (n > 0 && hasData === 0)
      console.log('  -> All rows have NULL or empty Payload. Check that the API .env points to this DB and that rebuild/sync ran successfully.');
  } finally {
    await pool.close();
    console.log('\nDone.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
