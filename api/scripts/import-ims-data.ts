#!/usr/bin/env ts-node
/**
 * Import IMS Data into Banking Tables
 * 
 * Reads IMS Excel files and imports unique data points into banking tables:
 * - Commitments → banking.EquityCommitment
 * - Investments → banking.EquityCommitment (if applicable)
 * - Capital Calls → May create EquityCommitment records
 * 
 * IMPORTANT: Only creates unique records - checks for existing data before inserting
 * 
 * Usage: npm run db:import-ims
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { getPool } from './db-manipulate';
import sql from 'mssql';

// Helper functions
function parseAmount(str: string | null | undefined): number | null {
  if (!str || str === null || str === undefined) return null;
  const strVal = String(str);
  if (strVal.trim() === '' || strVal === 'N/A' || strVal === '-' || strVal === '$-') return null;
  const cleaned = strVal.replace(/[$,]/g, '').trim();
  if (cleaned === '' || cleaned === '0') return null;
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

function parseDate(str: string | null | undefined): string | null {
  if (!str || str === null || str === undefined) return null;
  const strVal = String(str);
  if (strVal.trim() === '' || strVal === 'N/A' || strVal === '-') return null;
  
  // Handle Excel date serial numbers
  if (typeof str === 'number') {
    // Excel date serial number (days since Jan 1, 1900)
    const excelEpoch = new Date(1900, 0, 1);
    const date = new Date(excelEpoch.getTime() + (str - 2) * 24 * 60 * 60 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  
  const trimmed = strVal.trim();
  
  // Handle ISO date strings
  if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return trimmed;
  }
  
  // Handle dates like "9/24/2024" or "09/24/2024"
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0]);
      const day = parseInt(parts[1]);
      let year = parseInt(parts[2]);
      if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
      if (month < 1 || month > 12) return null;
      if (day < 1 || day > 31) return null;
      if (year < 100) {
        if (year < 50) year += 2000;
        else year += 1900;
      }
      if (year < 1900 || year > 2100) return null;
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  }
  
  return null;
}

function getColumnIndex(headers: string[], name: string): number {
  const index = headers.findIndex(h => h && h.toLowerCase().includes(name.toLowerCase()));
  return index >= 0 ? index : -1;
}

function findColumnIndex(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const index = getColumnIndex(headers, name);
    if (index >= 0) return index;
  }
  return -1;
}

async function getProjectId(pool: sql.ConnectionPool, projectName: string): Promise<number | null> {
  if (!projectName || projectName.trim() === '') return null;
  
  // Try exact match first
  let result = await pool.request()
    .input('name', sql.NVarChar, projectName.trim())
    .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @name');
  
  if (result.recordset.length > 0) {
    return result.recordset[0].ProjectId;
  }
  
  // Try case-insensitive match
  result = await pool.request()
    .input('name', sql.NVarChar, projectName.trim())
    .query('SELECT ProjectId FROM core.Project WHERE LOWER(ProjectName) = LOWER(@name)');
  
  if (result.recordset.length > 0) {
    return result.recordset[0].ProjectId;
  }
  
  // Try partial match (contains)
  result = await pool.request()
    .input('name', sql.NVarChar, `%${projectName.trim()}%`)
    .query('SELECT TOP 1 ProjectId FROM core.Project WHERE ProjectName LIKE @name');
  
  return result.recordset.length > 0 ? result.recordset[0].ProjectId : null;
}

async function getOrCreateEquityPartner(pool: sql.ConnectionPool, partnerName: string, imsInvestorProfileId?: string | null): Promise<number | null> {
  if (!partnerName || partnerName.trim() === '') return null;
  
  const trimmedName = partnerName.trim();
  const trimmedIMSId = imsInvestorProfileId ? imsInvestorProfileId.trim() : null;
  
  // Check if exists by name
  let result = await pool.request()
    .input('name', sql.NVarChar, trimmedName)
    .query('SELECT EquityPartnerId FROM core.EquityPartner WHERE PartnerName = @name');
  
  if (result.recordset.length > 0) {
    const partnerId = result.recordset[0].EquityPartnerId;
    
    // Update IMS ID if provided and not already set
    if (trimmedIMSId) {
      await pool.request()
        .input('EquityPartnerId', sql.Int, partnerId)
        .input('IMSInvestorProfileId', sql.NVarChar(50), trimmedIMSId)
        .query(`
          UPDATE core.EquityPartner
          SET IMSInvestorProfileId = @IMSInvestorProfileId
          WHERE EquityPartnerId = @EquityPartnerId
            AND (IMSInvestorProfileId IS NULL OR IMSInvestorProfileId = '')
        `);
    }
    
    return partnerId;
  }
  
  // Check if exists by IMS ID (if provided)
  if (trimmedIMSId) {
    result = await pool.request()
      .input('imsId', sql.NVarChar(50), trimmedIMSId)
      .query('SELECT EquityPartnerId FROM core.EquityPartner WHERE IMSInvestorProfileId = @imsId');
    
    if (result.recordset.length > 0) {
      // Update name if it's currently an ID
      const partnerId = result.recordset[0].EquityPartnerId;
      await pool.request()
        .input('EquityPartnerId', sql.Int, partnerId)
        .input('PartnerName', sql.NVarChar, trimmedName)
        .query(`
          UPDATE core.EquityPartner
          SET PartnerName = @PartnerName
          WHERE EquityPartnerId = @EquityPartnerId
            AND (PartnerName NOT LIKE '%[^0-9]%' OR LEN(PartnerName) < 6)
        `);
      return partnerId;
    }
  }
  
  // Create new
  result = await pool.request()
    .input('PartnerName', sql.NVarChar, trimmedName)
    .input('IMSInvestorProfileId', sql.NVarChar(50), trimmedIMSId)
    .query(`
      INSERT INTO core.EquityPartner (PartnerName, IMSInvestorProfileId)
      VALUES (@PartnerName, @IMSInvestorProfileId);
      SELECT SCOPE_IDENTITY() AS EquityPartnerId;
    `);
  
  return result.recordset[0].EquityPartnerId;
}

function readExcelFile(filePath: string): any[][] {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
    return data as any[][];
  } catch (error: any) {
    console.error(`  ❌ Error reading Excel file ${filePath}: ${error.message}`);
    return [];
  }
}

async function importCommitments(pool: sql.ConnectionPool, filePath: string) {
  console.log('\n📊 Importing Equity Commitments from IMS...');
  
  const rows = readExcelFile(filePath);
  if (rows.length < 2) {
    console.log('⚠️  No data rows found');
    console.log(`   File has ${rows.length} rows`);
    if (rows.length > 0) {
      console.log(`   Headers: ${JSON.stringify(rows[0])}`);
    }
    return;
  }
  
  const headers = rows[0].map((h: any) => String(h || '').trim());
  console.log(`   Found ${headers.length} columns: ${headers.slice(0, 10).join(', ')}...`);
  
  // Find column indices (flexible matching - try multiple variations)
  const projectCol = findColumnIndex(headers, 'project', 'property', 'name', 'entity', 'deal', 'investment', 'fund');
  const partnerCol = findColumnIndex(headers, 'partner', 'investor', 'equity', 'profile', 'entity', 'investor name');
  const imsIdCol = findColumnIndex(headers, 'investor profile id', 'investor id', 'profile id', 'ims id', 'ims investor id');
  const equityTypeCol = findColumnIndex(headers, 'type', 'equity type', 'equitytype', 'investment type');
  const amountCol = findColumnIndex(headers, 'amount', 'commitment', 'total', 'value', 'commitment amount', 'investment amount');
  const fundingDateCol = findColumnIndex(headers, 'funding date', 'funding', 'date', 'commitment date', 'investment date', 'transaction date');
  const interestRateCol = findColumnIndex(headers, 'interest rate', 'rate', 'interest', 'yield', 'return');
  const leadPrefCol = findColumnIndex(headers, 'lead', 'pref', 'group', 'lead pref', 'preference group');
  const lastDollarCol = findColumnIndex(headers, 'last dollar', 'lastdollar', 'last_dollar');
  
  console.log(`   Column mapping: project=${projectCol}, partner=${partnerCol}, imsId=${imsIdCol}, amount=${amountCol}, date=${fundingDateCol}`);
  
  if (projectCol === -1) {
    console.log('⚠️  Project/Property column not found in commitments file');
    console.log(`   Available columns: ${headers.join(', ')}`);
    return;
  }
  
  let created = 0;
  let skipped = 0;
  let updated = 0;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= projectCol) continue;
    
    const projectName = row[projectCol] ? String(row[projectCol]).trim() : null;
    if (!projectName || projectName.length < 3) {
      skipped++;
      continue;
    }
    
    const projectId = await getProjectId(pool, projectName);
    if (!projectId) {
      console.log(`  ⚠️  Project not found: ${projectName}`);
      skipped++;
      continue;
    }
    
    const partnerName = partnerCol >= 0 && row[partnerCol] ? String(row[partnerCol]).trim() : null;
    const imsInvestorProfileId = imsIdCol >= 0 && row[imsIdCol] ? String(row[imsIdCol]).trim() : null;
    
    // If partner name is just an ID (all digits), use it as IMS ID and try to find the name
    let actualPartnerName = partnerName;
    let actualIMSId = imsInvestorProfileId || null;
    
    if (partnerName && /^\d{6,}$/.test(partnerName)) {
      // Partner name is actually an IMS ID
      actualIMSId = partnerName;
      actualPartnerName = null; // Will try to find name via IMS ID lookup
    }
    
    const equityPartnerId = actualPartnerName || actualIMSId 
      ? await getOrCreateEquityPartner(pool, actualPartnerName || actualIMSId || '', actualIMSId) 
      : null;
    
    const equityType = equityTypeCol >= 0 && row[equityTypeCol] ? String(row[equityTypeCol]).trim() : null;
    const amount = amountCol >= 0 ? parseAmount(row[amountCol]) : null;
    const fundingDate = fundingDateCol >= 0 ? parseDate(row[fundingDateCol]) : null;
    const interestRate = interestRateCol >= 0 && row[interestRateCol] ? String(row[interestRateCol]).trim() : null;
    const leadPrefGroup = leadPrefCol >= 0 && row[leadPrefCol] ? String(row[leadPrefCol]).trim() : null;
    const lastDollar = lastDollarCol >= 0 ? (String(row[lastDollarCol]).toLowerCase() === 'true' || String(row[lastDollarCol]).toLowerCase() === 'yes') : null;
    
    // Skip rows with zero or null amounts - these are not valid commitments
    if (!amount || amount === 0) {
      skipped++;
      continue;
    }
    
    // Check if commitment already exists (unique by ProjectId + EquityPartnerId + Amount + FundingDate)
    // Use a more flexible check - if ProjectId + Partner + Amount match, consider it duplicate
    const existing = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('EquityPartnerId', sql.Int, equityPartnerId)
      .input('Amount', sql.Decimal(18, 2), amount)
      .query(`
        SELECT EquityCommitmentId 
        FROM banking.EquityCommitment 
        WHERE ProjectId = @ProjectId
          AND (EquityPartnerId = @EquityPartnerId OR (EquityPartnerId IS NULL AND @EquityPartnerId IS NULL))
          AND ABS(COALESCE(Amount, 0) - COALESCE(@Amount, 0)) < 0.01
      `);
    
    if (existing.recordset.length > 0) {
      // Update existing record
      await pool.request()
        .input('EquityCommitmentId', sql.Int, existing.recordset[0].EquityCommitmentId)
        .input('EquityType', sql.NVarChar, equityType)
        .input('LeadPrefGroup', sql.NVarChar, leadPrefGroup)
        .input('FundingDate', sql.Date, fundingDate)
        .input('Amount', sql.Decimal(18, 2), amount)
        .input('InterestRate', sql.NVarChar, interestRate)
        .input('LastDollar', sql.Bit, lastDollar)
        .query(`
          UPDATE banking.EquityCommitment
          SET EquityType = @EquityType,
              LeadPrefGroup = @LeadPrefGroup,
              FundingDate = @FundingDate,
              Amount = @Amount,
              InterestRate = @InterestRate,
              LastDollar = @LastDollar
          WHERE EquityCommitmentId = @EquityCommitmentId
        `);
      updated++;
    } else {
      // Create new record
      await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('EquityPartnerId', sql.Int, equityPartnerId)
        .input('EquityType', sql.NVarChar, equityType)
        .input('LeadPrefGroup', sql.NVarChar, leadPrefGroup)
        .input('FundingDate', sql.Date, fundingDate)
        .input('Amount', sql.Decimal(18, 2), amount)
        .input('InterestRate', sql.NVarChar, interestRate)
        .input('LastDollar', sql.Bit, lastDollar)
        .query(`
          INSERT INTO banking.EquityCommitment (
            ProjectId, EquityPartnerId, EquityType, LeadPrefGroup,
            FundingDate, Amount, InterestRate, LastDollar
          )
          VALUES (
            @ProjectId, @EquityPartnerId, @EquityType, @LeadPrefGroup,
            @FundingDate, @Amount, @InterestRate, @LastDollar
          )
        `);
      created++;
    }
  }
  
  console.log(`  ✅ Created ${created} equity commitments, updated ${updated}, skipped ${skipped}`);
}

async function importInvestments(pool: sql.ConnectionPool, filePath: string) {
  console.log('\n📊 Importing Investments from IMS...');
  
  const rows = readExcelFile(filePath);
  if (rows.length < 2) {
    console.log('⚠️  No data rows found');
    console.log(`   File has ${rows.length} rows`);
    if (rows.length > 0) {
      console.log(`   Headers: ${JSON.stringify(rows[0])}`);
    }
    return;
  }
  
  const headers = rows[0].map((h: any) => String(h || '').trim());
  console.log(`   Found ${headers.length} columns: ${headers.slice(0, 10).join(', ')}...`);
  
  // Find column indices (try multiple variations)
  // For investments file, look for "Project Name" specifically
  // For partner, look for "Investor Name" or "Investor Profile Legal Name" 
  // For amount, look for "Investment Amount", "Contribution Amount", "Amount"
  // For date, look for "Contribution Date", "Received Date", "Investment Date"
  const projectCol = findColumnIndex(headers, 'project name', 'project', 'property', 'name', 'entity', 'deal', 'investment', 'fund');
  // Look for Investor Profile ID column
  const imsIdCol = findColumnIndex(headers, 'investor profile id', 'investor id', 'profile id', 'ims id', 'ims investor id');
  // Look for Investor Name first (this is the actual name, not the ID)
  // Prioritize "Investor Name" over "Investor Profile ID" 
  let partnerCol = findColumnIndex(headers, 'investor name', 'investor profile legal name', 'investor legal name', 'investor', 'partner', 'profile', 'entity');
  // If we found Investor Profile ID but not the name, try the next column (usually the name comes after ID)
  if (partnerCol === -1) {
    const profileIdCol = findColumnIndex(headers, 'investor profile id');
    if (profileIdCol >= 0 && profileIdCol + 1 < headers.length) {
      // Check if the next column looks like a name column
      const nextColHeader = headers[profileIdCol + 1].toLowerCase();
      if (nextColHeader.includes('name') || nextColHeader.includes('investor') || nextColHeader.includes('legal')) {
        partnerCol = profileIdCol + 1;
      }
    }
  }
  
  const amountCol = findColumnIndex(headers, 'investment amount', 'contribution amount', 'amount', 'investment', 'value', 'total', 'contribution');
  // Try multiple date column variations - some files use "Received Date" or "Transaction Date"
  let dateCol = findColumnIndex(headers, 'contribution date', 'received date', 'investment date', 'transaction date', 'date', 'funding date', 'commitment date');
  // If still not found, try "Date" columns more broadly
  if (dateCol === -1) {
    // Look for any column with "date" in the name
    for (let i = 0; i < headers.length; i++) {
      if (headers[i].toLowerCase().includes('date') && !headers[i].toLowerCase().includes('status')) {
        dateCol = i;
        break;
      }
    }
  }
  
  console.log(`   Column mapping: project=${projectCol}${projectCol >= 0 ? ` (${headers[projectCol]})` : ''}, partner=${partnerCol}${partnerCol >= 0 ? ` (${headers[partnerCol]})` : ''}, imsId=${imsIdCol}${imsIdCol >= 0 ? ` (${headers[imsIdCol]})` : ''}, amount=${amountCol}${amountCol >= 0 ? ` (${headers[amountCol]})` : ''}, date=${dateCol}${dateCol >= 0 ? ` (${headers[dateCol]})` : ''}`);
  
  if (projectCol === -1) {
    console.log('⚠️  Project/Property column not found in investments file');
    console.log(`   Available columns: ${headers.join(', ')}`);
    return;
  }
  
  // Warn if partner column might be wrong (looks like an ID column)
  if (partnerCol >= 0 && headers[partnerCol].toLowerCase().includes('id') && !headers[partnerCol].toLowerCase().includes('name')) {
    console.log(`   ⚠️  Warning: Partner column appears to be an ID column (${headers[partnerCol]}). Looking for name column...`);
    // Try to find Investor Name column explicitly
    const investorNameCol = findColumnIndex(headers, 'investor name');
    if (investorNameCol >= 0) {
      console.log(`   ✅ Found Investor Name column at index ${investorNameCol}, using that instead`);
      partnerCol = investorNameCol;
    }
  }
  
  let created = 0;
  let skipped = 0;
  let noProject = 0;
  let noAmount = 0;
  let noDate = 0;
  let updated = 0;
  
  // Process in batches to avoid timeout
  const batchSize = 50;
  const totalRows = rows.length - 1;
  console.log(`   Processing ${totalRows} rows in batches of ${batchSize}...`);
  
  for (let batchStart = 1; batchStart < rows.length; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, rows.length);
    const batchNum = Math.floor(batchStart / batchSize) + 1;
    const totalBatches = Math.ceil(totalRows / batchSize);
    
    if (batchStart % (batchSize * 5) === 1 || batchStart === 1) {
      console.log(`   Processing batch ${batchNum}/${totalBatches} (rows ${batchStart}-${batchEnd - 1})...`);
    }
    
    for (let i = batchStart; i < batchEnd; i++) {
    const row = rows[i];
    if (row.length <= projectCol) continue;
    
    const projectName = row[projectCol] ? String(row[projectCol]).trim() : null;
    if (!projectName || projectName.length < 3 || projectName.toLowerCase() === 'n/a' || projectName.toLowerCase() === 'null') {
      skipped++;
      continue;
    }
    
    // Skip non-project entries like "Financials", "Summary", etc.
    const skipNames = ['financials', 'summary', 'total', 'subtotal', 'header', 'footer', 'stone creek'];
    if (skipNames.includes(projectName.toLowerCase())) {
      skipped++;
      continue;
    }
    
    // Skip "The Flats at Crosspointe" - this might be a data entry issue
    if (projectName.toLowerCase().includes('flats at crosspointe')) {
      skipped++;
      continue;
    }
    
    const projectId = await getProjectId(pool, projectName);
    if (!projectId) {
      noProject++;
      if (noProject <= 5) {
        console.log(`  ⚠️  Project not found: ${projectName}`);
      }
      skipped++;
      continue;
    }
    
    // Try to get partner name from multiple possible columns
    let partnerName: string | null = null;
    if (partnerCol >= 0 && row[partnerCol]) {
      partnerName = String(row[partnerCol]).trim();
    }
    // If partner name column not found or empty, try Investor Name column explicitly
    if (!partnerName || partnerName.length < 2 || partnerName.match(/^\d+$/)) {
      const investorNameCol = findColumnIndex(headers, 'investor name', 'investor legal name');
      if (investorNameCol >= 0 && row[investorNameCol]) {
        const name = String(row[investorNameCol]).trim();
        // Don't use if it's just a number (likely an ID)
        if (name.length >= 2 && !name.match(/^\d+$/)) {
          partnerName = name;
        }
      }
    }
    
    // Get IMS ID from dedicated column or from partner name if it's an ID
    let imsInvestorProfileId = imsIdCol >= 0 && row[imsIdCol] ? String(row[imsIdCol]).trim() : null;
    let actualPartnerName = partnerName;
    
    // If partner name is just an ID (all digits), use it as IMS ID
    if (partnerName && /^\d{6,}$/.test(partnerName)) {
      imsInvestorProfileId = partnerName;
      actualPartnerName = null; // Will use IMS ID as name temporarily
    }
    
    const equityPartnerId = (actualPartnerName && actualPartnerName.length >= 2) || imsInvestorProfileId
      ? await getOrCreateEquityPartner(pool, actualPartnerName || imsInvestorProfileId || '', imsInvestorProfileId)
      : null;
    
    const amount = amountCol >= 0 ? parseAmount(row[amountCol]) : null;
    const fundingDate = dateCol >= 0 ? parseDate(row[dateCol]) : null;
    
    // Skip if no amount or date
    if (!amount) {
      noAmount++;
      skipped++;
      continue;
    }
    
    if (!fundingDate) {
      noDate++;
      skipped++;
      continue;
    }
    
    // Check if this investment already exists as a commitment
    // Use flexible matching - same project + partner + similar amount + date
    try {
      const existing = await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('EquityPartnerId', sql.Int, equityPartnerId)
        .input('Amount', sql.Decimal(18, 2), amount)
        .input('FundingDate', sql.Date, fundingDate)
        .query(`
          SELECT EquityCommitmentId 
          FROM banking.EquityCommitment 
          WHERE ProjectId = @ProjectId
            AND (EquityPartnerId = @EquityPartnerId OR (EquityPartnerId IS NULL AND @EquityPartnerId IS NULL))
            AND ABS(COALESCE(Amount, 0) - COALESCE(@Amount, 0)) < 0.01
            AND (FundingDate = @FundingDate OR (FundingDate IS NULL AND @FundingDate IS NULL))
        `);
      
      if (existing.recordset.length === 0) {
        // Create as equity commitment if it doesn't exist
        await pool.request()
          .input('ProjectId', sql.Int, projectId)
          .input('EquityPartnerId', sql.Int, equityPartnerId)
          .input('FundingDate', sql.Date, fundingDate)
          .input('Amount', sql.Decimal(18, 2), amount)
          .query(`
            INSERT INTO banking.EquityCommitment (
              ProjectId, EquityPartnerId, FundingDate, Amount
            )
            VALUES (
              @ProjectId, @EquityPartnerId, @FundingDate, @Amount
            )
          `);
        created++;
      } else {
        // Update existing record
        await pool.request()
          .input('EquityCommitmentId', sql.Int, existing.recordset[0].EquityCommitmentId)
          .input('Amount', sql.Decimal(18, 2), amount)
          .input('FundingDate', sql.Date, fundingDate)
          .query(`
            UPDATE banking.EquityCommitment
            SET Amount = @Amount, FundingDate = @FundingDate
            WHERE EquityCommitmentId = @EquityCommitmentId
          `);
        updated++;
      }
    } catch (error: any) {
      console.log(`  ⚠️  Error processing row ${i}: ${error.message}`);
      skipped++;
    }
    } // End of inner for loop (rows in batch)
  } // End of outer for loop (batches)
  
  console.log(`  ✅ Created ${created} equity commitments, updated ${updated}, skipped ${skipped}`);
  if (noProject > 5) console.log(`     (${noProject} skipped due to project not found)`);
  if (noAmount > 0) console.log(`     (${noAmount} skipped due to missing amount)`);
  if (noDate > 0) console.log(`     (${noDate} skipped due to missing date)`);
}

async function main() {
  console.log('🚀 Starting IMS Data Import...\n');
  
  const pool = await getPool();
  const imsDir = path.join(__dirname, '../../stoa_seed_csvs/IMSData');
  
  try {
    // Find all IMS Excel files dynamically
    const files = fs.readdirSync(imsDir).filter(f => f.endsWith('.xlsx'));
    
    // Import commitments
    const commitmentsFile = files.find(f => f.includes('commitments'));
    if (commitmentsFile) {
      console.log(`📄 Reading: ${commitmentsFile}`);
      await importCommitments(pool, path.join(imsDir, commitmentsFile));
    } else {
      console.log('⚠️  Commitments file not found');
    }
    
    // Import investments (standalone)
    const investmentsFile = files.find(f => f.includes('investments') && !f.includes('distributions'));
    if (investmentsFile) {
      console.log(`📄 Reading: ${investmentsFile}`);
      await importInvestments(pool, path.join(imsDir, investmentsFile));
    }
    
    // Import combined investments and distributions
    const combinedFile = files.find(f => f.includes('investments') && f.includes('distributions'));
    if (combinedFile) {
      console.log(`📄 Reading: ${combinedFile}`);
      await importInvestments(pool, path.join(imsDir, combinedFile));
    }
    
    console.log('\n✅ IMS data import completed!');
  } catch (error: any) {
    console.error('❌ Error importing IMS data:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  main();
}
