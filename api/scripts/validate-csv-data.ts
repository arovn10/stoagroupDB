#!/usr/bin/env ts-node
/**
 * Validate CSV Data Against Database
 * 
 * Reads all CSV files and compares them with database records to identify discrepancies
 * 
 * Usage: npm run db:validate-csv
 */

import * as fs from 'fs';
import * as path from 'path';
import { getPool } from './db-manipulate';
import sql from 'mssql';

interface Discrepancy {
  type: string;
  projectName?: string;
  field: string;
  csvValue: any;
  dbValue: any;
  message: string;
}

const discrepancies: Discrepancy[] = [];

// Helper functions (same as import script)
function parseAmount(str: string | null | undefined): number | null {
  if (!str || str.trim() === '' || str === 'N/A' || str === '-' || str === '$-') return null;
  const cleaned = str.replace(/[$,]/g, '').trim();
  return cleaned ? parseFloat(cleaned) || null : null;
}

function parseDate(str: string | null | undefined): string | null {
  if (!str || str.trim() === '' || str === 'N/A' || str === '-') return null;
  const trimmed = str.trim();
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
  
  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    const nextChar = csvContent[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
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
        fields.push(field.trim());
        field = '';
      } else {
        field += char;
      }
    }
    fields.push(field.trim());
    return fields;
  });
}

function normalizeString(str: string | null | undefined): string {
  if (!str) return '';
  return str.trim().toLowerCase();
}

function compareValues(csvVal: any, dbVal: any, field: string): boolean {
  if (csvVal === null || csvVal === undefined || csvVal === '') {
    return dbVal === null || dbVal === undefined || dbVal === '';
  }
  if (dbVal === null || dbVal === undefined) {
    return csvVal === null || csvVal === undefined || csvVal === '';
  }
  
  // Compare numbers
  if (typeof csvVal === 'number' && typeof dbVal === 'number') {
    return Math.abs(csvVal - dbVal) < 0.01;
  }
  
  // Compare strings (case-insensitive)
  return normalizeString(String(csvVal)) === normalizeString(String(dbVal));
}

