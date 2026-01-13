#!/usr/bin/env ts-node
/**
 * Seed Database from Seed CSVs
 * 
 * Wipes all data (keeps tables) and rebuilds the database from seed CSV files:
 * - Core: Projects
 * - Banking: Loans, DSCR Tests, Liquidity Requirements, Covenants, Participations, Guarantees
 * - Pipeline: Under Contract, Commercial Listed, Commercial Acreage, Closed Properties
 * 
 * IMPORTANT: This script DELETES ALL DATA and rebuilds from seed CSVs.
 * 
 * Usage: npm run db:seed
 */

import * as fs from 'fs';
import * as path from 'path';
import { getPool } from './db-manipulate';
import sql from 'mssql';

// Helper functions
function parseAmount(str: string | null | undefined): number | null {
  if (!str || str.trim() === '' || str === 'N/A' || str === '-' || str === '$-') return null;
  const cleaned = str.toString().replace(/[$,]/g, '').trim();
  if (cleaned === '' || cleaned === '0') return null;
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

function parseDate(str: string | null | undefined): string | null {
  if (!str || str.trim() === '' || str === 'N/A' || str === '-') return null;
  const trimmed = str.trim();
  
  // Handle ISO date strings with time
  if (trimmed.includes('T') || trimmed.includes(' ')) {
    const datePart = trimmed.split(/[T ]/)[0];
    if (datePart.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return datePart;
    }
  }
  
  // Handle dates like "2024-09-24"
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

function parseCSV(csvContent: string): string[][] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;
  
  const normalizedContent = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  for (let i = 0; i < normalizedContent.length; i++) {
    const char = normalizedContent[i];
    const nextChar = normalizedContent[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        currentLine += char;
      }
    } else if (char === '\n' && !inQuotes) {
      lines.push(currentLine);
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine) lines.push(currentLine);
  
  return lines.map(line => {
    const fields: string[] = [];
    let field = '';
    inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        const cleaned = field.trim().replace(/^"(.*)"$/, '$1');
        fields.push(cleaned);
        field = '';
      } else {
        field += char;
      }
    }
    const cleaned = field.trim().replace(/^"(.*)"$/, '$1');
    fields.push(cleaned);
    return fields;
  });
}

function getColumnIndex(headers: string[], name: string): number {
  return headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
}

async function getProjectId(pool: sql.ConnectionPool, projectName: string): Promise<number | null> {
  if (!projectName || projectName.trim() === '') return null;
  const result = await pool.request()
    .input('name', sql.NVarChar, projectName.trim())
    .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @name');
  return result.recordset.length > 0 ? result.recordset[0].ProjectId : null;
}

async function getBankId(pool: sql.ConnectionPool, bankName: string): Promise<number | null> {
  if (!bankName || bankName.trim() === '') return null;
  const result = await pool.request()
    .input('name', sql.NVarChar, bankName.trim())
    .query('SELECT BankId FROM core.Bank WHERE BankName = @name');
  return result.recordset.length > 0 ? result.recordset[0].BankId : null;
}

async function getOrCreateBank(pool: sql.ConnectionPool, bankName: string): Promise<number> {
  if (!bankName || bankName.trim() === '') return null as any;
  
  let bankId = await getBankId(pool, bankName);
  if (bankId) return bankId;
  
  const result = await pool.request()
    .input('BankName', sql.NVarChar, bankName.trim())
    .query(`
      INSERT INTO core.Bank (BankName)
      VALUES (@BankName);
      SELECT SCOPE_IDENTITY() AS BankId;
    `);
  return result.recordset[0].BankId;
}

async function getPersonId(pool: sql.ConnectionPool, personName: string): Promise<number | null> {
  if (!personName || personName.trim() === '') return null;
  const nameMap: { [key: string]: string } = {
    'Toby Easterly': 'Toby Easterly',
    'Ryan Nash': 'Ryan Nash',
    'Saun Sullivan': 'Saun Sullivan',
    'Stoa Holdings, LLC': 'Stoa Holdings, LLC'
  };
  const mappedName = nameMap[personName.trim()] || personName.trim();
  const result = await pool.request()
    .input('name', sql.NVarChar, mappedName)
    .query('SELECT PersonId FROM core.Person WHERE FullName = @name');
  return result.recordset.length > 0 ? result.recordset[0].PersonId : null;
}

function determineRegion(state: string | null, location: string | null): string | null {
  if (!state && !location) return null;
  const searchText = `${state || ''} ${location || ''}`.toLowerCase();
  if (searchText.includes('north carolina') || searchText.includes('south carolina') || 
      searchText.includes('nc') || searchText.includes('sc')) {
    return 'Carolinas';
  }
  return 'Gulf Coast';
}

function determineProductType(projectName: string): string | null {
  const name = projectName.toLowerCase();
  if (name.includes('heights')) return 'Heights';
  if (name.includes('waters')) return 'Waters';
  if (name.includes('flats')) return 'Flats';
  return 'Other';
}

function isNonPropertyProject(projectName: string, loanType?: string | null): boolean {
  const name = projectName.toLowerCase();
  
  // Check by name patterns
  if (name.includes('llc') && !name.includes('the waters') && !name.includes('the heights') && !name.includes('the flats')) {
    return true;
  }
  
  // Check by loan type - non-property loans indicate non-property projects
  if (loanType) {
    const loanLower = loanType.toLowerCase();
    if (loanLower.includes('rloc') || 
        loanLower.includes('owner occupied') ||
        loanLower.includes('plane') ||
        (loanLower.includes('land') && !loanLower.includes('construction'))) {
      return true;
    }
  }
  
  // Specific non-property project names
  const nonPropertyNames = [
    'amor fati',
    '210 e morris',
    'bauerle rd land',
    'icarus development'
  ];
  
  return nonPropertyNames.some(nonProp => name.includes(nonProp));
}

async function wipeDatabase(pool: sql.ConnectionPool) {
  console.log('🗑️  Wiping all data from database...');
  
  // Delete in reverse dependency order
  const tables = [
    'banking.Guarantee',
    'banking.Participation',
    'banking.Covenant',
    'banking.LiquidityRequirement',
    'banking.DSCRTest',
    'banking.Loan',
    'pipeline.ClosedProperty',
    'pipeline.CommercialAcreage',
    'pipeline.CommercialListed',
    'pipeline.UnderContract',
    'core.Project',
    'core.Bank',
    'core.EquityPartner',
    'core.Person'
  ];
  
  for (const table of tables) {
    try {
      await pool.request().query(`DELETE FROM ${table}`);
      console.log(`  ✅ Cleared ${table}`);
    } catch (error: any) {
      console.log(`  ⚠️  Could not clear ${table}: ${error.message}`);
    }
  }
  
  // Reset identity columns
  try {
    await pool.request().query(`
      DBCC CHECKIDENT ('core.Project', RESEED, 0);
      DBCC CHECKIDENT ('banking.Loan', RESEED, 0);
      DBCC CHECKIDENT ('banking.DSCRTest', RESEED, 0);
      DBCC CHECKIDENT ('banking.LiquidityRequirement', RESEED, 0);
      DBCC CHECKIDENT ('banking.Covenant', RESEED, 0);
      DBCC CHECKIDENT ('banking.Participation', RESEED, 0);
      DBCC CHECKIDENT ('banking.Guarantee', RESEED, 0);
      DBCC CHECKIDENT ('pipeline.UnderContract', RESEED, 0);
      DBCC CHECKIDENT ('pipeline.CommercialListed', RESEED, 0);
      DBCC CHECKIDENT ('pipeline.CommercialAcreage', RESEED, 0);
      DBCC CHECKIDENT ('pipeline.ClosedProperty', RESEED, 0);
      DBCC CHECKIDENT ('core.Bank', RESEED, 0);
      DBCC CHECKIDENT ('core.EquityPartner', RESEED, 0);
      DBCC CHECKIDENT ('core.Person', RESEED, 0);
    `);
    console.log('  ✅ Reset identity columns');
  } catch (error: any) {
    console.log(`  ⚠️  Could not reset identities: ${error.message}`);
  }
}

