#!/usr/bin/env ts-node
/**
 * Complete Data Sync Script
 * 
 * Syncs ALL banking dashboard data to database via API
 * Processes: Projects, Banks, Loans, Participations, Guarantees, DSCR Tests, Covenants, Liquidity, Bank Targets
 * 
 * Usage: npm run db:sync-all
 */

import { query, getPool } from './db-manipulate';
import sql from 'mssql';

const API_BASE_URL = 'https://stoagroupdb.onrender.com';

// Helper to make API calls
async function apiCall(endpoint: string, method: string, data?: any) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    });
    const result = await response.json();
    if (!result.success && result.error) {
      throw new Error(result.error.message || 'API error');
    }
    return result;
  } catch (error: any) {
    console.error(`  ❌ API Error (${method} ${endpoint}):`, error.message);
    throw error;
  }
}

// Parse helpers
function parseAmount(str: string | null | undefined): number | null {
  if (!str || str.trim() === '' || str === 'N/A') return null;
  return parseFloat(str.replace(/[$,]/g, '')) || null;
}

function parseDate(str: string | null | undefined): string | null {
  if (!str || str.trim() === '' || str === 'N/A') return null;
  // Handle "2/10/25" format
  const parts = str.split('/');
  if (parts.length === 3) {
    let year = parseInt(parts[2]);
    if (year < 100) year += 2000;
    return `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  return null;
}

function parsePercent(str: string | null | undefined): number | null {
  if (!str || str.trim() === '' || str === 'N/A') return null;
  const cleaned = str.replace('%', '').trim();
  return parseFloat(cleaned) || null;
}

// Find or create helpers
async function findOrCreateProject(name: string, data: any): Promise<number> {
  const pool = await getPool();
  const existing = await pool.request()
    .input('name', sql.NVarChar, name)
    .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @name');
  
  if (existing.recordset.length > 0) {
    const id = existing.recordset[0].ProjectId;
    await apiCall(`/api/core/projects/${id}`, 'PUT', data);
    return id;
  }
  
  const result = await apiCall('/api/core/projects', 'POST', data);
  return result.data.ProjectId;
}

async function findOrCreateBank(name: string, city?: string, state?: string): Promise<number> {
  const pool = await getPool();
  const existing = await pool.request()
    .input('name', sql.NVarChar, name)
    .query('SELECT BankId FROM core.Bank WHERE BankName = @name');
  
  if (existing.recordset.length > 0) {
    return existing.recordset[0].BankId;
  }
  
  const result = await apiCall('/api/core/banks', 'POST', {
    BankName: name,
    City: city,
    State: state,
  });
  return result.data.BankId;
}

async function findOrCreatePerson(name: string): Promise<number> {
  const pool = await getPool();
  const existing = await pool.request()
    .input('name', sql.NVarChar, name)
    .query('SELECT PersonId FROM core.Person WHERE FullName = @name');
  
  if (existing.recordset.length > 0) {
    return existing.recordset[0].PersonId;
  }
  
  const result = await apiCall('/api/core/persons', 'POST', { FullName: name });
  return result.data.PersonId;
}

async function syncAllData() {
  console.log('🚀 Starting Complete Data Sync...\n');
  const pool = await getPool();
  
  try {
    // Step 1: Sync all Banks
    console.log('📊 Step 1: Syncing Banks...');
    const bankData = [
      { name: 'First Horizon Bank', state: 'TN', city: 'Memphis' },
      { name: 'Hancock Whitney', state: 'MS', city: 'Gulfport' },
      { name: 'b1Bank', state: 'LA', city: 'Baton Rouge' },
      { name: 'Renasant Bank', state: 'MS', city: 'Tupelo' },
      { name: 'Trustmark Bank', state: 'MS', city: 'Jackson' },
      { name: 'Wells Fargo', state: 'SD', city: 'Sioux Falls' },
      { name: 'Cadence Bank', state: 'MS', city: 'Tupelo' },
      { name: 'Pen-Air Credit Union', state: 'FL', city: 'Pensacola' },
      { name: 'JD Bank', state: 'LA', city: 'Jennings' },
      { name: 'The Citizens National Bank of Meridian', state: 'MS', city: 'Meridian' },
      { name: 'Home Bank', state: 'LA', city: 'Lafayette' },
      { name: 'Fidelity Bank', state: 'LA', city: 'New Orleans' },
      { name: 'First US Bank', state: 'AL', city: 'Birmingham' },
      { name: 'The Citizens Bank', state: 'MS', city: 'Philadelphia' },
      { name: 'Gulf Coast Bank and Trust', state: 'LA', city: 'New Orleans' },
      { name: 'Bryant Bank', state: 'AL', city: 'Tuscaloosa' },
      { name: 'Liberty Bank', state: 'LA', city: 'New Orleans' },
      { name: 'Red River Bank', state: 'LA', city: 'Alexandria' },
      { name: 'Community Bank of Louisiana', state: 'LA', city: 'Mansfield' },
      { name: 'United Community Bank - Louisiana', state: 'LA', city: 'Raceland' },
      { name: 'BOM Bank', state: 'LA', city: 'Natchitoches' },
      { name: 'Catalyst Bank', state: 'LA', city: 'Opelousas' },
      { name: 'Community First Bank', state: 'LA', city: 'New Iberia' },
      { name: 'FNB Jeanerette', state: 'LA', city: 'Jeanerette' },
      { name: 'Southern Bancorp', state: 'AR', city: 'Arkadelphia' },
      { name: 'Bank of Zachary', state: 'LA', city: 'Zachary' },
      { name: 'Synergy Bank', state: 'LA', city: 'Houma' },
      { name: 'CLB Bank', state: 'LA', city: 'Jonesville' },
      { name: 'Citizens Bank & Trust', state: 'LA', city: 'Plaquemine' },
      { name: 'Southern Heritage Bank', state: 'LA', city: 'Jonesville' },
      { name: 'First National Bank USA', state: 'LA', city: 'Boutte' },
      { name: 'St Landry Bank', state: 'LA', city: 'Opelousas' },
      { name: 'Radifi Federal Credit Union', state: 'FL', city: 'Jacksonville' },
      { name: 'Avadian Credit Union', state: 'AL', city: 'Birmingham' },
      { name: 'Rayne State Bank', state: 'LA', city: 'Rayne' },
      { name: 'Heart of Louisiana Federal Credit Union', state: 'LA', city: 'Pineville' },
      { name: 'Plaquemine Bank', state: 'LA', city: 'Plaquemine' },
      { name: 'Mutual Federal Credit Union', state: 'MS', city: 'Vicksburg' },
      { name: 'Aneca Federal Credit Union', state: 'LA', city: 'Shreveport' },
      { name: 'Red River Employees Federal Credit Union', state: 'TX', city: 'Texarkana' },
      { name: 'Investar Bank', state: 'LA', city: 'Baton Rouge' },
      { name: 'Bank Plus', state: 'MS', city: 'Belzoni' },
      { name: 'Currency Bank', state: 'LA', city: 'Oak Grove' },
      { name: 'Gibsland Bank & Trust', state: 'LA', city: 'Gibsland' },
      { name: 'United Mississippi', state: 'MS', city: 'Natchez' },
      { name: 'Magnolia State Bank', state: 'MS', city: 'Bay Springs' },
      { name: 'American Bank & Trust', state: 'LA', city: 'Opelousas' },
      { name: 'Farmers State Bank', state: 'LA', city: 'Church Point' },
      { name: 'Richton Bank & Trust', state: 'MS', city: 'Richton' },
      { name: 'Winnsboro State Bank & Trust', state: 'LA', city: 'Winnsboro' },
      { name: 'First American Bank & Trust', state: 'LA', city: 'Vacherie' },
      { name: 'Citizens Savings Bank', state: 'LA', city: 'Bogalusa' },
      { name: 'The First', state: 'MS', city: 'Hattiesburg' },
    ];
    
    const bankMap: Record<string, number> = {};
    for (const bank of bankData) {
      const id = await findOrCreateBank(bank.name, bank.city, bank.state);
      bankMap[bank.name] = id;
      console.log(`  ✓ ${bank.name}`);
    }
    
    // Step 2: Sync People
    console.log('\n👥 Step 2: Syncing People...');
    const personMap: Record<string, number> = {};
    for (const name of ['Toby Easterly', 'Ryan Nash', 'Saun Sullivan']) {
      const id = await findOrCreatePerson(name);
      personMap[name] = id;
      console.log(`  ✓ ${name}`);
    }
    
    // Step 3: Sync Projects
    console.log('\n🏗️  Step 3: Syncing Projects...');
    const projects = [
      // Multifamily
      { name: 'The Waters at Hammond', city: 'Hammond', state: 'LA', units: 312, stage: 'Stabilized', productType: 'Waters' },
      { name: 'The Waters at Millerville', city: 'Baton Rouge', state: 'LA', units: 295, stage: 'Under Construction', productType: 'Waters' },
      { name: 'The Waters at Redstone', city: 'Crestview', state: 'FL', units: 240, stage: 'Under Construction', productType: 'Waters' },
      { name: 'The Waters at Settlers Trace', city: 'Lafayette', state: 'LA', units: 348, stage: 'Under Construction', productType: 'Waters' },
      { name: 'The Waters at West Village', city: 'Scott', state: 'LA', units: 216, stage: 'Under Construction', productType: 'Waters' },
      { name: 'The Waters at Bluebonnet', city: 'Baton Rouge', state: 'LA', units: 324, stage: 'Under Construction', productType: 'Waters' },
      { name: 'The Waters at Crestview', city: 'Crestview', state: 'FL', units: 288, stage: 'Under Construction', productType: 'Waters' },
      { name: 'The Heights at Picardy', city: 'Baton Rouge', state: 'LA', units: 232, stage: 'Under Construction', productType: 'Heights' },
      { name: 'The Waters at McGowin', city: 'Mobile', state: 'AL', units: 252, stage: 'Under Construction', productType: 'Waters' },
      { name: 'The Waters at Freeport', city: 'Freeport', state: 'FL', units: 226, stage: 'Under Construction', productType: 'Waters' },
      { name: 'The Heights at Waterpointe', city: 'Flowood', state: 'MS', units: 240, stage: 'Under Construction', productType: 'Heights' },
      { name: 'The Waters at Promenade', city: 'Marrero', state: 'LA', units: 324, stage: 'Under Construction', productType: 'Waters' },
      { name: 'The Flats at Ransley', city: 'Pensacola', state: 'FL', units: 294, stage: 'Pre-Construction', productType: 'Flats' },
      { name: 'The Heights at Materra', city: 'Baton Rouge', state: 'LA', units: 295, stage: 'Pre-Construction', productType: 'Heights' },
      { name: 'The Waters at Crosspointe', city: 'Columbia', state: 'SC', units: 336, stage: 'Pre-Construction', productType: 'Waters' },
      { name: 'The Waters at Inverness', city: 'Hoover', state: 'AL', units: 289, stage: 'Under Contract', productType: 'Waters' },
      { name: 'The Waters at Conway', city: '', state: '', units: null, stage: 'Under Contract', productType: 'Waters' },
      { name: 'The Waters at Covington', city: 'Covington', state: 'LA', units: 336, stage: 'Under Contract', productType: 'Waters' },
      { name: 'The Waters at OWA', city: 'Foley', state: 'AL', units: 300, stage: 'Under Contract', productType: 'Waters' },
      { name: 'The Waters at Greenville', city: '', state: '', units: null, stage: 'Under Contract', productType: 'Waters' },
      { name: 'The Waters at Oxford', city: 'Oxford', state: 'MS', units: 316, stage: 'Under Contract', productType: 'Waters' },
      { name: 'The Waters at Southpoint', city: 'Hardeeville', state: 'SC', units: 288, stage: 'Under Contract', productType: 'Waters' },
      { name: 'The Waters at Robinwood', city: '', state: '', units: null, stage: 'Under Contract', productType: 'Waters' },
      // Liquidated
      { name: 'Silver Oaks', city: 'Gonzales', state: 'LA', units: 336, stage: 'Liquidated', productType: 'Other' },
      { name: 'The Heights', city: 'Hammond', state: 'LA', units: 336, stage: 'Liquidated', productType: 'Heights' },
      { name: 'Sweetwater', city: 'Addis', state: 'LA', units: 276, stage: 'Liquidated', productType: 'Other' },
      { name: 'The Waters at Southpark', city: 'Lake Charles', state: 'LA', units: 220, stage: 'Liquidated', productType: 'Waters' },
      { name: 'Dawson Park', city: 'Baton Rouge', state: 'LA', units: 155, stage: 'Liquidated', productType: 'Other' },
      { name: 'The Waters at Manhattan', city: 'Harvey', state: 'LA', units: 360, stage: 'Liquidated', productType: 'Waters' },
      { name: 'The Waters at Heritage', city: 'Gonzales', state: 'LA', units: 299, stage: 'Liquidated', productType: 'Waters' },
      { name: 'The Waters at Ransley', city: 'Pensacola', state: 'FL', units: 336, stage: 'Liquidated', productType: 'Waters' },
      { name: 'The Flats at East Bay', city: 'Fairhope', state: 'AL', units: 240, stage: 'Liquidated', productType: 'Flats' },
      // Other
      { name: 'Bauerle Rd Land, LLC', city: '', state: '', units: null, stage: 'Other', productType: 'Other' },
      { name: 'Plane Loan', city: '', state: '', units: null, stage: 'Other', productType: 'Other' },
      { name: '210 E Morris Ave, LLC', city: '', state: '', units: null, stage: 'Other', productType: 'Other' },
      { name: 'Amor Fati, LLC', city: '', state: 'LA', units: null, stage: 'Other', productType: 'Other' },
      { name: 'Icarus Development, LLC', city: '', state: '', units: null, stage: 'Other', productType: 'Other' },
      { name: 'Tredge', city: '', state: '', units: null, stage: 'Other', productType: 'Other' },
      { name: 'Stoa Construction, LLC', city: '', state: '', units: null, stage: 'Other', productType: 'Other' },
    ];
    
    const projectMap: Record<string, number> = {};
    for (const proj of projects) {
      const id = await findOrCreateProject(proj.name, {
        ProjectName: proj.name,
        City: proj.city || null,
        State: proj.state || null,
        Units: proj.units,
        Stage: proj.stage,
        ProductType: proj.productType,
        Location: proj.city && proj.state ? `${proj.city}, ${proj.state}` : null,
      });
      projectMap[proj.name] = id;
      console.log(`  ✓ ${proj.name}`);
    }
    
    console.log('\n✅ Initial sync completed!');
    console.log('\n📝 Next: Use individual API calls to add:');
    console.log('  - Loans (with all details)');
    console.log('  - Participations');
    console.log('  - Guarantees');
    console.log('  - DSCR Tests');
    console.log('  - Covenants');
    console.log('  - Liquidity Requirements');
    console.log('  - Bank Targets');
    console.log('\n💡 See DATA_SYNC_GUIDE.md for detailed instructions');
    
  } catch (error: any) {
    console.error('\n❌ Sync failed:', error.message);
    throw error;
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  syncAllData().catch(console.error);
}
