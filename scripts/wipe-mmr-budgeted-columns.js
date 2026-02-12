#!/usr/bin/env node
/**
 * Wipe (set to NULL) the MMR budgeted columns in leasing.MMRData so they can be
 * re-populated with correct data (e.g. after fixing Domo mapping or re-sync).
 *
 * Columns wiped:
 *   - BudgetedOccupancyCurrentMonth
 *   - BudgetedLeasedCurrentMonth
 *   - BudgetedLeasedPercentCurrentMonth
 *
 * Usage (from repo root):
 *   node scripts/wipe-mmr-budgeted-columns.js           # run UPDATE
 *   node scripts/wipe-mmr-budgeted-columns.js --dry-run # print SQL only, no change
 *
 * Requires: .env with DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD (api/ or root).
 * Uses api/node_modules/mssql.
 */
const path = require('path');
const fs = require('fs');

// Load .env from api/ or repo root (same as API)
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
  pool: { max: 5, min: 0 },
};

const TABLE = 'leasing.MMRData';
const COLUMNS = [
  'BudgetedOccupancyCurrentMonth',
  'BudgetedLeasedCurrentMonth',
  'BudgetedLeasedPercentCurrentMonth',
];

const updateSql = `UPDATE ${TABLE}
SET
  [${COLUMNS[0]}] = NULL,
  [${COLUMNS[1]}] = NULL,
  [${COLUMNS[2]}] = NULL;`;

async function run() {
  const dryRun = process.argv.includes('--dry-run');

  if (!config.server || !config.database) {
    console.error('Missing DB_SERVER or DB_DATABASE in .env (load from api/ or repo root)');
    process.exit(1);
  }

  console.log('Target:', TABLE);
  console.log('Columns to set to NULL:', COLUMNS.join(', '));
  console.log('');

  if (dryRun) {
    console.log('--dry-run: SQL that would be run:\n');
    console.log(updateSql);
    console.log('\nExiting without making changes.');
    process.exit(0);
  }

  console.log('Connecting to', config.server, '...');
  const pool = await sql.connect(config);
  console.log('Connected.\n');

  try {
    const before = await pool.request().query(`SELECT COUNT(*) AS n FROM ${TABLE}`);
    const totalRows = before.recordset[0]?.n ?? 0;
    console.log('MMRData row count:', totalRows);

    const result = await pool.request().query(updateSql);
    const rowsAffected = result.rowsAffected?.[0] ?? 0;
    console.log('Rows updated:', rowsAffected);
    console.log('Done. Budgeted columns are now NULL.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

run();