async function importProjects(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Importing Projects...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  if (rows.length < 2) {
    console.log('⚠️  No data rows found');
    return;
  }
  
  const headers = rows[0];
  const projectIdCol = getColumnIndex(headers, 'ProjectId');
  const projectNameCol = getColumnIndex(headers, 'ProjectName');
  
  if (projectNameCol === -1) {
    console.log('⚠️  ProjectName column not found');
    return;
  }
  
  // Skip non-project entries (banks, etc.)
  const skipNames = [
    'Atlantic Union Bank', 'Bank OZK', 'Bank of America', 'Banks that have expressed most capacity:',
    'First Bank (Southern Pines)', 'First Citizens Bank & Trust', 'Live Oak Banking Co',
    'N/A', 'Pinnacle Bank', 'Regions', 'Servis1st Bank', 'Truist Bank', 'United Bank',
    'United Community Bank', 'Valley Bank', 'Plane Loan', 'Tredge', 'Stoa Construction, LLC',
    'Starbucks', 'Office', 'Office space', 'Okaloosa Ophthalmology'
  ];
  
  let created = 0;
  let skipped = 0;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= projectNameCol) continue;
    
    const projectName = row[projectNameCol]?.trim();
    if (!projectName || projectName.length < 3) continue;
    if (skipNames.includes(projectName)) {
      skipped++;
      continue;
    }
    
    const projectId = projectIdCol >= 0 && row[projectIdCol] ? parseInt(row[projectIdCol]) : null;
    const productType = determineProductType(projectName);
    
    // Determine if this is a non-property project (LLC, land deal, etc.)
    const isNonProperty = isNonPropertyProject(projectName);
    const stage = isNonProperty ? 'Other' : null;
    
    // Insert project (will get new ProjectId from identity)
    await pool.request()
      .input('ProjectName', sql.NVarChar, projectName)
      .input('ProductType', sql.NVarChar, productType)
      .input('Stage', sql.NVarChar, stage)
      .query(`
        INSERT INTO core.Project (ProjectName, ProductType, Stage)
        VALUES (@ProjectName, @ProductType, @Stage)
      `);
    created++;
  }
  
  console.log(`  ✅ Created ${created} projects, skipped ${skipped} non-projects`);
}

async function importLoans(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Importing Loans...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  if (rows.length < 2) {
    console.log('⚠️  No data rows found');
    return;
  }
  
  const headers = rows[0];
  const borrowerCol = getColumnIndex(headers, 'Borrower');
  const loanTypeCol = getColumnIndex(headers, 'LoanType');
  const lenderCol = getColumnIndex(headers, 'LenderName');
  const amountCol = getColumnIndex(headers, 'LoanAmount');
  const closingDateCol = getColumnIndex(headers, 'LoanClosingDate');
  const completionDateCol = getColumnIndex(headers, 'ConstructionCompletionDate');
  const leaseUpDateCol = getColumnIndex(headers, 'LeaseUpCompletedDate');
  const maturityDateCol = getColumnIndex(headers, 'MaturityDate');
  const fixedOrFloatingCol = getColumnIndex(headers, 'FixedOrFloating');
  const indexCol = getColumnIndex(headers, 'IndexName');
  const spreadCol = getColumnIndex(headers, 'Spread');
  const miniPermMaturityCol = getColumnIndex(headers, 'MiniPermMaturity');
  const miniPermRateCol = getColumnIndex(headers, 'MiniPermInterestRate');
  const permPhaseMaturityCol = getColumnIndex(headers, 'PermPhaseMaturity');
  const permPhaseRateCol = getColumnIndex(headers, 'PermPhaseInterestRate');
  const permCloseDateCol = getColumnIndex(headers, 'PermanentFinancingCloseDate');
  const permLenderCol = getColumnIndex(headers, 'PermanentFinancingLender');
  const permAmountCol = getColumnIndex(headers, 'PermanentFinancingLoanAmount');
  const unitsCol = getColumnIndex(headers, 'Units');
  const locationCol = getColumnIndex(headers, 'Location');
  
  if (borrowerCol === -1) {
    console.log('⚠️  Borrower column not found');
    return;
  }
  
  let created = 0;
  let skipped = 0;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= borrowerCol) continue;
    
    const borrower = borrowerCol >= 0 ? row[borrowerCol]?.trim() : null;
    if (!borrower || borrower.length < 3) {
      skipped++;
      continue;
    }
    
    // Look up project by name (Borrower is the project name)
    const projectId = await getProjectId(pool, borrower);
    if (!projectId) {
      skipped++;
      continue;
    }
    
    const loanType = loanTypeCol >= 0 ? row[loanTypeCol]?.trim() || null : null;
    const lenderName = lenderCol >= 0 ? row[lenderCol]?.trim() || null : null;
    const loanAmount = amountCol >= 0 ? parseAmount(row[amountCol]) : null;
    const closingDate = closingDateCol >= 0 ? parseDate(row[closingDateCol]) : null;
    const completionDate = completionDateCol >= 0 ? row[completionDateCol]?.trim() || null : null;
    const leaseUpDate = leaseUpDateCol >= 0 ? row[leaseUpDateCol]?.trim() || null : null;
    const maturityDate = maturityDateCol >= 0 ? parseDate(row[maturityDateCol]) : null;
    const fixedOrFloating = fixedOrFloatingCol >= 0 ? row[fixedOrFloatingCol]?.trim() || null : null;
    const indexName = indexCol >= 0 ? row[indexCol]?.trim() || null : null;
    const spread = spreadCol >= 0 ? (row[spreadCol] ? row[spreadCol].toString() : null) : null;
    const miniPermMaturity = miniPermMaturityCol >= 0 ? parseDate(row[miniPermMaturityCol]) : null;
    const miniPermRate = miniPermRateCol >= 0 ? row[miniPermRateCol]?.trim() || null : null;
    const permPhaseMaturity = permPhaseMaturityCol >= 0 ? parseDate(row[permPhaseMaturityCol]) : null;
    const permPhaseRate = permPhaseRateCol >= 0 ? row[permPhaseRateCol]?.trim() || null : null;
    const permCloseDate = permCloseDateCol >= 0 ? parseDate(row[permCloseDateCol]) : null;
    const permLenderName = permLenderCol >= 0 ? row[permLenderCol]?.trim() || null : null;
    const permAmount = permAmountCol >= 0 ? parseAmount(row[permAmountCol]) : null;
    const units = unitsCol >= 0 ? (row[unitsCol] ? parseFloat(row[unitsCol]) || null : null) : null;
    const location = locationCol >= 0 ? row[locationCol]?.trim() || null : null;
    
    // Check if this is a non-property project based on loan type
    const isNonProperty = isNonPropertyProject(borrower, loanType);
    
    // Parse city/state from location if available
    let city: string | null = null;
    let state: string | null = null;
    let region: string | null = null;
    if (location) {
      const parts = location.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        city = parts[0];
        state = parts[1];
        region = determineRegion(state, location);
      } else {
        region = determineRegion(null, location);
      }
    }
    
    // Intelligently update project data
    // If it's a non-property project, set stage to "Other" (but don't overwrite if already set to something more advanced)
    await updateProjectData(pool, projectId, {
      Units: units,
      Location: location,
      City: city,
      State: state,
      Region: region,
      Stage: isNonProperty ? 'Other' : undefined
    });
    
    // Determine loan phase
    let loanPhase = 'Construction';
    if (loanType && loanType.includes('Land')) {
      loanPhase = 'Land';
    } else if (loanType && loanType.includes('Permanent')) {
      loanPhase = 'Permanent';
    }
    
    // Get lender ID
    let lenderId: number | null = null;
    if (lenderName) {
      lenderId = await getOrCreateBank(pool, lenderName);
    }
    
    // Only process if we have at least amount or date
    if (!loanAmount && !closingDate && !lenderId) {
      skipped++;
      continue;
    }
    
    await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('LoanType', sql.NVarChar, loanType)
      .input('Borrower', sql.NVarChar, borrower)
      .input('LoanPhase', sql.NVarChar, loanPhase)
      .input('LenderId', sql.Int, lenderId)
      .input('LoanAmount', sql.Decimal(18, 2), loanAmount)
      .input('LoanClosingDate', sql.Date, closingDate)
      .input('ConstructionCompletionDate', sql.NVarChar, completionDate)
      .input('LeaseUpCompletedDate', sql.NVarChar, leaseUpDate)
      .input('IOMaturityDate', sql.Date, maturityDate)
      .input('FixedOrFloating', sql.NVarChar, fixedOrFloating)
      .input('IndexName', sql.NVarChar, indexName)
      .input('Spread', sql.NVarChar, spread)
      .input('MiniPermMaturity', sql.Date, miniPermMaturity)
      .input('MiniPermInterestRate', sql.NVarChar, miniPermRate)
      .input('PermPhaseMaturity', sql.Date, permPhaseMaturity)
      .input('PermPhaseInterestRate', sql.NVarChar, permPhaseRate)
      .input('PermanentCloseDate', sql.Date, permCloseDate)
      .input('PermanentLoanAmount', sql.Decimal(18, 2), permAmount)
      .query(`
        INSERT INTO banking.Loan (
          ProjectId, LoanType, Borrower, LoanPhase, LenderId,
          LoanAmount, LoanClosingDate, ConstructionCompletionDate, LeaseUpCompletedDate, IOMaturityDate,
          FixedOrFloating, IndexName, Spread,
          MiniPermMaturity, MiniPermInterestRate,
          PermPhaseMaturity, PermPhaseInterestRate,
          PermanentCloseDate, PermanentLoanAmount
        )
        VALUES (
          @ProjectId, @LoanType, @Borrower, @LoanPhase, @LenderId,
          @LoanAmount, @LoanClosingDate, @ConstructionCompletionDate, @LeaseUpCompletedDate, @IOMaturityDate,
          @FixedOrFloating, @IndexName, @Spread,
          @MiniPermMaturity, @MiniPermInterestRate,
          @PermPhaseMaturity, @PermPhaseInterestRate,
          @PermanentCloseDate, @PermanentLoanAmount
        )
      `);
    created++;
  }
  
  console.log(`  ✅ Created ${created} loans, skipped ${skipped} rows`);
}

