#!/usr/bin/env ts-node
/**
 * Attach files from data/GULFCOASTPIPELINEFILES to the corresponding deal pipeline
 * records via the API. Matches filenames to deals by keyword rules.
 * Uses POST /api/pipeline/deal-pipeline/:id/attachments (multipart "file"); the API
 * handles DB and Azure Blob.
 *
 * Usage: npm run db:attach-gulf-coast-files
 * Prereq: Gulf Coast deals seeded, API running. Set API_BASE_URL (default http://localhost:3000), optional API_TOKEN.
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load api/.env then repo root .env (root has all secrets; scripts run from api/)
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const API_BASE_URL = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_TOKEN = process.env.API_TOKEN || process.env.JWT_TOKEN || '';

const FILES_DIR = path.resolve(__dirname, '../../data/GULFCOASTPIPELINEFILES');

// Match filename (case-insensitive) by substring → ProjectName (Site from Gulf Coast CSV)
const FILE_TO_PROJECT_NAME: { patterns: string[]; projectName: string }[] = [
  { patterns: ['Clara Ave', 'Clara Ave 392A', '293A'], projectName: 'Clara Ave 392A' },
  { patterns: ['Riverwalk', 'Port Orange', 'Daytona Apartments', 'Daytona Beach'], projectName: 'Riverwalk - Port Orange' },
  { patterns: ['Holly Grove', 'Ocean Springs.kmz'], projectName: 'Holly Grove' },
  { patterns: ['Slavia Rd', 'Slavia Rd - Oviedo', 'Oviedo'], projectName: 'Slavia Rd - Oviedo' },
  { patterns: ['I-10 / Louisiana', 'I-49 Lafayette', 'Louisiana Ave', 'LAMAR BLVD', 'Lamar Blvd'], projectName: 'I-10 / Louisiana Ave' },
  { patterns: ['West Pace Village', 'West Pace'], projectName: 'West Pace Village' },
  { patterns: ['South Malbis'], projectName: 'South Malbis' },
  { patterns: ['Gateway Development'], projectName: 'Gateway Development' },
  { patterns: ['Wildlight'], projectName: 'Wildlight' },
  { patterns: ['Craft Goodman', 'CRAFT PROPERTY LAYOUT'], projectName: 'Craft Goodman Rd' },
  { patterns: ['Spanish Fort', 'Loxley'], projectName: 'Spanish Fort/Loxley' },
  { patterns: ['Bon Secour'], projectName: 'Bon Secour' },
  { patterns: ['Bannerman Flyer', 'Bannerman'], projectName: 'Bannerman' },
  { patterns: ['Saraland'], projectName: 'Saraland Crossings' },
  { patterns: ['Canal Road - Will Mills', 'Will Mills'], projectName: 'Canal Road - Will Mills' },
  { patterns: ['Dauphin Way'], projectName: 'Dauphin Way' },
  { patterns: ['Canal Road - Dane', 'Dane Haywood', 'Dane Haywood'], projectName: 'Canal Road - Dane Haywood' },
  { patterns: ['Esplanade Mall'], projectName: 'Esplanade Mall' },
  { patterns: ['Waters at Freeport Phase II', 'Freeport Phase II'], projectName: 'Waters at Freeport Phase II' },
  { patterns: ['Newberry Village'], projectName: 'Newberry Village' },
  { patterns: ['Downtown Tally', 'Downtown Tallahassee', 'KrogerCenter', 'Kroger Center - North Complex', 'Kroger Center North'], projectName: 'Downtown Tally' },
  { patterns: ['NW 39th Ave', 'NW 39th', '39th Ave Gainesville'], projectName: 'NW 39th Ave' },
  { patterns: ['Perryman Hill', 'Perryman Hill Publix'], projectName: 'Perryman Hill Publix' },
  { patterns: ['St Johns Parkway', 'St Johns Pkwy', '3rd Wave Dev; St Johns'], projectName: 'St Johns Parkway' },
  { patterns: ['Weir Property'], projectName: 'Weir Property' },
  { patterns: ['Harveston'], projectName: 'Harveston' },
  { patterns: ['Hopeton Landing'], projectName: 'Hopeton Landing' },
  { patterns: ['Hardwick Farms'], projectName: 'Hardwick Farms' },
  { patterns: ['Merrill Land Trust', 'Merrill Henderson Navarre', 'Merrill Navarre'], projectName: 'Merrill Land Trust' },
  { patterns: ['Dove Park Rd'], projectName: 'Dove Park Rd' },
  { patterns: ['Ruckel Properties'], projectName: 'Ruckel Properties' },
  { patterns: ['The Waters at Sweetbay', 'Waters at Sweetbay', 'Sweetbay'], projectName: 'The Waters at Sweetbay' },
  { patterns: ['Heights at Fort Walton', 'Fort Walton Beach'], projectName: 'Heights at Fort Walton Beach' },
  { patterns: ['Flats at Cahaba', 'Cahaba Valley'], projectName: 'Flats at Cahaba Valley' },
  { patterns: ['Waters at Bartlett'], projectName: 'Waters at Bartlett' },
  { patterns: ['Waters at OWA', 'OWA Site', 'WAMobile', 'WA Mobile'], projectName: 'Waters at OWA' },
  { patterns: ['The Waters at Covington', 'Waters at Covington'], projectName: 'The Waters at Covington' },
  { patterns: ['Conway'], projectName: 'Conway' },
  { patterns: ['The Waters at Inverness', 'Waters at Inverness'], projectName: 'The Waters at Inverness' },
  { patterns: ['The Waters at Materra', 'Waters at Materra', 'Preliminary Model - The Waters at Materra'], projectName: 'The Waters at Materra' },
  { patterns: ['The Heights at Waterpointe', 'Heights at Waterpointe', 'Waterpointe'], projectName: 'The Heights at Waterpointe' },
  { patterns: ['The Waters at Promenade', 'Waters at Promenade'], projectName: 'The Waters at Promenade' },
  { patterns: ['Crosspointe', 'Crosspointe Columbia'], projectName: 'Crosspointe' },
  { patterns: ['The Waters at Crestview', 'Waters at Crestview', 'Crestview'], projectName: 'The Waters at Crestview' },
  { patterns: ['The Flats at East Bay', 'Flats at East Bay', 'East Bay'], projectName: 'The Flats at East Bay' },
  { patterns: ['The Waters at Millerville', 'Waters at Millerville', 'Millerville'], projectName: 'The Waters at Millerville' },
  { patterns: ['The Waters at Heritage', 'Waters at Heritage', 'Waters at Heritage KMZ'], projectName: 'The Waters at Heritage' },
  { patterns: ['The Waters at Redstone', 'Waters at Redstone', 'Redstone KMZ', 'Redstone'], projectName: 'The Waters at Redstone' },
  { patterns: ['The Heights at Picardy', 'Waters at Picardy', 'Heights at Picardy'], projectName: 'The Heights at Picardy' },
  { patterns: ['The Waters at Ransley', 'Ransley Part 2', 'Ransley II'], projectName: 'The Waters at Ransley II' },
  { patterns: ['The Waters at Freeport', 'Waters at Freeport'], projectName: 'The Waters at Freeport' },
  { patterns: ['The Waters at McGowin', 'McGowin'], projectName: 'The Waters at McGowin' },
  { patterns: ['The Waters at Bluebonnet', 'Bluebonnet'], projectName: 'The Waters at Bluebonnet' },
  { patterns: ['The Waters at Settlers Trace', 'Settlers Trace'], projectName: 'The Waters at Settlers Trace' },
  { patterns: ['The Waters at West Village', 'West Village Lafayette'], projectName: 'The Waters at West Village' },
  { patterns: ['Bluffs at Lafayette', 'Bluffs_at_Lafayette'], projectName: 'Bluffs at Lafayette' },
  { patterns: ['Eastern Shore Center'], projectName: 'Eastern Shore Center' },
  { patterns: ['Village Oaks', 'Village Oaks_11.6'], projectName: 'Village Oaks' },
  { patterns: ['Bearing Point', 'Bearing Pointe', 'Westmore (Bearing Pointe)'], projectName: 'Westmore (Bearing Pointe)' },
  { patterns: ['BLK Mobile Highway', 'BLK Mobile', 'Mobile Highway Pensacola'], projectName: 'BLK Mobile Highway' },
  { patterns: ['Bearing Point Airport Rd'], projectName: 'Bearing Point Airport Rd' },
  { patterns: ['Durbin Park', 'Durbin Park Multifamily'], projectName: 'Durbin Park' },
  { patterns: ['Lakeshore Development', 'Lakeshore Village', 'Lakeshore Villages'], projectName: 'Lakeshore Village' },
  { patterns: ['Long Farm', 'Long Farm MF Site'], projectName: 'Long Farm' },
  { patterns: ['Preliminary Model - Bass Pro', 'Bass Pro'], projectName: 'Bass Pro' },
  { patterns: ['Peach Blossom #1', 'Warner Robins GA'], projectName: 'Peach Blossom #1' },
  { patterns: ['Peach Blossom #2'], projectName: 'Peach Blossom #2' },
  { patterns: ['Hwy 96 Warner Robins'], projectName: 'Hwy 96 Warner Robins' },
  { patterns: ['Kroger Center - North Complex', 'KrogerCenter'], projectName: 'Kroger Center - North Complex' },
  { patterns: ['Town Center at Palm Coast', 'Palm Coast'], projectName: 'Town Center at Palm Coast' },
  { patterns: ['The Landing at Beaver Creek', 'Landing at Beaver Creek'], projectName: 'The Landing at Beaver Creek' },
  { patterns: ['Summers Corner', 'Summers Corner Residential'], projectName: 'Summers Corner' },
  { patterns: ['Keller Master Plan', 'Keller Master Plan Pooler'], projectName: 'Keller Master Plan' },
  { patterns: ['Rowan Oak', 'Rowan Oak - PUD'], projectName: 'Rowan Oak' },
  { patterns: ['Roscoe Rd v2', 'Orange Beach - Roscoe Rd'], projectName: 'Orange Beach - Roscoe Rd' },
  { patterns: ['Juniper Street Apartments', 'Juniper Street Foley'], projectName: 'Juniper Street Apartments' },
  { patterns: ['Greengate Northpark', 'Northpark Phase IV'], projectName: 'Greengate Northpark' },
  { patterns: ['East Garden District', 'The Heights at East Garden'], projectName: 'The Heights at East Garden' },
  { patterns: ['Chalmette Sites'], projectName: 'Chalmette' },
  { patterns: ['161 Prop'], projectName: '161 Prop' },
  { patterns: ['Ocean Springs'], projectName: 'Ocean Springs' },
  { patterns: ['WANG_WetlandsExhibit', 'WetlandsExhibit'], projectName: 'Waters at Freeport Phase II' },
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

async function getDealsFromApi(): Promise<{ DealPipelineId: number; ProjectName: string }[]> {
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
  const projectNameToDealId = new Map<string, number>();
  for (const d of deals) {
    projectNameToDealId.set(d.ProjectName, d.DealPipelineId);
  }
  console.log(`Found ${deals.length} deal(s).\n`);

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
    console.log(`Matched to a deal name but deal not in API (seed Gulf Coast first): ${matchedNoDeal.length}`);
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
      if (uploaded <= 20 || uploaded % 50 === 0) {
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
    console.log(`\nNo match (ignored per request): ${unmatched.length} files`);
    unmatched.slice(0, 30).forEach((f) => console.log(`  - ${f}`));
    if (unmatched.length > 30) console.log(`  ... and ${unmatched.length - 30} more`);
  }
  console.log('\nTo add more matches, edit FILE_TO_PROJECT_NAME in scripts/attach-gulf-coast-pipeline-files.ts.');
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