async function validateBankingDashboard(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Validating Banking Dashboard data...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0]?.includes('Birth Order')) {
      headerRow = i;
      break;
    }
  }
  
  if (headerRow === -1) {
    console.log('⚠️  Could not find header row');
    return;
  }
  
  const headers = rows[headerRow];
  let validated = 0;
  let errors = 0;
  
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3 || !row[1] || row[1].trim() === '') continue;
    
    const borrower = row[1]?.trim();
    const skipPatterns = [
      'Other', 'Loan', 'Multifamily', 'Under Contract', 'Liquidated',
      'Pre-Construction', 'Stoa Construction', 'Construction',
      'Banks that have expressed', 'Bank', 'United Bank', 'Atlantic Union',
      'Pinnacle Bank', 'Live Oak', 'Bank of America', 'Bank OZK',
      'Valley Bank', 'Regions', 'Truist', 'United Community',
      'Servis1st', 'First Bank', 'First Citizens', 'Total', 'Portfolio',
      'Under Construction', 'Lease-Up', 'NC/SC Deal', 'Deal #'
    ];
    
    if (skipPatterns.some(pattern => borrower.includes(pattern))) continue;
    if (borrower.length < 5) continue;
    
    // Get project from database - try exact match first, then try with ", LLC" suffix
    let projectResult = await pool.request()
      .input('name', sql.NVarChar, borrower)
      .query('SELECT ProjectId, ProjectName FROM core.Project WHERE ProjectName = @name');
    
    // If not found, try adding ", LLC" suffix (common pattern)
    if (projectResult.recordset.length === 0 && !borrower.includes(', LLC')) {
      const borrowerWithLLC = borrower + ', LLC';
      projectResult = await pool.request()
        .input('name', sql.NVarChar, borrowerWithLLC)
        .query('SELECT ProjectId, ProjectName FROM core.Project WHERE ProjectName = @name');
    }
    
    // If still not found, try removing ", LLC" if present
    if (projectResult.recordset.length === 0 && borrower.includes(', LLC')) {
      const borrowerWithoutLLC = borrower.replace(', LLC', '').trim();
      projectResult = await pool.request()
        .input('name', sql.NVarChar, borrowerWithoutLLC)
        .query('SELECT ProjectId, ProjectName FROM core.Project WHERE ProjectName = @name');
    }
    
    if (projectResult.recordset.length === 0) {
      discrepancies.push({
        type: 'Banking Dashboard - Loan',
        projectName: borrower,
        field: 'Project',
        csvValue: borrower,
        dbValue: 'NOT FOUND',
        message: `Project "${borrower}" not found in database`
      });
      errors++;
      continue;
    }
    
    const projectId = projectResult.recordset[0].ProjectId;
    const projectName = projectResult.recordset[0].ProjectName;
    
    // Get loan from database
    const loanResult = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT TOP 1 * FROM banking.Loan WHERE ProjectId = @projectId ORDER BY LoanId');
    
    if (loanResult.recordset.length === 0) {
      discrepancies.push({
        type: 'Banking Dashboard - Loan',
        projectName,
        field: 'Loan',
        csvValue: 'EXISTS',
        dbValue: 'NOT FOUND',
        message: `No loan found for project "${projectName}"`
      });
      errors++;
      continue;
    }
    
    const loan = loanResult.recordset[0];
    
    // Validate loan fields - only check if CSV has data
    // Column 6 = Construction Loan Amount, Column 7 = Construction Loan Closing
    if (row.length > 6 && row[6] && row[6].trim() !== '') {
      const loanAmount = parseAmount(row[6]);
      if (loanAmount !== null && !compareValues(loanAmount, loan.LoanAmount, 'LoanAmount')) {
        discrepancies.push({
          type: 'Banking Dashboard - Loan',
          projectName,
          field: 'LoanAmount',
          csvValue: loanAmount,
          dbValue: loan.LoanAmount,
          message: `Loan amount mismatch for "${projectName}"`
        });
        errors++;
      }
    }
    
    if (row.length > 7 && row[7] && row[7].trim() !== '') {
      const closingDate = parseDate(row[7]);
      if (closingDate !== null && !compareValues(closingDate, loan.LoanClosingDate?.toISOString().split('T')[0], 'LoanClosingDate')) {
        discrepancies.push({
          type: 'Banking Dashboard - Loan',
          projectName,
          field: 'LoanClosingDate',
          csvValue: closingDate,
          dbValue: loan.LoanClosingDate?.toISOString().split('T')[0],
          message: `Loan closing date mismatch for "${projectName}"`
        });
        errors++;
      }
    }
    
    // Validate DSCR Tests
    const dscr1Date = parseDate(row[18]);
    if (dscr1Date) {
      const dscrResult = await pool.request()
        .input('projectId', sql.Int, projectId)
        .input('testNumber', sql.Int, 1)
        .query('SELECT * FROM banking.DSCRTest WHERE ProjectId = @projectId AND TestNumber = @testNumber');
      
      if (dscrResult.recordset.length === 0) {
        discrepancies.push({
          type: 'Banking Dashboard - DSCR Test 1',
          projectName,
          field: 'TestDate',
          csvValue: dscr1Date,
          dbValue: 'NOT FOUND',
          message: `DSCR Test 1 not found for "${projectName}"`
        });
        errors++;
      }
    }
    
    // Validate Liquidity Requirements
    const liquidityTotal = parseAmount(row[30]);
    if (liquidityTotal) {
      const liqResult = await pool.request()
        .input('projectId', sql.Int, projectId)
        .query('SELECT * FROM banking.LiquidityRequirement WHERE ProjectId = @projectId');
      
      if (liqResult.recordset.length === 0) {
        discrepancies.push({
          type: 'Banking Dashboard - Liquidity',
          projectName,
          field: 'TotalAmount',
          csvValue: liquidityTotal,
          dbValue: 'NOT FOUND',
          message: `Liquidity requirement not found for "${projectName}"`
        });
        errors++;
      } else if (!compareValues(liquidityTotal, liqResult.recordset[0].TotalAmount, 'TotalAmount')) {
        discrepancies.push({
          type: 'Banking Dashboard - Liquidity',
          projectName,
          field: 'TotalAmount',
          csvValue: liquidityTotal,
          dbValue: liqResult.recordset[0].TotalAmount,
          message: `Liquidity total amount mismatch for "${projectName}"`
        });
        errors++;
      }
    }
    
    validated++;
  }
  
  console.log(`  ✅ Validated ${validated} projects`);
  console.log(`  ❌ Found ${errors} discrepancies`);
}