async function importDSCRTests(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Importing DSCR Tests...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  if (rows.length < 2) {
    console.log('⚠️  No data rows found');
    return;
  }
  
  const headers = rows[0];
  const projectIdCol = getColumnIndex(headers, 'ProjectId');
  const testNumberCol = getColumnIndex(headers, 'TestNumber');
  const testDateCol = getColumnIndex(headers, 'TestDate');
  const projectedRateCol = getColumnIndex(headers, 'ProjectedInterestRate');
  const requirementCol = getColumnIndex(headers, 'Requirement');
  const projectedValueCol = getColumnIndex(headers, 'ProjectedValue');
  
  if (projectIdCol === -1 || testNumberCol === -1) {
    console.log('⚠️  Required columns not found');
    return;
  }
  
  // Build a mapping from old ProjectId to new ProjectId by matching with loans
  // Since DSCR tests reference loans, we can find projects through loans
  const projectIdMap = new Map<number, number>();
  const loanResult = await pool.request().query(`
    SELECT l.LoanId, l.ProjectId, p.ProjectName
    FROM banking.Loan l
    INNER JOIN core.Project p ON l.ProjectId = p.ProjectId
  `);
  
  for (const loan of loanResult.recordset) {
    // We'll match by loan order/index - this is approximate but should work
    projectIdMap.set(parseInt(loan.LoanId.toString()), loan.ProjectId);
  }
  
  let created = 0;
  let skipped = 0;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= projectIdCol) continue;
    
    const oldProjectId = parseInt(row[projectIdCol]);
    if (isNaN(oldProjectId)) {
      skipped++;
      continue;
    }
    
    // Try to find project by matching loan order
    // Get the loan ID from the CSV and use it to find the project
    const loanIdCol = getColumnIndex(headers, 'LoanId');
    let projectId: number | null = null;
    
    if (loanIdCol >= 0 && row[loanIdCol]) {
      const oldLoanId = parseInt(row[loanIdCol]);
      if (!isNaN(oldLoanId) && projectIdMap.has(oldLoanId)) {
        projectId = projectIdMap.get(oldLoanId)!;
      }
    }
    
    // Fallback: try to find by project ID if we have a direct mapping
    // Or skip if we can't find it
    if (!projectId) {
      skipped++;
      continue;
    }
    
    const testNumber = testNumberCol >= 0 ? parseInt(row[testNumberCol]) || null : null;
    if (!testNumber || testNumber < 1 || testNumber > 3) continue;
    
    const testDate = testDateCol >= 0 ? parseDate(row[testDateCol]) : null;
    const projectedRate = projectedRateCol >= 0 ? (row[projectedRateCol] ? row[projectedRateCol].toString() : null) : null;
    const requirement = requirementCol >= 0 ? parseAmount(row[requirementCol]) : null;
    const projectedValue = projectedValueCol >= 0 ? (row[projectedValueCol] ? row[projectedValueCol].toString() : null) : null;
    
    if (!testDate) continue;
    
    await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('TestNumber', sql.Int, testNumber)
      .input('TestDate', sql.Date, testDate)
      .input('ProjectedInterestRate', sql.NVarChar, projectedRate)
      .input('Requirement', sql.Decimal(10, 2), requirement)
      .input('ProjectedValue', sql.NVarChar, projectedValue)
      .query(`
        INSERT INTO banking.DSCRTest (ProjectId, TestNumber, TestDate, ProjectedInterestRate, Requirement, ProjectedValue)
        VALUES (@ProjectId, @TestNumber, @TestDate, @ProjectedInterestRate, @Requirement, @ProjectedValue)
      `);
    created++;
  }
  
  console.log(`  ✅ Created ${created} DSCR tests, skipped ${skipped} rows`);
}

async function importLiquidityRequirements(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Importing Liquidity Requirements...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  if (rows.length < 2) {
    console.log('⚠️  No data rows found');
    return;
  }
  
  const headers = rows[0];
  const projectIdCol = getColumnIndex(headers, 'ProjectId');
  const loanIdCol = getColumnIndex(headers, 'LoanId');
  const totalCol = getColumnIndex(headers, 'TotalAmount');
  const lendingBankCol = getColumnIndex(headers, 'LendingBankAmount');
  
  if (projectIdCol === -1) {
    console.log('⚠️  ProjectId column not found');
    return;
  }
  
  // Build mapping from old LoanId to new ProjectId
  const loanToProjectMap = new Map<number, number>();
  const loanResult = await pool.request().query(`
    SELECT LoanId, ProjectId FROM banking.Loan ORDER BY LoanId
  `);
  
  let loanIndex = 1;
  for (const loan of loanResult.recordset) {
    loanToProjectMap.set(loanIndex, loan.ProjectId);
    loanIndex++;
  }
  
  let created = 0;
  let skipped = 0;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= projectIdCol) continue;
    
    let projectId: number | null = null;
    
    // Try to find project by loan ID
    if (loanIdCol >= 0 && row[loanIdCol]) {
      const oldLoanId = parseInt(row[loanIdCol]);
      if (!isNaN(oldLoanId) && loanToProjectMap.has(oldLoanId)) {
        projectId = loanToProjectMap.get(oldLoanId)!;
      }
    }
    
    if (!projectId) {
      skipped++;
      continue;
    }
    
    const totalAmount = totalCol >= 0 ? parseAmount(row[totalCol]) : null;
    const lendingBankAmount = lendingBankCol >= 0 ? parseAmount(row[lendingBankCol]) : null;
    
    if (!totalAmount && !lendingBankAmount) continue;
    
    await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('TotalAmount', sql.Decimal(18, 2), totalAmount)
      .input('LendingBankAmount', sql.Decimal(18, 2), lendingBankAmount)
      .query(`
        INSERT INTO banking.LiquidityRequirement (ProjectId, TotalAmount, LendingBankAmount)
        VALUES (@ProjectId, @TotalAmount, @LendingBankAmount)
      `);
    created++;
  }
  
  console.log(`  ✅ Created ${created} liquidity requirements, skipped ${skipped} rows`);
}

