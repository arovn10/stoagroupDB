#!/usr/bin/env ts-node
/**
 * Import Flat Export CSVs
 * 
 * Seeds the database from normalized flat export CSV files:
 * - projects.csv → core.Project
 * - loans.csv → banking.Loan
 * - dscr_tests.csv → banking.DSCRTest
 * - liquidity_requirements.csv → banking.LiquidityRequirement
 * - occupancy_covenants.csv → banking.Covenant
 * 
 * IMPORTANT: This script OVERWRITES existing data. If a project already exists,
 * all its data will be replaced with values from the CSV files.
 * 
 * Usage: npm run db:import-flat-exports
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
  
  // Create bank
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
  // Map common names
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

async function getLoanId(pool: sql.ConnectionPool, projectId: number): Promise<number | null> {
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query('SELECT TOP 1 LoanId FROM banking.Loan WHERE ProjectId = @projectId ORDER BY LoanId');
  return result.recordset.length > 0 ? result.recordset[0].LoanId : null;
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

function determineStage(stageBucket: string | null, section: string | null): string | null {
  if (!stageBucket && !section) return null;
  const bucket = (stageBucket || section || '').toLowerCase();
  
  if (bucket.includes('liquidated')) return 'Liquidated';
  if (bucket.includes('closed')) return 'Closed';
  if (bucket.includes('stabilized')) return 'Stabilized';
  if (bucket.includes('started') || bucket.includes('construction') || bucket.includes('lease-up')) return 'Started';
  if (bucket.includes('under contract') || bucket.includes('pre-construction')) return 'Under Contract';
  if (bucket.includes('prospective')) return 'Prospective';
  
  return null;
}

async function importProjects(pool: sql.ConnectionPool, csvPath: string) {
  console.log('📊 Importing Projects...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  if (rows.length < 2) {
    console.log('⚠️  No data rows found');
    return;
  }
  
  const headers = rows[0];
  const projectNameCol = getColumnIndex(headers, 'ProjectName');
  const locationCol = getColumnIndex(headers, 'Location');
  const cityCol = getColumnIndex(headers, 'City');
  const stateCol = getColumnIndex(headers, 'State');
  const unitsCol = getColumnIndex(headers, 'Units');
  const stageBucketCol = getColumnIndex(headers, 'StageBucket');
  const sectionCol = getColumnIndex(headers, 'Section');
  
  if (projectNameCol === -1) {
    console.log('⚠️  ProjectName column not found');
    return;
  }
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  
  // Skip section headers
  const skipNames = ['Pre-Construction', 'Liquidated', 'Plane Loan', 'Tredge', 'Stoa Construction, LLC'];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= projectNameCol) continue;
    
    const projectName = row[projectNameCol]?.trim();
    if (!projectName || projectName.length < 3) continue;
    if (skipNames.includes(projectName)) {
      skipped++;
      continue;
    }
    
    const location = locationCol >= 0 ? row[locationCol]?.trim() || null : null;
    const city = cityCol >= 0 ? row[cityCol]?.trim() || null : null;
    const state = stateCol >= 0 ? row[stateCol]?.trim() || null : null;
    const units = unitsCol >= 0 ? (row[unitsCol] ? parseFloat(row[unitsCol]) || null : null) : null;
    const stageBucket = stageBucketCol >= 0 ? row[stageBucketCol]?.trim() || null : null;
    const section = sectionCol >= 0 ? row[sectionCol]?.trim() || null : null;
    
    const region = determineRegion(state, location);
    const productType = determineProductType(projectName);
    const stage = determineStage(stageBucket, section);
    
    // Check if project exists
    const existingId = await getProjectId(pool, projectName);
    
    if (existingId) {
      // Update existing project - override with CSV data
      await pool.request()
        .input('ProjectId', sql.Int, existingId)
        .input('City', sql.NVarChar, city)
        .input('State', sql.NVarChar, state)
        .input('Region', sql.NVarChar, region)
        .input('Location', sql.NVarChar, location)
        .input('Units', sql.Int, units)
        .input('ProductType', sql.NVarChar, productType)
        .input('Stage', sql.NVarChar, stage)
        .query(`
          UPDATE core.Project
          SET City = @City,
              State = @State,
              Region = @Region,
              Location = @Location,
              Units = @Units,
              ProductType = @ProductType,
              Stage = @Stage,
              UpdatedAt = SYSDATETIME()
          WHERE ProjectId = @ProjectId
        `);
      updated++;
    } else {
      // Create new project
      await pool.request()
        .input('ProjectName', sql.NVarChar, projectName)
        .input('City', sql.NVarChar, city)
        .input('State', sql.NVarChar, state)
        .input('Region', sql.NVarChar, region)
        .input('Location', sql.NVarChar, location)
        .input('Units', sql.Int, units)
        .input('ProductType', sql.NVarChar, productType)
        .input('Stage', sql.NVarChar, stage)
        .query(`
          INSERT INTO core.Project (ProjectName, City, State, Region, Location, Units, ProductType, Stage)
          VALUES (@ProjectName, @City, @State, @Region, @Location, @Units, @ProductType, @Stage)
        `);
      created++;
    }
  }
  
  console.log(`  ✅ Created ${created} projects, updated ${updated} projects, skipped ${skipped} non-projects`);
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
  const projectNameCol = getColumnIndex(headers, 'ProjectName');
  const loanTypeCol = getColumnIndex(headers, 'LoanType');
  const lenderCol = getColumnIndex(headers, 'ConstructionLender');
  const amountCol = getColumnIndex(headers, 'ConstructionLoanAmount');
  const closingDateCol = getColumnIndex(headers, 'ConstructionLoanClosingDate');
  const completionDateCol = getColumnIndex(headers, 'ConstructionCompletionDate');
  const leaseUpDateCol = getColumnIndex(headers, 'LeaseUpCompletedDate');
  const ioMaturityCol = getColumnIndex(headers, 'ConstructionIOMaturity');
  const fixedOrFloatingCol = getColumnIndex(headers, 'FixedOrFloating');
  const indexCol = getColumnIndex(headers, 'IndexName');
  const spreadCol = getColumnIndex(headers, 'Spread');
  const miniPermMaturityCol = getColumnIndex(headers, 'MiniPermMaturity');
  const miniPermRateCol = getColumnIndex(headers, 'MiniPermInterestRate');
  const permPhaseMaturityCol = getColumnIndex(headers, 'ConstructionPermPhaseMaturity');
  const permPhaseRateCol = getColumnIndex(headers, 'ConstructionPermPhaseInterestRate');
  const permCloseDateCol = getColumnIndex(headers, 'PermanentFinancingCloseDate');
  const permLenderCol = getColumnIndex(headers, 'PermanentFinancingLender');
  const permAmountCol = getColumnIndex(headers, 'PermanentFinancingLoanAmount');
  
  if (projectNameCol === -1) {
    console.log('⚠️  ProjectName column not found');
    return;
  }
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  
  const skipNames = ['Pre-Construction', 'Liquidated', 'Plane Loan', 'Tredge', 'Stoa Construction, LLC'];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= projectNameCol) continue;
    
    const projectName = row[projectNameCol]?.trim();
    if (!projectName || projectName.length < 3) continue;
    if (skipNames.includes(projectName)) {
      skipped++;
      continue;
    }
    
    const projectId = await getProjectId(pool, projectName);
    if (!projectId) {
      console.log(`  ⚠️  Project not found: ${projectName}`);
      skipped++;
      continue;
    }
    
    const loanType = loanTypeCol >= 0 ? row[loanTypeCol]?.trim() || null : null;
    const lenderName = lenderCol >= 0 ? row[lenderCol]?.trim() || null : null;
    const loanAmount = amountCol >= 0 ? parseAmount(row[amountCol]) : null;
    const closingDate = closingDateCol >= 0 ? parseDate(row[closingDateCol]) : null;
    const completionDate = completionDateCol >= 0 ? row[completionDateCol]?.trim() || null : null;
    const leaseUpDate = leaseUpDateCol >= 0 ? row[leaseUpDateCol]?.trim() || null : null;
    const ioMaturity = ioMaturityCol >= 0 ? parseDate(row[ioMaturityCol]) : null;
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
    
    // Determine loan phase
    let loanPhase = 'Construction';
    if (loanType && loanType.includes('Land')) {
      loanPhase = 'Land';
    } else if (loanType && loanType.includes('Permanent')) {
      loanPhase = 'Permanent';
    }
    
    // Get lender ID
    let lenderId = null;
    if (lenderName) {
      lenderId = await getOrCreateBank(pool, lenderName);
    }
    
    // Only process if we have at least amount or date
    if (!loanAmount && !closingDate && !lenderId) {
      skipped++;
      continue;
    }
    
    // Check if loan exists
    const existingLoan = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('LoanPhase', sql.NVarChar, loanPhase)
      .query('SELECT LoanId FROM banking.Loan WHERE ProjectId = @ProjectId AND LoanPhase = @LoanPhase');
    
    if (existingLoan.recordset.length > 0) {
      // Update existing loan
      const loanId = existingLoan.recordset[0].LoanId;
      await pool.request()
        .input('LoanId', sql.Int, loanId)
        .input('LoanType', sql.NVarChar, loanType)
        .input('Borrower', sql.NVarChar, projectName)
        .input('LenderId', sql.Int, lenderId)
        .input('LoanAmount', sql.Decimal(18, 2), loanAmount)
        .input('LoanClosingDate', sql.Date, closingDate)
        .input('ConstructionCompletionDate', sql.NVarChar, completionDate)
        .input('LeaseUpCompletedDate', sql.NVarChar, leaseUpDate)
        .input('IOMaturityDate', sql.Date, ioMaturity)
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
          UPDATE banking.Loan
          SET LoanType = @LoanType,
              Borrower = @Borrower,
              LenderId = @LenderId,
              LoanAmount = @LoanAmount,
              LoanClosingDate = @LoanClosingDate,
              ConstructionCompletionDate = @ConstructionCompletionDate,
              LeaseUpCompletedDate = @LeaseUpCompletedDate,
              IOMaturityDate = @IOMaturityDate,
              FixedOrFloating = @FixedOrFloating,
              IndexName = @IndexName,
              Spread = @Spread,
              MiniPermMaturity = @MiniPermMaturity,
              MiniPermInterestRate = @MiniPermInterestRate,
              PermPhaseMaturity = @PermPhaseMaturity,
              PermPhaseInterestRate = @PermPhaseInterestRate,
              PermanentCloseDate = @PermanentCloseDate,
              PermanentLoanAmount = @PermanentLoanAmount
          WHERE LoanId = @LoanId
        `);
      updated++;
    } else {
      // Create new loan
      await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('LoanType', sql.NVarChar, loanType)
        .input('Borrower', sql.NVarChar, projectName)
        .input('LoanPhase', sql.NVarChar, loanPhase)
        .input('LenderId', sql.Int, lenderId)
        .input('LoanAmount', sql.Decimal(18, 2), loanAmount)
        .input('LoanClosingDate', sql.Date, closingDate)
        .input('ConstructionCompletionDate', sql.NVarChar, completionDate)
        .input('LeaseUpCompletedDate', sql.NVarChar, leaseUpDate)
        .input('IOMaturityDate', sql.Date, ioMaturity)
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
  }
  
  console.log(`  ✅ Created ${created} loans, updated ${updated} loans, skipped ${skipped} rows`);
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
  const projectNameCol = getColumnIndex(headers, 'ProjectName');
  const testNumberCol = getColumnIndex(headers, 'TestNumber');
  const testDateCol = getColumnIndex(headers, 'TestDate');
  const projectedRateCol = getColumnIndex(headers, 'ProjectedInterestRate');
  const requirementCol = getColumnIndex(headers, 'Requirement');
  const projectedValueCol = getColumnIndex(headers, 'ProjectedValue');
  
  if (projectNameCol === -1 || testNumberCol === -1) {
    console.log('⚠️  Required columns not found');
    return;
  }
  
  let created = 0;
  let updated = 0;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= projectNameCol) continue;
    
    const projectName = row[projectNameCol]?.trim();
    if (!projectName) continue;
    
    const projectId = await getProjectId(pool, projectName);
    if (!projectId) continue;
    
    const testNumber = testNumberCol >= 0 ? parseInt(row[testNumberCol]) || null : null;
    if (!testNumber || testNumber < 1 || testNumber > 3) continue;
    
    const testDate = testDateCol >= 0 ? parseDate(row[testDateCol]) : null;
    const projectedRate = projectedRateCol >= 0 ? (row[projectedRateCol] ? row[projectedRateCol].toString() : null) : null;
    const requirement = requirementCol >= 0 ? parseAmount(row[requirementCol]) : null;
    const projectedValue = projectedValueCol >= 0 ? (row[projectedValueCol] ? row[projectedValueCol].toString() : null) : null;
    
    if (!testDate) continue; // Skip if no test date
    
    // Check if exists
    const existing = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('TestNumber', sql.Int, testNumber)
      .query('SELECT DSCRTestId FROM banking.DSCRTest WHERE ProjectId = @ProjectId AND TestNumber = @TestNumber');
    
    if (existing.recordset.length > 0) {
      // Update
      await pool.request()
        .input('DSCRTestId', sql.Int, existing.recordset[0].DSCRTestId)
        .input('TestDate', sql.Date, testDate)
        .input('ProjectedInterestRate', sql.NVarChar, projectedRate)
        .input('Requirement', sql.Decimal(10, 2), requirement)
        .input('ProjectedValue', sql.NVarChar, projectedValue)
        .query(`
          UPDATE banking.DSCRTest
          SET TestDate = @TestDate,
              ProjectedInterestRate = @ProjectedInterestRate,
              Requirement = @Requirement,
              ProjectedValue = @ProjectedValue
          WHERE DSCRTestId = @DSCRTestId
        `);
      updated++;
    } else {
      // Create
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
  }
  
  console.log(`  ✅ Created ${created} DSCR tests, updated ${updated} DSCR tests`);
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
  const projectNameCol = getColumnIndex(headers, 'ProjectName');
  const totalCol = getColumnIndex(headers, 'LiquidityTotal');
  const lendingBankCol = getColumnIndex(headers, 'LiquidityLendingBank');
  
  if (projectNameCol === -1) {
    console.log('⚠️  ProjectName column not found');
    return;
  }
  
  let created = 0;
  let updated = 0;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= projectNameCol) continue;
    
    const projectName = row[projectNameCol]?.trim();
    if (!projectName) continue;
    
    const projectId = await getProjectId(pool, projectName);
    if (!projectId) continue;
    
    const totalAmount = totalCol >= 0 ? parseAmount(row[totalCol]) : null;
    const lendingBankAmount = lendingBankCol >= 0 ? parseAmount(row[lendingBankCol]) : null;
    
    if (!totalAmount && !lendingBankAmount) continue;
    
    // Check if exists
    const existing = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .query('SELECT LiquidityRequirementId FROM banking.LiquidityRequirement WHERE ProjectId = @ProjectId');
    
    if (existing.recordset.length > 0) {
      // Update
      await pool.request()
        .input('LiquidityRequirementId', sql.Int, existing.recordset[0].LiquidityRequirementId)
        .input('TotalAmount', sql.Decimal(18, 2), totalAmount)
        .input('LendingBankAmount', sql.Decimal(18, 2), lendingBankAmount)
        .query(`
          UPDATE banking.LiquidityRequirement
          SET TotalAmount = @TotalAmount,
              LendingBankAmount = @LendingBankAmount
          WHERE LiquidityRequirementId = @LiquidityRequirementId
        `);
      updated++;
    } else {
      // Create
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
  }
  
  console.log(`  ✅ Created ${created} liquidity requirements, updated ${updated} liquidity requirements`);
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
  const projectNameCol = getColumnIndex(headers, 'ProjectName');
  const covenantDateCol = getColumnIndex(headers, 'OccupancyCovenantDate');
  const requirementCol = getColumnIndex(headers, 'OccupancyRequirement');
  const projectedValueCol = getColumnIndex(headers, 'ProjectedOccupancyPct');
  
  if (projectNameCol === -1) {
    console.log('⚠️  ProjectName column not found');
    return;
  }
  
  let created = 0;
  let updated = 0;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= projectNameCol) continue;
    
    const projectName = row[projectNameCol]?.trim();
    if (!projectName) continue;
    
    const projectId = await getProjectId(pool, projectName);
    if (!projectId) continue;
    
    const covenantDate = covenantDateCol >= 0 ? parseDate(row[covenantDateCol]) : null;
    const requirement = requirementCol >= 0 ? (row[requirementCol] ? row[requirementCol].toString() : null) : null;
    const projectedValue = projectedValueCol >= 0 ? (row[projectedValueCol] ? row[projectedValueCol].toString() : null) : null;
    
    if (!covenantDate && !requirement) continue;
    
    // Check if exists
    const existing = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('CovenantType', sql.NVarChar, 'Occupancy')
      .query('SELECT CovenantId FROM banking.Covenant WHERE ProjectId = @ProjectId AND CovenantType = @CovenantType');
    
    if (existing.recordset.length > 0) {
      // Update
      await pool.request()
        .input('CovenantId', sql.Int, existing.recordset[0].CovenantId)
        .input('CovenantDate', sql.Date, covenantDate)
        .input('Requirement', sql.NVarChar, requirement)
        .input('ProjectedValue', sql.NVarChar, projectedValue)
        .query(`
          UPDATE banking.Covenant
          SET CovenantDate = @CovenantDate,
              Requirement = @Requirement,
              ProjectedValue = @ProjectedValue
          WHERE CovenantId = @CovenantId
        `);
      updated++;
    } else {
      // Create
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
  }
  
  console.log(`  ✅ Created ${created} covenants, updated ${updated} covenants`);
}

async function importParticipants(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Importing Participations...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  // Find header row
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0]?.includes('Project') || rows[i][2]?.includes('Project')) {
      headerRow = i;
      break;
    }
  }
  
  if (headerRow === -1) {
    console.log('⚠️  Could not find header row in Participants CSV');
    return;
  }
  
  let participationsCreated = 0;
  let currentProject = '';
  
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 4) continue;
    
    // Check if this is a project name row (starts with "The" or has dollar amount)
    const col0 = row[0]?.trim();
    const col2 = row[2]?.trim();
    
    if (col0 && (col0.includes('The') || col0.includes('Waters') || col0.includes('Heights') || col0.includes('Flats'))) {
      currentProject = col0.replace(/[$",]/g, '').trim();
    } else if (col2 && (col2.includes('The') || col2.includes('Waters') || col2.includes('Heights') || col2.includes('Flats'))) {
      currentProject = col2.replace(/[$",]/g, '').trim();
    }
    
    // Check if this is a participation row
    const bankName = row[1]?.trim() || row[3]?.trim();
    const percentage = row[2]?.trim() || row[4]?.trim();
    const exposure = parseAmount(row[3]) || parseAmount(row[5]);
    const paidOff = row.length > 9 ? (parseAmount(row[9]) !== null) : false;
    
    // Skip rows with zero/null exposure or 0% participation
    if (!exposure || exposure === 0 || !percentage || percentage === '0' || percentage === '0%' || percentage.trim() === '') {
      continue;
    }
    
    if (bankName && percentage && currentProject && currentProject !== 'Project' && !currentProject.match(/^\d+$/)) {
      const projectId = await getProjectId(pool, currentProject);
      if (!projectId) continue;
      
      const bankId = await getOrCreateBank(pool, bankName);
      if (!bankId) continue;
      
      const loanId = await getLoanId(pool, projectId);
      
      await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('LoanId', sql.Int, loanId)
        .input('BankId', sql.Int, bankId)
        .input('ParticipationPercent', sql.NVarChar, percentage)
        .input('ExposureAmount', sql.Decimal(18, 2), exposure)
        .input('PaidOff', sql.Bit, paidOff)
        .query(`
          MERGE banking.Participation AS target
          USING (SELECT @ProjectId AS ProjectId, @BankId AS BankId) AS source
          ON target.ProjectId = source.ProjectId AND target.BankId = source.BankId
          WHEN MATCHED THEN
            UPDATE SET
              LoanId = @LoanId,
              ParticipationPercent = @ParticipationPercent,
              ExposureAmount = @ExposureAmount,
              PaidOff = @PaidOff
          WHEN NOT MATCHED THEN
            INSERT (ProjectId, LoanId, BankId, ParticipationPercent, ExposureAmount, PaidOff)
            VALUES (@ProjectId, @LoanId, @BankId, @ParticipationPercent, @ExposureAmount, @PaidOff);
        `);
      participationsCreated++;
    }
  }
  
  console.log(`  ✅ Processed ${participationsCreated} participations`);
}

async function importContingentLiabilities(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Importing Guarantees...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  // Find header row (row with "Property Name" - in flat export CSV, it's in column 2)
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Check multiple columns for "Property Name"
    if ((row[1] && row[1].includes('Property Name')) || 
        (row[2] && row[2].includes('Property Name')) ||
        (row[3] && row[3].includes('Property Name'))) {
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
  
  // Person mapping (column indices - adjusted for raw CSV structure)
  // In flat export CSV structure: SourceWorkbook, SourceSheet, Col1 (row num), Col2 (Property Name), Col3 (date), Col4 (amount), Col5 (lender), 
  // Col6 (Stoa Holdings %), Col7 (Stoa Holdings $), Col8 (Toby %), Col9 (Toby $), Col10 (Ryan %), Col11 (Ryan $), Col12 (Saun %), Col13 (Saun $), Col14 (Covenants)
  const personColumns = [
    { name: 'Stoa Holdings, LLC', percentCol: 6, amountCol: 7 },
    { name: 'Toby Easterly', percentCol: 8, amountCol: 9 },
    { name: 'Ryan Nash', percentCol: 10, amountCol: 11 },
    { name: 'Saun Sullivan', percentCol: 12, amountCol: 13 }
  ];
  
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 4) continue;
    
    // Skip section headers and empty rows
    // Row structure: [SourceWorkbook, SourceSheet, Col1, Col2 (Property Name), ...]
    if (row[2]?.includes('Stabilized') || row[2]?.includes('Under Construction') || 
        row[2]?.includes('Pre-Construction') || row[2]?.includes('Under Contract') ||
        row[3]?.includes('Property Name') || row[2]?.includes('Property Name') ||
        !row[3] || row[3].trim() === '' || row[3].match(/^\d+$/)) {
      // Skip if Col2 (index 2) is just a number (row number) or empty
      continue;
    }
    
    // Project name is in Col2 (index 3) in the flat export CSV
    const projectName = row[3]?.trim();
    if (!projectName || projectName === '') continue;
    
    const projectId = await getProjectId(pool, projectName);
    if (!projectId) {
      console.log(`  ⚠️  Project not found: ${projectName}`);
      continue;
    }
    
    const loanId = await getLoanId(pool, projectId);
    
    // Add guarantees for each person
    for (const person of personColumns) {
      const percentStr = row[person.percentCol]?.trim();
      const amountStr = row[person.amountCol]?.trim();
      
      if (percentStr && percentStr !== '0' && percentStr !== '0%' && amountStr && amountStr !== '$-' && amountStr !== '') {
        const personId = await getPersonId(pool, person.name);
        if (personId) {
          let percent = parseFloat(percentStr.replace('%', '').replace(',', ''));
          const amount = parseAmount(amountStr);
          
          // Convert to decimal: if > 1, treat as whole number percentage (e.g., 1 = 100% = 1.0)
          // if <= 1, treat as decimal (e.g., 0.5 = 50% = 0.5)
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
                MERGE banking.Guarantee AS target
                USING (SELECT @ProjectId AS ProjectId, @PersonId AS PersonId) AS source
                ON target.ProjectId = source.ProjectId AND target.PersonId = source.PersonId
                WHEN MATCHED THEN
                  UPDATE SET
                    LoanId = @LoanId,
                    GuaranteePercent = @GuaranteePercent,
                    GuaranteeAmount = @GuaranteeAmount
                WHEN NOT MATCHED THEN
                  INSERT (ProjectId, LoanId, PersonId, GuaranteePercent, GuaranteeAmount)
                  VALUES (@ProjectId, @LoanId, @PersonId, @GuaranteePercent, @GuaranteeAmount);
              `);
            guaranteesCreated++;
          }
        }
      }
    }
    
    // Add covenant (last column) - only if it doesn't already exist with same notes
    const covenantText = row[row.length - 1]?.trim();
    if (covenantText && covenantText !== '' && covenantText !== 'None' && covenantText !== 'N/A') {
      await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('LoanId', sql.Int, loanId)
        .input('CovenantType', sql.NVarChar, 'Other')
        .input('Notes', sql.NVarChar(sql.MAX), covenantText)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM banking.Covenant WHERE ProjectId = @ProjectId AND Notes = @Notes)
          INSERT INTO banking.Covenant (ProjectId, LoanId, CovenantType, Notes)
          VALUES (@ProjectId, @LoanId, @CovenantType, @Notes)
          ELSE
          UPDATE banking.Covenant
          SET LoanId = @LoanId, CovenantType = @CovenantType
          WHERE ProjectId = @ProjectId AND Notes = @Notes
        `);
      covenantsCreated++;
    }
  }
  
  console.log(`  ✅ Processed ${guaranteesCreated} guarantees`);
  console.log(`  ✅ Processed ${covenantsCreated} additional covenants`);
}

async function main() {
  console.log('🚀 Starting Flat Export CSV Import...\n');
  
  const pool = await getPool();
  const exportsDir = path.join(__dirname, '../../stoa_flat_exports_csv');
  
  try {
    // Import in order: Projects first, then banking data
    await importProjects(pool, path.join(exportsDir, 'projects.csv'));
    await importLoans(pool, path.join(exportsDir, 'loans.csv'));
    await importDSCRTests(pool, path.join(exportsDir, 'dscr_tests.csv'));
    await importLiquidityRequirements(pool, path.join(exportsDir, 'liquidity_requirements.csv'));
    await importOccupancyCovenants(pool, path.join(exportsDir, 'occupancy_covenants.csv'));
    
    // Import participations and guarantees from raw CSV files
    await importParticipants(pool, path.join(exportsDir, 'raw_Banking_Dashboard_xlsx_Participants.csv'));
    await importContingentLiabilities(pool, path.join(exportsDir, 'raw_Banking_Dashboard_xlsx_Contingent_Liabilities.csv'));
    
    console.log('\n✅ All flat export data imported successfully!');
  } catch (error) {
    console.error('❌ Error importing data:', error);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  main();
}
