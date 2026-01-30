#!/usr/bin/env ts-node
/**
 * Attach files from data/CAROLINASPIPELINEFILES to the corresponding deal pipeline
 * records (Carolinas region) via the API. Matches filenames to deals by keyword rules.
 * Uses POST /api/pipeline/deal-pipeline/:id/attachments (multipart "file"); the API
 * handles DB and Azure Blob.
 *
 * Usage: npm run db:attach-carolinas-files
 * Prereq: Carolinas deals seeded, API running. Set API_BASE_URL (default http://localhost:3000), optional API_TOKEN.
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load api/.env then repo root .env (root has all secrets; scripts run from api/)
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const API_BASE_URL = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_TOKEN = process.env.API_TOKEN || process.env.JWT_TOKEN || '';

const FILES_DIR = path.resolve(__dirname, '../../data/CAROLINASPIPELINEFILES');

// Match filename (case-insensitive) by substring → ProjectName as in API (Site column from CSV)
const FILE_TO_PROJECT_NAME: { patterns: string[]; projectName: string }[] = [
  { patterns: ['1450 Meeting'], projectName: '1450 Meeting St' },
  { patterns: ['239 W Mallard Creek', 'Mallard Creek Church Rd'], projectName: '239 W Mallard Creek Church Rd, Charlotte, NC 28262' },
  { patterns: ['300 Easley Bridge'], projectName: '300 Easley Bridge Rd' },
  { patterns: ['450 Lake Murray', 'Lake Murray Blvd', 'Irmo - Lake Murray', 'RE_ 450', 'RE_ Irmo'], projectName: '450 Lake Murray Blbd' },
  { patterns: ['Gillis Hill', 'Gillis Hills'], projectName: '7547 Raeford Rd, Fayetteville, NC' },
  { patterns: ['3610 M L King', 'M L King Jr'], projectName: 'MLK Jr Blvd' },
  { patterns: ['9671 Spring'], projectName: '9671 Spring Boulevard' },
  { patterns: ['8901 Ocean', 'Ocean Hwy', 'Calabash', 'Ocean, Hwy, Calabash'], projectName: '8901 Ocean Highway, Calabash, NC 28467' },
  { patterns: ['Brigham Rd - Greensboro'], projectName: '701 Brigham Rd' },
  { patterns: ['Carnes Crossroads', 'CARNES NORTH TRACT'], projectName: 'Carnes Crossroads' },
  { patterns: ['Carolina Point Pkwy'], projectName: '15 Carolina Point Pkwy, Greenville, SC 29607' },
  { patterns: ['Chapel Hill', 'Dairy Weaver', 'Weaver Dairy'], projectName: '860 Weaver Dairy Rd' },
  { patterns: ['Cub Creek'], projectName: 'Cub Creek Apartments 821 E Carver St, Durham, NC 27704' },
  { patterns: ['Daniel Island', '480 Seven'], projectName: '480 Seven Farms Dr' },
  { patterns: ['Deep River', '68 S'], projectName: '2801 NC Hwy 68 S' },
  { patterns: ['DHI North Charleston', 'Preliminary Model - DHI'], projectName: 'Dorchester Rd, North Charleston, NC 29418' },
  { patterns: ['Dorchester Land Sale Deck'], projectName: 'Dorchester Rd, North Charleston, NC 29418' },
  { patterns: ['E President St', 'President Square', '925 E President'], projectName: '925 E President St' },
  { patterns: ['Sheraton Court', 'Sheraton Ct', 'Sheraton CT', 'Sheraton Court - Greensboro'], projectName: 'Sheraton CT' },
  { patterns: ['Johns Island', '11222 Johns Island River'], projectName: '1868 River Rd, Johns Island, SC 29455' },
  { patterns: ['Kannapolis', 'Loop Rd - Kannapolis'], projectName: 'Loop Rd' },
  { patterns: ['Okelly Chapel', 'Okelly Chapel Rd'], projectName: '7420 Okelly Chapel Rd Cary, NC 27519' },
  { patterns: ['Sheep Island'], projectName: 'Sheep Island Rd' },
  { patterns: ['RedStone', 'Indian Land'], projectName: 'Opportunity Dr, Indian Land, SC 29707' },
  { patterns: ['W Ashley Circle', 'W Ashley Circle.kmz', 'The Exchange - WA Circle', 'Preliminary Model - W Ashley Circle'], projectName: 'W Ashley Circle' },
  { patterns: ['West Ashley - Whitfield'], projectName: 'W Wildcat Blvd' },
  { patterns: ['cad-1 - SC Charleston', 'W Ashley Cir'], projectName: 'W Ashley Circle' },
  { patterns: ['Wendell Commerce', 'Wendell_Wendell Commerce'], projectName: '2016 Rolling Pines Lane, Wendell, NC 27591' },
  { patterns: ['Monticello', 'Weaverville Site'], projectName: 'Monticello Commons Drive' },
  { patterns: ['Rush St', 'JLL Rush', 'Rush Street - South Raleigh'], projectName: '120 Rush Street' },
  { patterns: ['Charlotte Research Park', 'Heights at RP'], projectName: '8740 Research Park Dr' },
  { patterns: ['Childress Klein Summerville'], projectName: 'Corner of Berlin G. Myers Pkwy & 9th St.' },
  { patterns: ['2643 Hwy 41', '2653 US 41', 'Clements Ferry, Wando'], projectName: '2643 Hwy 41, Wando, SC 29492' },
  { patterns: ['1021 N Front'], projectName: '1021 N Front Street' },
  { patterns: ['Indian Trail', 'Moser Site'], projectName: 'E Independence Blvd' },
  { patterns: ['Atrium Health', 'University City hospital'], projectName: '239 W Mallard Creek Church Rd, Charlotte, NC 28262' },
  { patterns: ['Annexation and Zoning Information for City of Columbia'], projectName: '450 Lake Murray Blbd' },
  { patterns: ['Bridford Pkwy'], projectName: '5401 W Gate City Blvd, Greensboro, NC 27407' },
  { patterns: ['South Cary', 'South Cary Site'], projectName: '7420 Okelly Chapel Rd Cary, NC 27519' },
  { patterns: ['Streets at Southpoint', 'Southpoint'], projectName: '8060 Renaissance Pkwy' },
  { patterns: ['Site Plan Exhibit 5.28.24', 'Site Plan Exhibit 5.28.24.pdf'], projectName: '1450 Meeting St' },
  { patterns: ['25031 Greenville Conceptual'], projectName: '300 Easley Bridge Rd' },
  { patterns: ['University Area Sales Comps'], projectName: '239 W Mallard Creek Church Rd, Charlotte, NC 28262' },
  { patterns: ['Sheraton Ct. Land Comps'], projectName: 'Sheraton CT' },
  { patterns: ['The Heights at RP'], projectName: '8740 Research Park Dr' },
];

function matchFileToProjectName(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  for (const { patterns, projectName } of FILE_TO_PROJECT_NAME) {
    for (const p of patterns) {
      if (lower.includes(p.toLowerCase())) return projectName;
    }
  }
  return null;
}

async function getDealsFromApi(): Promise<{ DealPipelineId: number; ProjectName: string; RegionName?: string }[]> {
  const url = `${API_BASE_URL}/api/pipeline/deal-pipeline`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (API_TOKEN) headers['Authorization'] = `Bearer ${API_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) throw new Error('API did not return success or data array');
  return json.data;
}

async function uploadFileToDeal(dealId: number, filePath: string, fileName: string): Promise<void> {
  const url = `${API_BASE_URL}/api/pipeline/deal-pipeline/${dealId}/attachments`;
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([buffer]), fileName);
  const headers: Record<string, string> = {};
  if (API_TOKEN) headers['Authorization'] = `Bearer ${API_TOKEN}`;
  const res = await fetch(url, { method: 'POST', body: form, headers });
  if (!res.ok) {
    const text = await res.text();
    let errMsg = `API ${res.status}: ${res.statusText}`;
    try {
      const j = JSON.parse(text);
      if (j?.error?.message) errMsg = j.error.message;
    } catch (_) {}
    throw new Error(errMsg);
  }
}

async function main() {
  if (!fs.existsSync(FILES_DIR)) {
    console.error('Folder not found:', FILES_DIR);
    process.exit(1);
  }
  const files = fs.readdirSync(FILES_DIR).filter((f) => {
    const full = path.join(FILES_DIR, f);
    return fs.statSync(full).isFile();
  });
  if (files.length === 0) {
    console.log('No files in folder.');
    process.exit(0);
  }

  console.log('Fetching deals from API:', API_BASE_URL);
  const deals = await getDealsFromApi();
  const carolinasDeals = deals.filter(
    (d) => (d.RegionName || (d as { Region?: string }).Region) === 'Carolinas'
  );
  const projectNameToDealId = new Map<string, number>();
  for (const d of carolinasDeals) {
    projectNameToDealId.set(d.ProjectName, d.DealPipelineId);
  }
  console.log(`Found ${carolinasDeals.length} Carolinas deal(s).\n`);

  const matched: { file: string; projectName: string; dealId: number }[] = [];
  const unmatched: string[] = [];
  const matchedNoDeal: { file: string; projectName: string }[] = [];

  for (const file of files) {
    const projectName = matchFileToProjectName(file);
    if (!projectName) {
      unmatched.push(file);
      continue;
    }
    const dealId = projectNameToDealId.get(projectName);
    if (dealId == null) {
      matchedNoDeal.push({ file, projectName });
      continue;
    }
    matched.push({ file, projectName, dealId });
  }

  if (matchedNoDeal.length > 0) {
    console.log(`Matched to a deal name but deal not in API (seed Carolinas first): ${matchedNoDeal.length}`);
    matchedNoDeal.slice(0, 15).forEach(({ file, projectName }) => console.log(`  ${file} → ${projectName}`));
    if (matchedNoDeal.length > 15) console.log(`  ... and ${matchedNoDeal.length - 15} more`);
  }

  let uploaded = 0;
  let errors = 0;
  for (const { file, projectName, dealId } of matched) {
    const srcPath = path.join(FILES_DIR, file);
    try {
      await uploadFileToDeal(dealId, srcPath, file);
      uploaded++;
      if (uploaded <= 20 || uploaded % 30 === 0) {
        console.log(`  Attached: ${file} → ${projectName}`);
      }
    } catch (e: unknown) {
      errors++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  Error ${file}: ${msg}`);
    }
  }

  console.log('\n---');
  console.log(`Attached: ${uploaded} files`);
  console.log(`Errors: ${errors}`);
  if (unmatched.length > 0) {
    console.log('\nNo match (please assign or ignore):');
    unmatched.forEach((f) => console.log(`  - ${f}`));
  }
  console.log('\nTo add more matches, edit FILE_TO_PROJECT_NAME in scripts/attach-carolinas-pipeline-files.ts.');
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