async function importOccupancyCovenants(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Importing Occupancy Covenants...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  if (rows.length < 2) {
    console.log('⚠️  No data rows found');
    return;
  }
  
  const headers = rows[0];
  const projectIdCol = getColumnIndex(headers, 'ProjectId');
  const loanIdCol = getColumnIndex(headers, 'LoanId');
  const covenantDateCol = getColumnIndex(headers, 'CovenantDate');
  const requirementCol = getColumnIndex(headers, 'Requirement');
  const projectedValueCol = getColumnIndex(headers, 'ProjectedValue');
  
  if (projectIdCol === -1) {
    console.log('⚠️  ProjectId column not found');
    return;
  }
  
  // Build mapping from old LoanId to new ProjectId
  const loanToProjectMap = new Map<number, number>();
  const loanResult = await pool.request().query(`
    SELECT LoanId, ProjectId FROM banking.Loan ORDER BY LoanId
  `);
  
  let loanIndex = 1;
  for (const loan of loanResult.recordset) {
    loanToProjectMap.set(loanIndex, loan.ProjectId);
    loanIndex++;
  }
  
  let created = 0;
  let skipped = 0;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= projectIdCol) continue;
    
    let projectId: number | null = null;
    
    // Try to find project by loan ID
    if (loanIdCol >= 0 && row[loanIdCol]) {
      const oldLoanId = parseInt(row[loanIdCol]);
      if (!isNaN(oldLoanId) && loanToProjectMap.has(oldLoanId)) {
        projectId = loanToProjectMap.get(oldLoanId)!;
      }
    }
    
    if (!projectId) {
      skipped++;
      continue;
    }
    
    const covenantDate = covenantDateCol >= 0 ? parseDate(row[covenantDateCol]) : null;
    const requirement = requirementCol >= 0 ? (row[requirementCol] ? row[requirementCol].toString() : null) : null;
    const projectedValue = projectedValueCol >= 0 ? (row[projectedValueCol] ? row[projectedValueCol].toString() : null) : null;
    
    if (!covenantDate && !requirement) continue;
    
    await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('CovenantType', sql.NVarChar, 'Occupancy')
      .input('CovenantDate', sql.Date, covenantDate)
      .input('Requirement', sql.NVarChar, requirement)
      .input('ProjectedValue', sql.NVarChar, projectedValue)
      .query(`
        INSERT INTO banking.Covenant (ProjectId, CovenantType, CovenantDate, Requirement, ProjectedValue)
        VALUES (@ProjectId, @CovenantType, @CovenantDate, @Requirement, @ProjectedValue)
      `);
    created++;
  }
  
  console.log(`  ✅ Created ${created} covenants, skipped ${skipped} rows`);
}

async function importUnderContract(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Importing Under Contract Properties...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  if (rows.length < 2) {
    console.log('⚠️  No data rows found');
    return;
  }
  
  const headers = rows[0];
  const projectIdCol = getColumnIndex(headers, 'ProjectId');
  const projectNameCol = getColumnIndex(headers, 'ProjectName');
  const locationCol = getColumnIndex(headers, 'Location');
  const regionCol = getColumnIndex(headers, 'Region');
  const acreageCol = getColumnIndex(headers, 'Acreage');
  const unitsCol = getColumnIndex(headers, 'Units');
  const priceCol = getColumnIndex(headers, 'Price');
  const pricePerSFCol = getColumnIndex(headers, 'PricePerSF');
  const executionDateCol = getColumnIndex(headers, 'ExecutionDate');
  const dueDiligenceDateCol = getColumnIndex(headers, 'DueDiligenceDate');
  const closingDateCol = getColumnIndex(headers, 'ClosingDate');
  const purchasingEntityCol = getColumnIndex(headers, 'PurchasingEntity');
  const cashFlagCol = getColumnIndex(headers, 'CashFlag');
  const opportunityZoneFlagCol = getColumnIndex(headers, 'OpportunityZoneFlag');
  const notesCol = getColumnIndex(headers, 'Notes');
  
  if (projectNameCol === -1) {
    console.log('⚠️  ProjectName column not found');
    return;
  }
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= projectNameCol) continue;
    
    const projectName = projectNameCol >= 0 ? row[projectNameCol]?.trim() || null : null;
    if (!projectName || projectName.length < 3) {
      skipped++;
      continue;
    }
    
    // Look up project by name
    const projectId = await getProjectId(pool, projectName);
    if (!projectId) {
      skipped++;
      continue;
    }
    const location = locationCol >= 0 ? row[locationCol]?.trim() || null : null;
    const region = regionCol >= 0 ? row[regionCol]?.trim() || null : null;
    const acreage = acreageCol >= 0 ? parseAmount(row[acreageCol]) : null;
    const units = unitsCol >= 0 ? (row[unitsCol] ? parseFloat(row[unitsCol]) || null : null) : null;
    const price = priceCol >= 0 ? parseAmount(row[priceCol]) : null;
    const pricePerSF = pricePerSFCol >= 0 ? parseAmount(row[pricePerSFCol]) : null;
    const executionDate = executionDateCol >= 0 ? parseDate(row[executionDateCol]) : null;
    const dueDiligenceDate = dueDiligenceDateCol >= 0 ? parseDate(row[dueDiligenceDateCol]) : null;
    const closingDate = closingDateCol >= 0 ? parseDate(row[closingDateCol]) : null;
    const purchasingEntity = purchasingEntityCol >= 0 ? row[purchasingEntityCol]?.trim() || null : null;
    const cashFlag = cashFlagCol >= 0 ? (row[cashFlagCol]?.toLowerCase() === 'true') : null;
    const opportunityZoneFlag = opportunityZoneFlagCol >= 0 ? (row[opportunityZoneFlagCol]?.toLowerCase() === 'true') : null;
    const notes = notesCol >= 0 ? row[notesCol]?.trim() || null : null;
    
    // Parse city/state from location if available
    let city: string | null = null;
    let state: string | null = null;
    if (location) {
      const parts = location.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        city = parts[0];
        state = parts[1];
      }
    }
    
    // Intelligently update project data (don't overwrite more advanced stages)
    await updateProjectData(pool, projectId, {
      Units: units,
      Location: location,
      City: city,
      State: state,
      Region: region,
      Stage: 'Under Contract'
    });
    
    // Check if exists
    const existing = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .query('SELECT UnderContractId FROM pipeline.UnderContract WHERE ProjectId = @ProjectId');
    
    if (existing.recordset.length > 0) {
      await pool.request()
        .input('UnderContractId', sql.Int, existing.recordset[0].UnderContractId)
        .input('Location', sql.NVarChar, location)
        .input('Region', sql.NVarChar, region)
        .input('Acreage', sql.Decimal(18, 2), acreage)
        .input('Units', sql.Int, units)
        .input('Price', sql.Decimal(18, 2), price)
        .input('PricePerSF', sql.Decimal(18, 2), pricePerSF)
        .input('ExecutionDate', sql.Date, executionDate)
        .input('DueDiligenceDate', sql.Date, dueDiligenceDate)
        .input('ClosingDate', sql.Date, closingDate)
        .input('PurchasingEntity', sql.NVarChar, purchasingEntity)
        .input('CashFlag', sql.Bit, cashFlag)
        .input('OpportunityZone', sql.Bit, opportunityZoneFlag)
        .input('ExtensionNotes', sql.NVarChar(sql.MAX), notes)
        .query(`
          UPDATE pipeline.UnderContract
          SET Location = @Location, Region = @Region,
              Acreage = @Acreage, Units = @Units, Price = @Price, PricePerSF = @PricePerSF,
              ExecutionDate = @ExecutionDate, DueDiligenceDate = @DueDiligenceDate,
              ClosingDate = @ClosingDate, PurchasingEntity = @PurchasingEntity,
              CashFlag = @CashFlag, OpportunityZone = @OpportunityZone, ExtensionNotes = @ExtensionNotes
          WHERE UnderContractId = @UnderContractId
        `);
      updated++;
    } else {
      await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('Location', sql.NVarChar, location)
        .input('Region', sql.NVarChar, region)
        .input('Acreage', sql.Decimal(18, 2), acreage)
        .input('Units', sql.Int, units)
        .input('Price', sql.Decimal(18, 2), price)
        .input('PricePerSF', sql.Decimal(18, 2), pricePerSF)
        .input('ExecutionDate', sql.Date, executionDate)
        .input('DueDiligenceDate', sql.Date, dueDiligenceDate)
        .input('ClosingDate', sql.Date, closingDate)
        .input('PurchasingEntity', sql.NVarChar, purchasingEntity)
        .input('CashFlag', sql.Bit, cashFlag)
        .input('OpportunityZone', sql.Bit, opportunityZoneFlag)
        .input('ExtensionNotes', sql.NVarChar(sql.MAX), notes)
        .query(`
          INSERT INTO pipeline.UnderContract (
            ProjectId, Location, Region, Acreage, Units, Price, PricePerSF,
            ExecutionDate, DueDiligenceDate, ClosingDate, PurchasingEntity,
            CashFlag, OpportunityZone, ExtensionNotes
          )
          VALUES (
            @ProjectId, @Location, @Region, @Acreage, @Units, @Price, @PricePerSF,
            @ExecutionDate, @DueDiligenceDate, @ClosingDate, @PurchasingEntity,
            @CashFlag, @OpportunityZone, @ExtensionNotes
          )
        `);
      created++;
    }
  }
  
  console.log(`  ✅ Created ${created} under contract records, updated ${updated} records, skipped ${skipped} rows`);
}