async function validateParticipants(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Validating Participants data...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  let validated = 0;
  let errors = 0;
  let currentProject = '';
  
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 4) continue;
    
    const projectName = row[0]?.trim();
    const bankName = row[1]?.trim();
    const percent = row[2]?.trim();
    const exposure = parseAmount(row[3]);
    
    // Check if this is a project name row (has project name but no bank)
    if (projectName && projectName.length > 5 && !bankName) {
      currentProject = projectName;
      continue;
    }
    
    // Check if this is a loan amount row (starts with $)
    if (projectName && projectName.startsWith('$')) {
      continue;
    }
    
    if (!projectName && !bankName) continue;
    
    const actualProject = projectName || currentProject;
    
    if (!actualProject || actualProject.length < 5) continue;
    if (!bankName || bankName.length < 2) continue;
    
    // Get project
    const projectResult = await pool.request()
      .input('name', sql.NVarChar, actualProject)
      .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @name');
    
    if (projectResult.recordset.length === 0) {
      discrepancies.push({
        type: 'Participants',
        projectName: actualProject,
        field: 'Project',
        csvValue: actualProject,
        dbValue: 'NOT FOUND',
        message: `Project "${actualProject}" not found for participation`
      });
      errors++;
      continue;
    }
    
    const projectId = projectResult.recordset[0].ProjectId;
    
    // Get bank
    const bankResult = await pool.request()
      .input('name', sql.NVarChar, bankName)
      .query('SELECT BankId FROM core.Bank WHERE BankName = @name');
    
    if (bankResult.recordset.length === 0) {
      discrepancies.push({
        type: 'Participants',
        projectName: actualProject,
        field: 'Bank',
        csvValue: bankName,
        dbValue: 'NOT FOUND',
        message: `Bank "${bankName}" not found for project "${actualProject}"`
      });
      errors++;
      continue;
    }
    
    const bankId = bankResult.recordset[0].BankId;
    
    // Get participation
    const partResult = await pool.request()
      .input('projectId', sql.Int, projectId)
      .input('bankId', sql.Int, bankId)
      .query('SELECT * FROM banking.Participation WHERE ProjectId = @projectId AND BankId = @bankId');
    
    if (partResult.recordset.length === 0) {
      discrepancies.push({
        type: 'Participants',
        projectName: actualProject,
        field: 'Participation',
        csvValue: `${bankName} - ${percent}`,
        dbValue: 'NOT FOUND',
        message: `Participation not found for "${bankName}" in project "${actualProject}"`
      });
      errors++;
      continue;
    }
    
    const participation = partResult.recordset[0];
    
    // Validate exposure amount
    if (exposure && !compareValues(exposure, participation.ExposureAmount, 'ExposureAmount')) {
      discrepancies.push({
        type: 'Participants',
        projectName: actualProject,
        field: 'ExposureAmount',
        csvValue: exposure,
        dbValue: participation.ExposureAmount,
        message: `Exposure amount mismatch for "${bankName}" in "${actualProject}"`
      });
      errors++;
    }
    
    validated++;
  }
  
  console.log(`  ✅ Validated ${validated} participations`);
  console.log(`  ❌ Found ${errors} discrepancies`);
}

async function validateContingentLiabilities(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Validating Contingent Liabilities data...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  let validated = 0;
  let errors = 0;
  
  // Skip header rows (first 2 rows)
  for (let i = 6; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue;
    
    const projectName = row[1]?.trim();
    if (!projectName || projectName.length < 5) continue;
    
    // Skip totals rows
    if (projectName.includes('$') || projectName === 'Property Name') continue;
    
    // Column 8 = Toby's Guaranty $ (dollar amount), Column 7 = Toby's Guaranty %
    const guaranteeAmount = parseAmount(row[8]); // Toby's guarantee amount (dollar amount)
    
    if (!guaranteeAmount) continue;
    
    // Get project
    const projectResult = await pool.request()
      .input('name', sql.NVarChar, projectName)
      .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @name');
    
    if (projectResult.recordset.length === 0) {
      discrepancies.push({
        type: 'Contingent Liabilities',
        projectName,
        field: 'Project',
        csvValue: projectName,
        dbValue: 'NOT FOUND',
        message: `Project "${projectName}" not found for guarantee`
      });
      errors++;
      continue;
    }
    
    const projectId = projectResult.recordset[0].ProjectId;
    
    // Check for Toby's guarantee (PersonId = 1)
    const guaranteeResult = await pool.request()
      .input('projectId', sql.Int, projectId)
      .input('personId', sql.Int, 1)
      .query('SELECT * FROM banking.Guarantee WHERE ProjectId = @projectId AND PersonId = @personId');
    
    if (guaranteeResult.recordset.length === 0) {
      discrepancies.push({
        type: 'Contingent Liabilities',
        projectName,
        field: 'Guarantee',
        csvValue: `Toby: $${guaranteeAmount}`,
        dbValue: 'NOT FOUND',
        message: `Toby's guarantee not found for "${projectName}"`
      });
      errors++;
      continue;
    }
    
    const guarantee = guaranteeResult.recordset[0];
    
    // Validate guarantee amount
    if (!compareValues(guaranteeAmount, guarantee.GuaranteeAmount, 'GuaranteeAmount')) {
      discrepancies.push({
        type: 'Contingent Liabilities',
        projectName,
        field: 'GuaranteeAmount',
        csvValue: guaranteeAmount,
        dbValue: guarantee.GuaranteeAmount,
        message: `Toby's guarantee amount mismatch for "${projectName}"`
      });
      errors++;
    }
    
    validated++;
  }
  
  console.log(`  ✅ Validated ${validated} guarantees`);
  console.log(`  ❌ Found ${errors} discrepancies`);
}

