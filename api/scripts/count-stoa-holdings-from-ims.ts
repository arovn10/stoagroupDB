#!/usr/bin/env ts-node
/**
 * Count how many deals (distinct projects) Stoa Holdings LLC appears in
 * according to IMS seed data (commitments + investments), for comparison with DB.
 * Run from api/: npx ts-node --transpile-only scripts/count-stoa-holdings-from-ims.ts
 */

import * as path from 'path';
import * as fs from 'fs';
import * as XLSX from 'xlsx';

const IMS_DIR = path.join(__dirname, '../../stoa_seed_csvs/IMSData');
const PARTNER_MATCH = /stoa\s*holdings/i;

function findColumnIndex(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const index = headers.findIndex((h) => h && h.toLowerCase().includes(name.toLowerCase()));
    if (index >= 0) return index;
  }
  return -1;
}

function readExcelFile(filePath: string): any[][] {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];
}

function countDealsInSheet(
  filePath: string,
  label: string,
  projectNames: string[],
  partnerNames: string[]
): { projectCol: number; partnerCol: number; distinctProjects: Set<string>; rowCount: number } {
  const rows = readExcelFile(filePath);
  if (rows.length < 2) {
    console.log(`  ${label}: no data rows`);
    return { projectCol: -1, partnerCol: -1, distinctProjects: new Set(), rowCount: 0 };
  }

  const headers = rows[0].map((h: any) => String(h || '').trim());
  const projectCol = findColumnIndex(
    headers,
    'project name',
    'project',
    'property',
    'name',
    'entity',
    'deal',
    'investment',
    'fund'
  );
  const partnerCol = findColumnIndex(
    headers,
    'investor name',
    'investor profile legal name',
    'partner',
    'investor',
    'equity',
    'profile',
    'entity'
  );

  const distinctProjects = new Set<string>();
  let rowCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const partner = partnerCol >= 0 && row[partnerCol] ? String(row[partnerCol]).trim() : '';
    if (!PARTNER_MATCH.test(partner)) continue;

    rowCount++;
    const project =
      projectCol >= 0 && row[projectCol] ? String(row[projectCol]).trim() : '';
    if (project) distinctProjects.add(project);
  }

  return { projectCol, partnerCol, distinctProjects, rowCount };
}

function main() {
  console.log('Counting Stoa Holdings LLC in IMS seed data (commitments + investments)\n');

  const files = fs.readdirSync(IMS_DIR).filter((f) => f.endsWith('.xlsx'));
  const commitmentsFile = files.find((f) => f.includes('commitments'));
  const investmentsFile = files.find(
    (f) => f.includes('investments') && !f.includes('distributions')
  );
  const combinedFile = files.find(
    (f) => f.includes('investments') && f.includes('distributions')
  );

  const allProjects = new Set<string>();
  let totalRows = 0;

  if (commitmentsFile) {
    const fullPath = path.join(IMS_DIR, commitmentsFile);
    const r = countDealsInSheet(fullPath, 'Commitments', [], []);
    console.log(`Commitments file: ${commitmentsFile}`);
    console.log(`  Rows for Stoa Holdings: ${r.rowCount}`);
    console.log(`  Distinct projects: ${r.distinctProjects.size}`);
    r.distinctProjects.forEach((p) => allProjects.add(p));
    totalRows += r.rowCount;
  }

  if (investmentsFile) {
    const fullPath = path.join(IMS_DIR, investmentsFile);
    const r = countDealsInSheet(fullPath, 'Investments', [], []);
    console.log(`\nInvestments file: ${investmentsFile}`);
    console.log(`  Rows for Stoa Holdings: ${r.rowCount}`);
    console.log(`  Distinct projects: ${r.distinctProjects.size}`);
    r.distinctProjects.forEach((p) => allProjects.add(p));
    totalRows += r.rowCount;
  }

  if (combinedFile) {
    const fullPath = path.join(IMS_DIR, combinedFile);
    const r = countDealsInSheet(fullPath, 'Investments+Distributions', [], []);
    console.log(`\nCombined investments file: ${combinedFile}`);
    console.log(`  Rows for Stoa Holdings: ${r.rowCount}`);
    console.log(`  Distinct projects: ${r.distinctProjects.size}`);
    r.distinctProjects.forEach((p) => allProjects.add(p));
    totalRows += r.rowCount;
  }

  console.log('\n--- Summary ---');
  console.log(`Total distinct projects (deals) for Stoa Holdings in IMS seed: ${allProjects.size}`);
  if (allProjects.size > 0 && allProjects.size <= 30) {
    console.log('Projects:', [...allProjects].sort().join(', '));
  }
}

main();