async function importClosedProperties(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Importing Closed Properties...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  if (rows.length < 2) {
    console.log('⚠️  No data rows found');
    return;
  }
  
  const headers = rows[0];
  const projectIdCol = getColumnIndex(headers, 'ProjectId');
  const projectNameCol = getColumnIndex(headers, 'ProjectName');
  const statusCol = getColumnIndex(headers, 'Status');
  const closingDateCol = getColumnIndex(headers, 'ClosingDate');
  const locationCol = getColumnIndex(headers, 'Location');
  const addressCol = getColumnIndex(headers, 'Address');
  const acreageCol = getColumnIndex(headers, 'Acreage');
  const unitsCol = getColumnIndex(headers, 'Units');
  const sqFtPriceCol = getColumnIndex(headers, 'SqFtPrice_ActOfSale');
  const dueDiligenceCol = getColumnIndex(headers, 'Due Diligence');
  const cashFlagCol = getColumnIndex(headers, 'CashFlag');
  
  if (projectIdCol === -1) {
    console.log('⚠️  ProjectId column not found');
    return;
  }
  
  let created = 0;
  let updated = 0;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= projectNameCol) continue;
    
    const projectName = projectNameCol >= 0 ? row[projectNameCol]?.trim() || null : null;
    if (!projectName) continue;
    
    // Look up project by name
    const projectId = await getProjectId(pool, projectName);
    if (!projectId) continue;
    
    const status = statusCol >= 0 ? row[statusCol]?.trim() || null : null;
    const closingDate = closingDateCol >= 0 ? parseDate(row[closingDateCol]) : null;
    const location = locationCol >= 0 ? row[locationCol]?.trim() || null : null;
    const address = addressCol >= 0 ? row[addressCol]?.trim() || null : null;
    const acreage = acreageCol >= 0 ? parseAmount(row[acreageCol]) : null;
    const units = unitsCol >= 0 ? (row[unitsCol] ? parseFloat(row[unitsCol]) || null : null) : null;
    const sqFtPrice = sqFtPriceCol >= 0 ? parseAmount(row[sqFtPriceCol]) : null;
    const dueDiligence = dueDiligenceCol >= 0 ? parseDate(row[dueDiligenceCol]) : null;
    const cashFlag = cashFlagCol >= 0 ? (row[cashFlagCol]?.toLowerCase() === 'true') : null;
    
    // Parse city/state from location if available
    let city: string | null = null;
    let state: string | null = null;
    let region: string | null = null;
    if (location) {
      const parts = location.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        city = parts[0];
        state = parts[1];
        region = determineRegion(state, location);
      } else {
        region = determineRegion(null, location);
      }
    }
    
    // Intelligently update project data
    await updateProjectData(pool, projectId, {
      Units: units,
      Location: location,
      City: city,
      State: state,
      Region: region,
      Stage: (status === 'Sold' || status === 'Purchased') ? 'Closed' : undefined
    });
    
    // Check if exists (unique constraint on ProjectId)
    const existing = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .query('SELECT ClosedPropertyId FROM pipeline.ClosedProperty WHERE ProjectId = @ProjectId');
    
    if (existing.recordset.length > 0) {
      // Update existing
      await pool.request()
        .input('ClosedPropertyId', sql.Int, existing.recordset[0].ClosedPropertyId)
        .input('Status', sql.NVarChar, status)
        .input('ClosingDate', sql.Date, closingDate)
        .input('Location', sql.NVarChar, location)
        .input('Address', sql.NVarChar, address)
        .input('Acreage', sql.Decimal(18, 2), acreage)
        .input('Units', sql.Int, units)
        .input('PricePerSF', sql.Decimal(18, 2), sqFtPrice)
        .input('DueDiligenceDate', sql.Date, dueDiligence)
        .input('CashFlag', sql.Bit, cashFlag)
        .query(`
          UPDATE pipeline.ClosedProperty
          SET Status = @Status, ClosingDate = @ClosingDate, Location = @Location, Address = @Address,
              Acreage = @Acreage, Units = @Units, PricePerSF = @PricePerSF,
              DueDiligenceDate = @DueDiligenceDate, CashFlag = @CashFlag
          WHERE ClosedPropertyId = @ClosedPropertyId
        `);
      updated++;
    } else {
      // Insert new
      await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('Status', sql.NVarChar, status)
        .input('ClosingDate', sql.Date, closingDate)
        .input('Location', sql.NVarChar, location)
        .input('Address', sql.NVarChar, address)
        .input('Acreage', sql.Decimal(18, 2), acreage)
        .input('Units', sql.Int, units)
        .input('PricePerSF', sql.Decimal(18, 2), sqFtPrice)
        .input('DueDiligenceDate', sql.Date, dueDiligence)
        .input('CashFlag', sql.Bit, cashFlag)
        .query(`
          INSERT INTO pipeline.ClosedProperty (
            ProjectId, Status, ClosingDate, Location, Address,
            Acreage, Units, PricePerSF, DueDiligenceDate, CashFlag
          )
          VALUES (
            @ProjectId, @Status, @ClosingDate, @Location, @Address,
            @Acreage, @Units, @PricePerSF, @DueDiligenceDate, @CashFlag
          )
        `);
      created++;
    }
  }
  
  console.log(`  ✅ Created ${created} closed property records, updated ${updated} records`);
}

async function importCommercialListed(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Importing Commercial Listed Properties...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  if (rows.length < 2) {
    console.log('⚠️  No data rows found');
    return;
  }
  
  const headers = rows[0];
  const projectNameCol = getColumnIndex(headers, 'ProjectName');
  const locationCol = getColumnIndex(headers, 'Location');
  const listedDateCol = getColumnIndex(headers, 'ListedDate');
  const acreageCol = getColumnIndex(headers, 'Acreage');
  const priceCol = getColumnIndex(headers, 'Price');
  const statusCol = getColumnIndex(headers, 'Status');
  const dueDiligenceDateCol = getColumnIndex(headers, 'DueDiligenceDate');
  const closingDateCol = getColumnIndex(headers, 'ClosingDate');
  const ownerCol = getColumnIndex(headers, 'Owner');
  const purchasingEntityCol = getColumnIndex(headers, 'PurchasingEntity');
  const notesCol = getColumnIndex(headers, 'Notes');
  
  if (projectNameCol === -1) {
    console.log('⚠️  ProjectName column not found');
    return;
  }
  
  let created = 0;
  let skipped = 0;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= projectNameCol) continue;
    
    const projectName = projectNameCol >= 0 ? row[projectNameCol]?.trim() || null : null;
    if (!projectName || projectName.length < 3) {
      skipped++;
      continue;
    }
    
    // Look up project by name
    const projectId = await getProjectId(pool, projectName);
    if (!projectId) {
      skipped++;
      continue;
    }
    const location = locationCol >= 0 ? row[locationCol]?.trim() || null : null;
    const listedDate = listedDateCol >= 0 ? parseDate(row[listedDateCol]) : null;
    const acreage = acreageCol >= 0 ? parseAmount(row[acreageCol]) : null;
    const price = priceCol >= 0 ? parseAmount(row[priceCol]) : null;
    const status = statusCol >= 0 ? row[statusCol]?.trim() || null : null;
    const dueDiligenceDate = dueDiligenceDateCol >= 0 ? parseDate(row[dueDiligenceDateCol]) : null;
    const closingDate = closingDateCol >= 0 ? parseDate(row[closingDateCol]) : null;
    const owner = ownerCol >= 0 ? row[ownerCol]?.trim() || null : null;
    const purchasingEntity = purchasingEntityCol >= 0 ? row[purchasingEntityCol]?.trim() || null : null;
    const notes = notesCol >= 0 ? row[notesCol]?.trim() || null : null;
    
    // Parse city/state from location if available
    let city: string | null = null;
    let state: string | null = null;
    let region: string | null = null;
    if (location) {
      const parts = location.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        city = parts[0];
        state = parts[1];
        region = determineRegion(state, location);
      } else {
        region = determineRegion(null, location);
      }
    }
    
    // Intelligently update project data
    await updateProjectData(pool, projectId, {
      Location: location,
      City: city,
      State: state,
      Region: region,
      Stage: (status === 'Under Contract') ? 'Under Contract' : undefined
    });
    
    await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('Location', sql.NVarChar, location)
      .input('ListedDate', sql.Date, listedDate)
      .input('Acreage', sql.Decimal(18, 2), acreage)
      .input('Price', sql.Decimal(18, 2), price)
      .input('Status', sql.NVarChar, status)
      .input('DueDiligenceDate', sql.Date, dueDiligenceDate)
      .input('ClosingDate', sql.Date, closingDate)
      .input('Owner', sql.NVarChar, owner)
      .input('PurchasingEntity', sql.NVarChar, purchasingEntity)
      .input('Notes', sql.NVarChar(sql.MAX), notes)
      .query(`
        INSERT INTO pipeline.CommercialListed (
          ProjectId, Location, ListedDate, Acreage, Price, Status,
          DueDiligenceDate, ClosingDate, Owner, PurchasingEntity, Notes
        )
        VALUES (
          @ProjectId, @Location, @ListedDate, @Acreage, @Price, @Status,
          @DueDiligenceDate, @ClosingDate, @Owner, @PurchasingEntity, @Notes
        )
      `);
    created++;
  }
  
  console.log(`  ✅ Created ${created} commercial listed records, skipped ${skipped} rows`);
}

