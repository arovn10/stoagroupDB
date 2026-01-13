#!/usr/bin/env ts-node
/**
 * Update Bank Profiles
 * 
 * Updates bank profiles with Hold Limit, Per Deal Limit, Notes, Deposits, and HQ State
 * 
 * Usage:
 *   npm run db:update-banks
 */

import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';

// Load environment variables
const possibleEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../../.env'),
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  if (existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      envLoaded = true;
      console.log(`✅ Loaded .env from: ${envPath}`);
      break;
    }
  }
}

if (!envLoaded) {
  dotenv.config();
}

// Validate required environment variables
if (!process.env.DB_SERVER || !process.env.DB_DATABASE || !process.env.DB_USER || !process.env.DB_PASSWORD) {
  console.error('❌ Missing required environment variables!');
  process.exit(1);
}

const config: sql.config = {
  server: process.env.DB_SERVER!,
  database: process.env.DB_DATABASE!,
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    enableArithAbort: true,
  },
};

async function getPool(): Promise<sql.ConnectionPool> {
  try {
    const pool = await sql.connect(config);
    console.log('✅ Connected to database');
    return pool;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

// Bank data from the table
const bankData: Array<{
  hqState: string;
  bankName: string;
  holdLimit: number | null;
  perDealLimit: number | null;
  notes: string | null;
  deposits: number | null;
}> = [
  { hqState: 'TN', bankName: 'First Horizon Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'MS', bankName: 'Hancock Whitney', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'b1Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 3318891 },
  { hqState: 'MS', bankName: 'Renasant Bank', holdLimit: 85000000, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'MS', bankName: 'Trustmark Bank', holdLimit: 80000000, perDealLimit: 25000000, notes: 'Also have NRE loan', deposits: 1750139 },
  { hqState: 'SD', bankName: 'Wells Fargo', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'MS', bankName: 'Cadence Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'FL', bankName: 'Pen-Air Credit Union', holdLimit: 45000000, perDealLimit: 15000000, notes: 'Navy Federal Credit Backing', deposits: 0 },
  { hqState: 'LA', bankName: 'JD Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 753581 },
  { hqState: 'MS', bankName: 'The Citizens National Bank of Meridian', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Home Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 782837 },
  { hqState: 'LA', bankName: 'Fidelity Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'AL', bankName: 'First US Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'MS', bankName: 'The Citizens Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Gulf Coast Bank and Trust', holdLimit: null, perDealLimit: null, notes: null, deposits: 700000 },
  { hqState: 'AL', bankName: 'Bryant Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Liberty Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Red River Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Community Bank of Louisiana', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'United Community Bank - Louisiana', holdLimit: 12000000, perDealLimit: null, notes: 'N/A', deposits: 0 },
  { hqState: 'LA', bankName: 'BOM Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Catalyst Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Community First Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'FNB Jeanerette', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'AR', bankName: 'Southern Bancorp', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Bank of Zachary', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Synergy Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 1 },
  { hqState: 'LA', bankName: 'CLB Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Citizens Bank & Trust', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Southern Heritage Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'First National Bank USA', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'St Landry Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'FL', bankName: 'Radifi Federal Credit Union', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'AL', bankName: 'Avadian Credit Union', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Rayne State Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Heart of Louisiana Federal Credit Union', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Plaquemine Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'MS', bankName: 'Mutual Federal Credit Union', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Aneca Federal Credit Union', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'TX', bankName: 'Red River Employees Federal Credit Union', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Investar Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 1027850 },
  { hqState: 'MS', bankName: 'Bank Plus', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Currency Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Gibsland Bank & Trust', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'MS', bankName: 'United Mississippi', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'MS', bankName: 'Magnolia State Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'American Bank & Trust', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Farmers State Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'MS', bankName: 'Richton Bank & Trust', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Winnsboro State Bank & Trust', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'First American Bank & Trust', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
  { hqState: 'LA', bankName: 'Citizens Savings Bank', holdLimit: null, perDealLimit: null, notes: null, deposits: 0 },
];

async function findBankByName(pool: sql.ConnectionPool, bankName: string): Promise<number | null> {
  // Try exact match first
  let result = await pool.request()
    .input('bankName', sql.NVarChar, bankName)
    .query('SELECT BankId FROM core.Bank WHERE BankName = @bankName');
  
  if (result.recordset.length > 0) {
    return result.recordset[0].BankId;
  }
  
  // Try case-insensitive match
  result = await pool.request()
    .input('bankName', sql.NVarChar, bankName)
    .query('SELECT BankId FROM core.Bank WHERE LOWER(BankName) = LOWER(@bankName)');
  
  if (result.recordset.length > 0) {
    return result.recordset[0].BankId;
  }
  
  // Try partial match (contains)
  result = await pool.request()
    .input('bankName', sql.NVarChar, `%${bankName}%`)
    .query('SELECT BankId, BankName FROM core.Bank WHERE BankName LIKE @bankName');
  
  if (result.recordset.length === 1) {
    return result.recordset[0].BankId;
  }
  
  return null;
}

async function updateBankProfile(
  pool: sql.ConnectionPool,
  bankId: number,
  hqState: string,
  holdLimit: number | null,
  perDealLimit: number | null,
  notes: string | null,
  deposits: number | null
): Promise<void> {
  const fields: string[] = [];
  const request = pool.request().input('bankId', sql.Int, bankId);
  
  if (hqState) {
    fields.push('HQState = @HQState');
    request.input('HQState', sql.NVarChar, hqState);
  }
  
  if (holdLimit !== null) {
    fields.push('HoldLimit = @HoldLimit');
    request.input('HoldLimit', sql.Decimal(18, 2), holdLimit);
  }
  
  if (perDealLimit !== null) {
    fields.push('PerDealLimit = @PerDealLimit');
    request.input('PerDealLimit', sql.Decimal(18, 2), perDealLimit);
  }
  
  if (notes !== null) {
    fields.push('Notes = @Notes');
    request.input('Notes', sql.NVarChar(sql.MAX), notes);
  }
  
  if (deposits !== null) {
    fields.push('Deposits = @Deposits');
    request.input('Deposits', sql.Decimal(18, 2), deposits);
  }
  
  if (fields.length === 0) {
    return; // Nothing to update
  }
  
  await request.query(`
    UPDATE core.Bank
    SET ${fields.join(', ')}
    WHERE BankId = @bankId
  `);
}

async function main(): Promise<void> {
  console.log('🚀 Starting Bank Profile Update...\n');
  
  const pool = await getPool();
  
  try {
    let updated = 0;
    let notFound = 0;
    const notFoundBanks: string[] = [];
    
    for (const bank of bankData) {
      const bankId = await findBankByName(pool, bank.bankName);
      
      if (!bankId) {
        console.log(`  ⚠️  "${bank.bankName}" → NOT FOUND`);
        notFound++;
        notFoundBanks.push(bank.bankName);
        continue;
      }
      
      await updateBankProfile(
        pool,
        bankId,
        bank.hqState,
        bank.holdLimit,
        bank.perDealLimit,
        bank.notes,
        bank.deposits
      );
      
      const updates: string[] = [];
      if (bank.hqState) updates.push(`HQState: ${bank.hqState}`);
      if (bank.holdLimit !== null) updates.push(`HoldLimit: $${bank.holdLimit.toLocaleString()}`);
      if (bank.perDealLimit !== null) updates.push(`PerDealLimit: $${bank.perDealLimit.toLocaleString()}`);
      if (bank.notes) updates.push(`Notes: ${bank.notes}`);
      if (bank.deposits !== null) updates.push(`Deposits: $${bank.deposits.toLocaleString()}`);
      
      console.log(`  ✅ "${bank.bankName}" → ${updates.join(', ') || 'No updates (all null)'}`);
      updated++;
    }
    
    console.log(`\n✅ Updated ${updated} banks`);
    if (notFound > 0) {
      console.log(`  ⚠️  ${notFound} banks not found:`);
      notFoundBanks.forEach(name => console.log(`    - ${name}`));
      console.log('\n💡 Tip: Check bank names in database with:');
      console.log('   SELECT BankName FROM core.Bank ORDER BY BankName');
    }
    
  } catch (error) {
    console.error('❌ Error updating banks:', error);
    process.exit(1);
  } finally {
    await pool.close();
    console.log('🔌 Database connection closed');
  }
}

if (require.main === module) {
  main();
}
