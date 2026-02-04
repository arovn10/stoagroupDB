#!/usr/bin/env ts-node
/**
 * Reseed Ryan Nash's equity investments from IMS seed data.
 * 1. Deletes existing commitments where Ryan Nash is the lead (EquityPartnerId = Ryan Nash).
 * 2. Re-imports from IMS investments file(s) every row where investor is "Ryan Nash".
 *
 * Does NOT remove him as related party on other commitments; only replaces his lead commitments.
 *
 * Usage: npm run db:reseed-ryan-nash-investments (from api/)
 * Optional: --dry-run to only report what would be deleted and inserted.
 *
 * Requires .env with DB_* and stoa_seed_csvs/IMSData/ ims-investments*.xlsx.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import dotenv from 'dotenv';
import sql from 'mssql';
import { getConnection } from '../src/config/database';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const RYAN_NASH_MATCH = /ryan\s*nash/i;

function findColumnIndex(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const index = headers.findIndex((h) => h && h.toLowerCase().includes(name.toLowerCase()));
    if (index >= 0) return index;
  }
  return -1;
}

function parseAmount(str: string | number | null | undefined): number | null {
  if (str == null) return null;
  const s = String(str).replace(/[$,]/g, '').trim();
  if (s === '' || s === 'N/A' || s === '-') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseDate(str: string | number | null | undefined): string | null {
  if (str == null) return null;
  const s = String(str).trim();
  if (s === '' || s === 'N/A' || s === '-') return null;
  if (typeof str === 'number') {
    const d = new Date((str - 2) * 24 * 60 * 60 * 1000 + new Date(1900, 0, 1).getTime());
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split('/');
  if (parts.length === 3) {
    const [mo, day, year] = parts.map((p) => parseInt(p, 10));
    const y = year! < 100 ? (year! < 50 ? year! + 2000 : year! + 1900) : year!;
    if (mo! >= 1 && mo! <= 12 && day! >= 1 && day! <= 31) return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

function readExcelFile(filePath: string): any[][] {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][];
}

async function getProjectId(pool: sql.ConnectionPool, projectName: string): Promise<number | null> {
  if (!projectName || projectName.trim().length < 3) return null;
  const name = projectName.trim();
  let r = await pool.request().input('name', sql.NVarChar, name).query('SELECT ProjectId FROM core.Project WHERE ProjectName = @name');
  if (r.recordset.length > 0) return r.recordset[0].ProjectId;
  r = await pool.request().input('name', sql.NVarChar, name).query('SELECT ProjectId FROM core.Project WHERE LOWER(ProjectName) = LOWER(@name)');
  if (r.recordset.length > 0) return r.recordset[0].ProjectId;
  r = await pool.request().input('name', sql.NVarChar, `%${name}%`).query('SELECT TOP 1 ProjectId FROM core.Project WHERE ProjectName LIKE @name');
  return r.recordset.length > 0 ? r.recordset[0].ProjectId : null;
}

async function main() {
  console.log('Reseeding Ryan Nash investments from IMS data' + (DRY_RUN ? ' (dry-run)' : '') + '\n');

  const pool = await getConnection();

  const partnerResult = await pool.request().query(`
    SELECT EquityPartnerId FROM core.EquityPartner WHERE PartnerName = N'Ryan Nash'
  `);
  if (partnerResult.recordset.length === 0) {
    console.log('Ryan Nash equity partner not found. Create it first (e.g. via API or seed).');
    await pool.close();
    process.exit(1);
  }
  const ryanNashPartnerId = partnerResult.recordset[0].EquityPartnerId;

  const countResult = await pool.request()
    .input('id', sql.Int, ryanNashPartnerId)
    .query('SELECT COUNT(*) AS cnt FROM banking.EquityCommitment WHERE EquityPartnerId = @id');
  const existingLeadCount = countResult.recordset[0].cnt;

  console.log(`Ryan Nash EquityPartnerId = ${ryanNashPartnerId}`);
  console.log(`Existing commitments (as lead): ${existingLeadCount}`);

  if (!DRY_RUN && existingLeadCount > 0) {
    await pool.request()
      .input('id', sql.Int, ryanNashPartnerId)
      .query('DELETE FROM banking.EquityCommitment WHERE EquityPartnerId = @id');
    console.log('Deleted existing lead commitments for Ryan Nash.');
  } else if (DRY_RUN && existingLeadCount > 0) {
    console.log('(Dry-run: would delete those lead commitments.)');
  }

  const imsDir = path.join(__dirname, '../../stoa_seed_csvs/IMSData');
  if (!fs.existsSync(imsDir)) {
    console.log('IMS data directory not found:', imsDir);
    await pool.close();
    process.exit(1);
  }

  const files = fs.readdirSync(imsDir).filter((f) => f.endsWith('.xlsx') && f.includes('investments'));
  let inserted = 0;
  let skipped = 0;

  for (const file of files) {
    if (file.includes('distributions') && !file.includes('and-distributions')) continue;
    const filePath = path.join(imsDir, file);
    const rows = readExcelFile(filePath);
    if (rows.length < 2) continue;

    const headers = rows[0].map((h: any) => String(h || '').trim());
    const projectCol = findColumnIndex(headers, 'project name', 'project', 'property', 'name', 'deal');
    const partnerCol = findColumnIndex(headers, 'investor name', 'investor profile legal name', 'partner', 'investor');
    const amountCol = findColumnIndex(headers, 'investment amount', 'contribution amount', 'amount', 'value');
    const dateCol = findColumnIndex(headers, 'contribution date', 'received date', 'investment date', 'date', 'funding date');
    if (projectCol < 0 || partnerCol < 0) continue;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const partner = partnerCol >= 0 && row[partnerCol] ? String(row[partnerCol]).trim() : '';
      if (!RYAN_NASH_MATCH.test(partner)) continue;

      const projectName = projectCol >= 0 && row[projectCol] ? String(row[projectCol]).trim() : '';
      const projectId = await getProjectId(pool, projectName);
      if (!projectId) {
        if (skipped <= 3) console.log('  Skip (no project):', projectName || '(blank)');
        skipped++;
        continue;
      }

      const amount = amountCol >= 0 ? parseAmount(row[amountCol]) : null;
      const fundingDate = dateCol >= 0 ? parseDate(row[dateCol]) : null;
      if (!amount || amount <= 0) {
        skipped++;
        continue;
      }
      if (!fundingDate) {
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  Would insert: ProjectId=${projectId}, Amount=${amount}, FundingDate=${fundingDate}`);
        inserted++;
        continue;
      }

      const existing = await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('EquityPartnerId', sql.Int, ryanNashPartnerId)
        .input('Amount', sql.Decimal(18, 2), amount)
        .input('FundingDate', sql.Date, fundingDate)
        .query(`
          SELECT EquityCommitmentId FROM banking.EquityCommitment
          WHERE ProjectId = @ProjectId AND EquityPartnerId = @EquityPartnerId
            AND ABS(COALESCE(Amount, 0) - COALESCE(@Amount, 0)) < 0.01
            AND (FundingDate = @FundingDate OR (FundingDate IS NULL AND @FundingDate IS NULL))
        `);
      if (existing.recordset.length > 0) continue;

      await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('EquityPartnerId', sql.Int, ryanNashPartnerId)
        .input('FundingDate', sql.Date, fundingDate)
        .input('Amount', sql.Decimal(18, 2), amount)
        .query(`
          INSERT INTO banking.EquityCommitment (ProjectId, EquityPartnerId, FundingDate, Amount)
          VALUES (@ProjectId, @EquityPartnerId, @FundingDate, @Amount)
        `);
      inserted++;
    }
  }

  console.log('\nInserted', inserted, 'commitments for Ryan Nash.');
  if (skipped) console.log('Skipped', skipped, 'rows (no project, no amount, or no date).');
  if (DRY_RUN) console.log('Dry-run: no data was changed. Run without --dry-run to apply.');
  await pool.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