async function importCommercialAcreage(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Importing Commercial Acreage...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  if (rows.length < 2) {
    console.log('⚠️  No data rows found');
    return;
  }
  
  const headers = rows[0];
  const projectNameCol = getColumnIndex(headers, 'ProjectName');
  const locationCol = getColumnIndex(headers, 'Location');
  const acreageCol = getColumnIndex(headers, 'Acreage');
  const squareFootageCol = getColumnIndex(headers, 'SquareFootage');
  const buildingFootprintSFCol = getColumnIndex(headers, 'BuildingFootprintSF');
  
  if (projectNameCol === -1) {
    console.log('⚠️  ProjectName column not found');
    return;
  }
  
  let created = 0;
  let skipped = 0;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= projectNameCol) continue;
    
    const projectName = projectNameCol >= 0 ? row[projectNameCol]?.trim() || null : null;
    if (!projectName || projectName.length < 3) {
      skipped++;
      continue;
    }
    
    // Look up project by name
    const projectId = await getProjectId(pool, projectName);
    if (!projectId) {
      skipped++;
      continue;
    }
    
    const location = locationCol >= 0 ? row[locationCol]?.trim() || null : null;
    const acreage = acreageCol >= 0 ? parseAmount(row[acreageCol]) : null;
    const squareFootage = squareFootageCol >= 0 ? parseAmount(row[squareFootageCol]) : null;
    const buildingFootprintSF = buildingFootprintSFCol >= 0 ? parseAmount(row[buildingFootprintSFCol]) : null;
    
    // Parse city/state from location if available
    let city: string | null = null;
    let state: string | null = null;
    let region: string | null = null;
    if (location) {
      const parts = location.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        city = parts[0];
        state = parts[1];
        region = determineRegion(state, location);
      } else {
        region = determineRegion(null, location);
      }
    }
    
    // Intelligently update project data
    await updateProjectData(pool, projectId, {
      Location: location,
      City: city,
      State: state,
      Region: region
    });
    
    // Check if exists (unique constraint on ProjectId)
    const existing = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .query('SELECT CommercialAcreageId FROM pipeline.CommercialAcreage WHERE ProjectId = @ProjectId');
    
    if (existing.recordset.length > 0) {
      // Update existing
      await pool.request()
        .input('CommercialAcreageId', sql.Int, existing.recordset[0].CommercialAcreageId)
        .input('Location', sql.NVarChar, location)
        .input('Acreage', sql.Decimal(18, 2), acreage)
        .input('SquareFootage', sql.Decimal(18, 2), squareFootage)
        .input('BuildingFootprintSF', sql.Decimal(18, 2), buildingFootprintSF)
        .query(`
          UPDATE pipeline.CommercialAcreage
          SET Location = @Location, Acreage = @Acreage, SquareFootage = @SquareFootage,
              BuildingFootprintSF = @BuildingFootprintSF
          WHERE CommercialAcreageId = @CommercialAcreageId
        `);
    } else {
      // Insert new
      await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('Location', sql.NVarChar, location)
        .input('Acreage', sql.Decimal(18, 2), acreage)
        .input('SquareFootage', sql.Decimal(18, 2), squareFootage)
        .input('BuildingFootprintSF', sql.Decimal(18, 2), buildingFootprintSF)
        .query(`
          INSERT INTO pipeline.CommercialAcreage (
            ProjectId, Location, Acreage, SquareFootage, BuildingFootprintSF
          )
          VALUES (
            @ProjectId, @Location, @Acreage, @SquareFootage, @BuildingFootprintSF
          )
        `);
      created++;
    }
  }
  
  console.log(`  ✅ Created ${created} commercial acreage records, skipped ${skipped} rows`);
}

async function importParticipations(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Importing Participations...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  if (rows.length < 3) {
    console.log('⚠️  No data rows found');
    return;
  }
  
  let participationsCreated = 0;
  let loansUpdated = 0;
  let currentProject = '';
  
  // Skip header rows (first 2 rows)
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 4) continue;
    
    // Check if this is a project name row
    const col0 = row[0]?.trim();
    const col4 = row[4]?.trim(); // Project_2 column
    
    if (col0 && (col0.includes('The') || col0.includes('Waters') || col0.includes('Heights') || col0.includes('Flats'))) {
      currentProject = col0;
    } else if (col4 && (col4.includes('The') || col4.includes('Waters') || col4.includes('Heights') || col4.includes('Flats'))) {
      currentProject = col4;
    }
    
    // Check if this is a participation row
    const bankName = row[1]?.trim() || row[5]?.trim();
    const percentage = row[2]?.trim() || row[6]?.trim();
    const exposure = parseAmount(row[3]) || parseAmount(row[7]);
    const paidOff = row.length > 8 ? (parseAmount(row[8]) !== null) : false;
    
    // Skip rows with zero/null exposure or 0% participation
    if (!exposure || exposure === 0 || !percentage || percentage === '0' || percentage === '0%' || percentage.trim() === '') {
      continue;
    }
    
    if (bankName && percentage && currentProject && currentProject !== 'Project' && !currentProject.match(/^\d+$/)) {
      const projectId = await getProjectId(pool, currentProject);
      if (!projectId) {
        console.log(`  ⚠️  Project not found: ${currentProject}`);
        continue;
      }
      
      const bankId = await getOrCreateBank(pool, bankName);
      if (!bankId) continue;
      
      // Get the Construction loan for this project (prioritize Construction phase)
      const loanResult = await pool.request()
        .input('projectId', sql.Int, projectId)
        .query(`
          SELECT TOP 1 LoanId, LenderId
          FROM banking.Loan 
          WHERE ProjectId = @projectId 
            AND LoanPhase = 'Construction'
          ORDER BY LoanId
        `);
      
      // If no Construction loan, try any loan
      let loanId: number | null = null;
      let existingLenderId: number | null = null;
      if (loanResult.recordset.length > 0) {
        loanId = loanResult.recordset[0].LoanId;
        existingLenderId = loanResult.recordset[0].LenderId;
      } else {
        const anyLoanResult = await pool.request()
          .input('projectId', sql.Int, projectId)
          .query('SELECT TOP 1 LoanId, LenderId FROM banking.Loan WHERE ProjectId = @projectId ORDER BY LoanId');
        if (anyLoanResult.recordset.length > 0) {
          loanId = anyLoanResult.recordset[0].LoanId;
          existingLenderId = anyLoanResult.recordset[0].LenderId;
        }
      }
      
      // Parse percentage to check if this is 100% (lead lender)
      const percentValue = parseFloat(percentage.toString().replace('%', '').replace(',', ''));
      const isFullParticipation = !isNaN(percentValue) && (percentValue >= 99.9 || percentValue === 1 || percentage === '1' || percentage === '1.0' || percentage === '100%');
      
      // If this bank has 100% participation and the loan doesn't have a lender, set it as the lead lender
      if (isFullParticipation && loanId && !existingLenderId) {
        await pool.request()
          .input('LoanId', sql.Int, loanId)
          .input('LenderId', sql.Int, bankId)
          .query('UPDATE banking.Loan SET LenderId = @LenderId WHERE LoanId = @LoanId');
        loansUpdated++;
      }
      
      // Check if participation already exists to avoid duplicates
      const existingCheck = await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('BankId', sql.Int, bankId)
        .query('SELECT ParticipationId FROM banking.Participation WHERE ProjectId = @ProjectId AND BankId = @BankId');
      
      if (existingCheck.recordset.length === 0) {
        // Create the participation record
        await pool.request()
          .input('ProjectId', sql.Int, projectId)
          .input('LoanId', sql.Int, loanId)
          .input('BankId', sql.Int, bankId)
          .input('ParticipationPercent', sql.NVarChar, percentage)
          .input('ExposureAmount', sql.Decimal(18, 2), exposure)
          .input('PaidOff', sql.Bit, paidOff)
          .query(`
            INSERT INTO banking.Participation (ProjectId, LoanId, BankId, ParticipationPercent, ExposureAmount, PaidOff)
            VALUES (@ProjectId, @LoanId, @BankId, @ParticipationPercent, @ExposureAmount, @PaidOff)
          `);
        participationsCreated++;
      }
    }
  }
  
  console.log(`  ✅ Created ${participationsCreated} participations`);
  if (loansUpdated > 0) {
    console.log(`  ✅ Updated ${loansUpdated} loans with lead lender from participations`);
  }
}