async function validateUnderContract(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Validating Under Contract data...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  let validated = 0;
  let errors = 0;
  
  // Find header row
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][1]?.includes('Project Name')) {
      headerRow = i;
      break;
    }
  }
  
  if (headerRow === -1) {
    console.log('⚠️  Could not find header row');
    return;
  }
  
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue;
    
    const projectName = row[1]?.trim();
    if (!projectName || projectName.length < 5) continue;
    
    // Skip totals rows
    if (projectName.includes('Totals') || projectName.includes('Average')) continue;
    
    // Get project - try exact match first, then try variations
    let projectResult = await pool.request()
      .input('name', sql.NVarChar, projectName)
      .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @name');
    
    // If not found, try case-insensitive search
    if (projectResult.recordset.length === 0) {
      projectResult = await pool.request()
        .input('name', sql.NVarChar, projectName)
        .query('SELECT ProjectId FROM core.Project WHERE LOWER(ProjectName) = LOWER(@name)');
    }
    
    if (projectResult.recordset.length === 0) {
      discrepancies.push({
        type: 'Under Contract',
        projectName,
        field: 'Project',
        csvValue: projectName,
        dbValue: 'NOT FOUND',
        message: `Project "${projectName}" not found`
      });
      errors++;
      continue;
    }
    
    const projectId = projectResult.recordset[0].ProjectId;
    
    // Get under contract record
    const ucResult = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT * FROM pipeline.UnderContract WHERE ProjectId = @projectId');
    
    if (ucResult.recordset.length === 0) {
      discrepancies.push({
        type: 'Under Contract',
        projectName,
        field: 'Record',
        csvValue: 'EXISTS',
        dbValue: 'NOT FOUND',
        message: `Under Contract record not found for "${projectName}"`
      });
      errors++;
      continue;
    }
    
    const uc = ucResult.recordset[0];
    
    // Validate price - Column 6 = Price (not Units which is column 5)
    // CSV structure: #,Project Name,Location,Region,Acreage,Units,Price,...
    // Note: Location may be quoted (e.g., "Oxford, MS") which can affect column indices
    // So we need to find Price column by checking if it starts with $ or is a large number
    
    // Try column 6 first (expected position)
    let priceCol = 6;
    let price = null;
    
    // If column 6 looks like Units (small number like 312, 288), try next column
    if (row.length > 6 && row[6]) {
      const col6Value = row[6].trim();
      // Check if it's a small number (likely Units) vs large number/currency (likely Price)
      const col6Num = parseFloat(col6Value.replace(/[$,]/g, ''));
      if (col6Num && col6Num < 1000 && row.length > 7) {
        // Probably Units, try next column for Price
        priceCol = 7;
      }
      price = parseAmount(row[priceCol]);
    }
    
    // Only validate if we found a valid price value
    if (price && price > 1000) { // Price should be > $1000, Units are typically < 1000
      if (!compareValues(price, uc.Price, 'Price')) {
        discrepancies.push({
          type: 'Under Contract',
          projectName,
          field: 'Price',
          csvValue: price,
          dbValue: uc.Price,
          message: `Price mismatch for "${projectName}"`
        });
        errors++;
      }
    }
    
    validated++;
  }
  
  console.log(`  ✅ Validated ${validated} under contract records`);
  console.log(`  ❌ Found ${errors} discrepancies`);
}