async function fixLoanLendersFromParticipations(pool: sql.ConnectionPool) {
  console.log('\n📊 Fixing loan lenders from participations...');
  
  // For loans that don't have a LenderId but have participations,
  // set the LenderId to the bank with the largest participation
  const result = await pool.request().query(`
    UPDATE l
    SET LenderId = (
      SELECT TOP 1 p.BankId
      FROM banking.Participation p
      WHERE p.ProjectId = l.ProjectId
        AND p.LoanId = l.LoanId
        AND p.ExposureAmount IS NOT NULL
        AND p.ExposureAmount > 0
      ORDER BY p.ExposureAmount DESC
    )
    FROM banking.Loan l
    WHERE l.LenderId IS NULL
      AND EXISTS (
        SELECT 1
        FROM banking.Participation p
        WHERE p.ProjectId = l.ProjectId
          AND p.LoanId = l.LoanId
      )
  `);
  
  console.log(`  ✅ Fixed ${result.rowsAffected[0]} loans with missing lenders`);
}

async function importGuarantees(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Importing Guarantees...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  // Find header row (row with "Property Name")
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][1]?.includes('Property Name') || rows[i][2]?.includes('Property Name')) {
      headerRow = i;
      break;
    }
  }
  
  if (headerRow === -1) {
    console.log('⚠️  Could not find header row in Contingent Liabilities CSV');
    return;
  }
  
  let guaranteesCreated = 0;
  let covenantsCreated = 0;
  
  // Person mapping (column indices)
  const personColumns = [
    { name: 'Stoa Holdings, LLC', percentCol: 5, amountCol: 6 },
    { name: 'Toby Easterly', percentCol: 7, amountCol: 8 },
    { name: 'Ryan Nash', percentCol: 9, amountCol: 10 },
    { name: 'Saun Sullivan', percentCol: 11, amountCol: 12 }
  ];
  
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 4) continue;
    
    // Skip section headers
    if (row[0]?.includes('Stabilized') || row[0]?.includes('Under Construction') || 
        row[1]?.includes('Property Name') || row[2]?.includes('Property Name')) {
      continue;
    }
    
    const projectName = row[1]?.trim();
    if (!projectName || projectName === '') continue;
    
    const projectId = await getProjectId(pool, projectName);
    if (!projectId) {
      console.log(`  ⚠️  Project not found: ${projectName}`);
      continue;
    }
    
    // Get loan ID
    const loanResult = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT TOP 1 LoanId FROM banking.Loan WHERE ProjectId = @projectId ORDER BY LoanId');
    const loanId = loanResult.recordset.length > 0 ? loanResult.recordset[0].LoanId : null;
    
    // Add guarantees for each person
    for (const person of personColumns) {
      const percentStr = row[person.percentCol]?.trim();
      const amountStr = row[person.amountCol]?.trim();
      
      if (percentStr && percentStr !== '0' && percentStr !== '0%' && amountStr && amountStr !== '$-' && amountStr !== '') {
        const personId = await getPersonId(pool, person.name);
        if (personId) {
          let percent = parseFloat(percentStr.replace('%', '').replace(',', ''));
          const amount = parseAmount(amountStr);
          
          // Convert to decimal: if > 1, treat as whole number percentage
          if (!isNaN(percent) && percent > 1) {
            percent = percent / 100;
          }
          
          if (!isNaN(percent) && amount !== null) {
            await pool.request()
              .input('ProjectId', sql.Int, projectId)
              .input('LoanId', sql.Int, loanId)
              .input('PersonId', sql.Int, personId)
              .input('GuaranteePercent', sql.Decimal(10, 4), percent)
              .input('GuaranteeAmount', sql.Decimal(18, 2), amount)
              .query(`
                INSERT INTO banking.Guarantee (ProjectId, LoanId, PersonId, GuaranteePercent, GuaranteeAmount)
                VALUES (@ProjectId, @LoanId, @PersonId, @GuaranteePercent, @GuaranteeAmount)
              `);
            guaranteesCreated++;
          }
        }
      }
    }
    
    // Add covenant (last column)
    const covenantText = row[row.length - 1]?.trim();
    if (covenantText && covenantText !== '' && covenantText !== 'None' && covenantText !== 'N/A') {
      await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('LoanId', sql.Int, loanId)
        .input('CovenantType', sql.NVarChar, 'Other')
        .input('Notes', sql.NVarChar(sql.MAX), covenantText)
        .query(`
          INSERT INTO banking.Covenant (ProjectId, LoanId, CovenantType, Notes)
          VALUES (@ProjectId, @LoanId, @CovenantType, @Notes)
        `);
      covenantsCreated++;
    }
  }
  
  console.log(`  ✅ Created ${guaranteesCreated} guarantees`);
  console.log(`  ✅ Created ${covenantsCreated} additional covenants`);
}

// Helper function to get stage priority (higher = more advanced)
function getStagePriority(stage: string | null): number {
  if (!stage) return 0;
  const priorities: { [key: string]: number } = {
    'Prospective': 1,
    'Under Contract': 2,
    'Started': 3,
    'Under Construction': 4,
    'Stabilized': 5,
    'Closed': 6,
    'Liquidated': 7
  };
  return priorities[stage] || 0;
}