async function validateClosedProperties(pool: sql.ConnectionPool, csvPath: string) {
  console.log('\n📊 Validating Closed Properties data...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  let validated = 0;
  let errors = 0;
  
  // Find header row
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][2]?.includes('Project Name')) {
      headerRow = i;
      break;
    }
  }
  
  if (headerRow === -1) {
    console.log('⚠️  Could not find header row');
    return;
  }
  
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 4) continue;
    
    const projectName = row[2]?.trim();
    if (!projectName || projectName.length < 5) continue;
    
    // Skip totals rows
    if (projectName.includes('Totals') || projectName.includes('Average')) continue;
    
    // Get project
    const projectResult = await pool.request()
      .input('name', sql.NVarChar, projectName)
      .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @name');
    
    if (projectResult.recordset.length === 0) {
      discrepancies.push({
        type: 'Closed Properties',
        projectName,
        field: 'Project',
        csvValue: projectName,
        dbValue: 'NOT FOUND',
        message: `Project "${projectName}" not found`
      });
      errors++;
      continue;
    }
    
    const projectId = projectResult.recordset[0].ProjectId;
    
    // Get closed property record
    const cpResult = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT * FROM pipeline.ClosedProperty WHERE ProjectId = @projectId');
    
    if (cpResult.recordset.length === 0) {
      discrepancies.push({
        type: 'Closed Properties',
        projectName,
        field: 'Record',
        csvValue: 'EXISTS',
        dbValue: 'NOT FOUND',
        message: `Closed Property record not found for "${projectName}"`
      });
      errors++;
      continue;
    }
    
    validated++;
  }
  
  console.log(`  ✅ Validated ${validated} closed property records`);
  console.log(`  ❌ Found ${errors} discrepancies`);
}

async function main() {
  console.log('🚀 Starting CSV Data Validation...\n');
  
  const pool = await getPool();
  const dataDir = path.join(__dirname, '../../data');
  
  try {
    // Validate all CSV files
    await validateBankingDashboard(pool, path.join(dataDir, 'Banking Dashboard(Banking Dashboard).csv'));
    await validateParticipants(pool, path.join(dataDir, 'Banking Dashboard(Participants).csv'));
    await validateContingentLiabilities(pool, path.join(dataDir, 'Banking Dashboard(Contingent Liabilities).csv'));
    await validateUnderContract(pool, path.join(dataDir, 'Stoa Properties Tracker(Under Contract).csv'));
    await validateClosedProperties(pool, path.join(dataDir, 'Stoa Properties Tracker(Closed Properties).csv'));
    
    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('📋 VALIDATION SUMMARY');
    console.log('='.repeat(80));
    
    if (discrepancies.length === 0) {
      console.log('\n✅ All data matches! No discrepancies found.');
    } else {
      console.log(`\n❌ Found ${discrepancies.length} discrepancy(ies):\n`);
      
      // Group by type
      const byType: { [key: string]: Discrepancy[] } = {};
      discrepancies.forEach(d => {
        if (!byType[d.type]) byType[d.type] = [];
        byType[d.type].push(d);
      });
      
      // Print by type
      Object.keys(byType).forEach(type => {
        console.log(`\n${type}:`);
        console.log('-'.repeat(80));
        byType[type].forEach((d, idx) => {
          console.log(`\n${idx + 1}. ${d.projectName || 'N/A'}`);
          console.log(`   Field: ${d.field}`);
          console.log(`   CSV Value: ${d.csvValue}`);
          console.log(`   DB Value: ${d.dbValue}`);
          console.log(`   Message: ${d.message}`);
        });
      });
      
      // Save to file
      const reportPath = path.join(__dirname, '../../data-validation-report.txt');
      const reportContent = discrepancies.map(d => 
        `[${d.type}] ${d.projectName || 'N/A'}\n` +
        `  Field: ${d.field}\n` +
        `  CSV: ${d.csvValue}\n` +
        `  DB: ${d.dbValue}\n` +
        `  ${d.message}\n`
      ).join('\n');
      
      fs.writeFileSync(reportPath, reportContent);
      console.log(`\n\n📄 Full report saved to: ${reportPath}`);
    }
    
  } catch (error) {
    console.error('❌ Error during validation:', error);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  main();
}