// Helper function to intelligently update project data
async function updateProjectData(
  pool: sql.ConnectionPool,
  projectId: number,
  updates: {
    Units?: number | null;
    Location?: string | null;
    City?: string | null;
    State?: string | null;
    Region?: string | null;
    Stage?: string | null;
  }
) {
  // Get current project data
  const current = await pool.request()
    .input('ProjectId', sql.Int, projectId)
    .query('SELECT Units, Location, City, State, Region, Stage FROM core.Project WHERE ProjectId = @ProjectId');
  
  if (current.recordset.length === 0) return;
  
  const currentData = current.recordset[0];
  const fields: string[] = [];
  const request = pool.request().input('ProjectId', sql.Int, projectId);
  
  // Only update Units if current is NULL or 0, or if new value is provided
  if (updates.Units !== null && updates.Units !== undefined && 
      (!currentData.Units || currentData.Units === 0)) {
    fields.push('Units = @Units');
    request.input('Units', sql.Int, Math.floor(updates.Units));
  }
  
  // Only update Location if current is NULL or empty
  if (updates.Location && (!currentData.Location || currentData.Location.trim() === '')) {
    fields.push('Location = @Location');
    request.input('Location', sql.NVarChar, updates.Location);
  }
  
  // Only update City if current is NULL or empty
  if (updates.City && (!currentData.City || currentData.City.trim() === '')) {
    fields.push('City = @City');
    request.input('City', sql.NVarChar, updates.City);
  }
  
  // Only update State if current is NULL or empty
  if (updates.State && (!currentData.State || currentData.State.trim() === '')) {
    fields.push('State = @State');
    request.input('State', sql.NVarChar, updates.State);
  }
  
  // Only update Region if current is NULL or empty
  if (updates.Region && (!currentData.Region || currentData.Region.trim() === '')) {
    fields.push('Region = @Region');
    request.input('Region', sql.NVarChar, updates.Region);
  }
  
  // Only update Stage if new stage is more advanced than current
  // Exception: "Other" can always be set if current stage is NULL or less advanced
  if (updates.Stage) {
    const currentPriority = getStagePriority(currentData.Stage);
    const newPriority = getStagePriority(updates.Stage);
    
    // "Other" stage has priority 0, but we want to set it for non-property projects
    if (updates.Stage === 'Other') {
      // Set "Other" if current stage is NULL or if it's a less specific stage
      if (!currentData.Stage || currentPriority <= 2) {
        fields.push('Stage = @Stage');
        request.input('Stage', sql.NVarChar, updates.Stage);
      }
    } else if (newPriority > currentPriority) {
      fields.push('Stage = @Stage');
      request.input('Stage', sql.NVarChar, updates.Stage);
    }
  }
  
  if (fields.length > 0) {
    fields.push('UpdatedAt = SYSDATETIME()');
    await request.query(`
      UPDATE core.Project
      SET ${fields.join(', ')}
      WHERE ProjectId = @ProjectId
    `);
  }
}

async function updateProjectStages(pool: sql.ConnectionPool) {
  console.log('\n📊 Intelligently Updating Project Stages and Data...');
  
  // Set stage to "Stabilized" for projects with permanent financing (highest priority)
  // Only update if current stage is less advanced than Stabilized
  await pool.request().query(`
    UPDATE core.Project
    SET Stage = 'Stabilized', UpdatedAt = SYSDATETIME()
    WHERE ProjectId IN (
      SELECT DISTINCT ProjectId
      FROM banking.Loan
      WHERE PermanentCloseDate IS NOT NULL
    )
    AND (Stage IS NULL OR Stage IN ('Prospective', 'Under Contract', 'Started', 'Under Construction'))
  `);
  
  // Set stage to "Under Construction" for projects with construction loans that have closing dates
  // but don't have permanent financing yet
  await pool.request().query(`
    UPDATE core.Project
    SET Stage = 'Under Construction', UpdatedAt = SYSDATETIME()
    WHERE ProjectId IN (
      SELECT DISTINCT l.ProjectId
      FROM banking.Loan l
      WHERE l.LoanClosingDate IS NOT NULL
        AND l.LoanPhase = 'Construction'
        AND NOT EXISTS (
          SELECT 1 
          FROM banking.Loan l2 
          WHERE l2.ProjectId = l.ProjectId 
            AND l2.PermanentCloseDate IS NOT NULL
        )
    )
    AND (Stage IS NULL OR Stage = 'Under Contract' OR Stage = 'Started' OR Stage = 'Prospective')
  `);
  
  // Also set "Under Construction" for projects that have construction completion dates
  // but no permanent financing yet (lease-up phase)
  await pool.request().query(`
    UPDATE core.Project
    SET Stage = 'Under Construction', UpdatedAt = SYSDATETIME()
    WHERE ProjectId IN (
      SELECT DISTINCT l.ProjectId
      FROM banking.Loan l
      WHERE l.ConstructionCompletionDate IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 
          FROM banking.Loan l2 
          WHERE l2.ProjectId = l.ProjectId 
            AND l2.PermanentCloseDate IS NOT NULL
        )
    )
    AND (Stage IS NULL OR Stage = 'Under Contract' OR Stage = 'Started' OR Stage = 'Prospective')
  `);
  
  // Set stage to "Prospective" for projects with no construction loans or only $0 construction loans
  // These are deals that haven't secured construction financing yet
  // Only set if current stage is NULL, "Other", or less advanced than "Under Contract"
  await pool.request().query(`
    UPDATE core.Project
    SET Stage = 'Prospective', UpdatedAt = SYSDATETIME()
    WHERE ProjectId IN (
      SELECT p.ProjectId
      FROM core.Project p
      WHERE NOT EXISTS (
        SELECT 1
        FROM banking.Loan l
        WHERE l.ProjectId = p.ProjectId
          AND l.LoanPhase = 'Construction'
          AND l.LoanAmount IS NOT NULL
          AND l.LoanAmount > 0
          AND l.LoanClosingDate IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM banking.Loan l2
        WHERE l2.ProjectId = p.ProjectId
          AND l2.PermanentCloseDate IS NOT NULL
      )
      AND (p.Stage IS NULL OR p.Stage = 'Other' OR p.Stage = 'Prospective')
    )
  `);
  
  // Also set "Prospective" for projects that only have construction loans with $0 amounts
  // or no closing dates (these are prospective deals)
  await pool.request().query(`
    UPDATE core.Project
    SET Stage = 'Prospective', UpdatedAt = SYSDATETIME()
    WHERE ProjectId IN (
      SELECT DISTINCT l.ProjectId
      FROM banking.Loan l
      WHERE l.LoanPhase = 'Construction'
        AND (
          l.LoanAmount IS NULL 
          OR l.LoanAmount = 0
          OR l.LoanClosingDate IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM banking.Loan l2
          WHERE l2.ProjectId = l.ProjectId
            AND l2.LoanPhase = 'Construction'
            AND l2.LoanAmount IS NOT NULL
            AND l2.LoanAmount > 0
            AND l2.LoanClosingDate IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM banking.Loan l3
          WHERE l3.ProjectId = l.ProjectId
            AND l3.PermanentCloseDate IS NOT NULL
        )
    )
    AND (Stage IS NULL OR Stage = 'Other' OR Stage = 'Prospective')
  `);
  
  console.log('  ✅ Updated project stages intelligently based on all data sources');
}

async function main() {
  console.log('🚀 Starting Database Seed from Seed CSVs...\n');
  
  const pool = await getPool();
  const seedDir = path.join(__dirname, '../../stoa_seed_csvs');
  
  try {
    // Step 1: Wipe all data
    await wipeDatabase(pool);
    
    // Step 2: Import core data
    await importProjects(pool, path.join(seedDir, 'core_project_seed.csv'));
    
    // Step 3: Import banking data
    await importLoans(pool, path.join(seedDir, 'banking_loan_seed.csv'));
    await importDSCRTests(pool, path.join(seedDir, 'banking_dscrtest_seed.csv'));
    await importLiquidityRequirements(pool, path.join(seedDir, 'banking_liquidityrequirement_seed.csv'));
    await importOccupancyCovenants(pool, path.join(seedDir, 'banking_covenant_occupancy_seed.csv'));
    
    // Step 4: Import pipeline data
    await importUnderContract(pool, path.join(seedDir, 'pipeline_undercontract_seed.csv'));
    await importClosedProperties(pool, path.join(seedDir, 'pipeline_closedproperty_seed.csv'));
    await importCommercialListed(pool, path.join(seedDir, 'pipeline_commerciallisted_seed.csv'));
    await importCommercialAcreage(pool, path.join(seedDir, 'pipeline_commercialacreage_seed.csv'));
    
    // Step 5: Import participations and guarantees from raw CSV files
    await importParticipations(pool, path.join(seedDir, 'raw_banking_dashboard_workbook_participants.csv'));
    await importGuarantees(pool, path.join(seedDir, 'raw_banking_dashboard_workbook_contingent_liabilities.csv'));
    
    // Step 5.5: Fix loans that have participations but no LenderId
    await fixLoanLendersFromParticipations(pool);
    
    // Step 6: Update project stages based on data
    await updateProjectStages(pool);
    
    console.log('\n✅ Database seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  main();
}
