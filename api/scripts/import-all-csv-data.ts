#!/usr/bin/env ts-node
/**
 * Import ALL CSV Data
 * 
 * Reads all CSV files and imports ALL data into the database:
 * - Banking Dashboard (loans, DSCR tests, covenants, liquidity)
 * - Exposure (bank exposure data)
 * - Participants (participations)
 * - Contingent Liabilities (guarantees)
 * - Targeted Banks (bank targets)
 * 
 * Usage: npm run db:import-csv
 */

import * as fs from 'fs';
import * as path from 'path';
import { getPool } from './db-manipulate';
import sql from 'mssql';

// Helper functions
function parseAmount(str: string | null | undefined): number | null {
  if (!str || str.trim() === '' || str === 'N/A' || str === '-' || str === '$-') return null;
  const cleaned = str.replace(/[$,]/g, '').trim();
  return cleaned ? parseFloat(cleaned) || null : null;
}

function parseDate(str: string | null | undefined): string | null {
  if (!str || str.trim() === '' || str === 'N/A') return null;
  // Handle dates like "2/10/2025" or "May-23"
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      let year = parseInt(parts[2]);
      if (year < 100) year += 2000;
      return `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
  }
  // For month-year formats like "May-23", return as-is (stored as NVARCHAR)
  return str;
}

function parsePercent(percentStr: string | null | undefined): string | null {
  if (!percentStr || percentStr.trim() === '' || percentStr === 'N/A') return null;
  return percentStr.trim();
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
        i++; // Skip next quote
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

async function importBankingDashboard(pool: sql.ConnectionPool, csvPath: string) {
  console.log('📊 Importing Banking Dashboard data...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  // Find header row (row with "Birth Order")
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0]?.includes('Birth Order')) {
      headerRow = i;
      break;
    }
  }
  
  if (headerRow === -1) {
    console.log('⚠️  Could not find header row in Banking Dashboard CSV');
    return;
  }
  
  const headers = rows[headerRow];
  let loansCreated = 0;
  let dscrTestsCreated = 0;
  let covenantsCreated = 0;
  let liquidityCreated = 0;
  
  // Process data rows (skip header and empty rows)
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3 || !row[1] || row[1].trim() === '') continue;
    
    const borrower = row[1]?.trim();
    if (!borrower || borrower === 'Other' || borrower.includes('Loan') || borrower === 'Multifamily' || borrower === 'Under Contract' || borrower === 'Liquidated') continue;
    
    // Find project by borrower name
    const projectId = await getProjectId(pool, borrower);
    if (!projectId) {
      console.log(`⚠️  Project not found: ${borrower}`);
      continue;
    }
    
    // Get or create loan
    let loanId = await getLoanId(pool, projectId);
    
    if (!loanId) {
      // Create loan
      const lenderName = row[5]?.trim();
      const lenderId = lenderName ? await getBankId(pool, lenderName) : null;
      
      const loanAmount = parseAmount(row[6]);
      const loanClosingDate = parseDate(row[7]);
      const birthOrder = row[0] ? parseInt(row[0]) || null : null;
      
      if (loanAmount && loanClosingDate) {
        const result = await pool.request()
          .input('ProjectId', sql.Int, projectId)
          .input('BirthOrder', sql.Int, birthOrder)
          .input('LoanType', sql.NVarChar, row[2]?.trim() || null)
          .input('Borrower', sql.NVarChar, borrower)
          .input('LoanPhase', sql.NVarChar, 'Construction')
          .input('LenderId', sql.Int, lenderId)
          .input('LoanAmount', sql.Decimal(18, 2), loanAmount)
          .input('LoanClosingDate', sql.Date, loanClosingDate)
          .input('FixedOrFloating', sql.NVarChar, row[11]?.trim() || null)
          .input('IndexName', sql.NVarChar, row[12]?.trim() || null)
          .input('Spread', sql.NVarChar, parsePercent(row[13]))
          .input('MiniPermMaturity', sql.Date, parseDate(row[14]))
          .input('MiniPermInterestRate', sql.NVarChar, row[15]?.trim() || null)
          .input('PermPhaseMaturity', sql.Date, parseDate(row[16]))
          .input('PermPhaseInterestRate', sql.NVarChar, row[17]?.trim() || null)
          .input('ConstructionCompletionDate', sql.NVarChar, row[8]?.trim() || null)
          .input('LeaseUpCompletedDate', sql.NVarChar, row[9]?.trim() || null)
          .input('IOMaturityDate', sql.Date, parseDate(row[10]))
          .input('PermanentCloseDate', sql.Date, parseDate(row[35]))
          .input('PermanentLoanAmount', sql.Decimal(18, 2), parseAmount(row[37]))
          .query(`
            INSERT INTO banking.Loan (
              ProjectId, BirthOrder, LoanType, Borrower, LoanPhase, LenderId,
              LoanAmount, LoanClosingDate, FixedOrFloating, IndexName, Spread,
              MiniPermMaturity, MiniPermInterestRate, PermPhaseMaturity, PermPhaseInterestRate,
              ConstructionCompletionDate, LeaseUpCompletedDate, IOMaturityDate,
              PermanentCloseDate, PermanentLoanAmount
            )
            VALUES (
              @ProjectId, @BirthOrder, @LoanType, @Borrower, @LoanPhase, @LenderId,
              @LoanAmount, @LoanClosingDate, @FixedOrFloating, @IndexName, @Spread,
              @MiniPermMaturity, @MiniPermInterestRate, @PermPhaseMaturity, @PermPhaseInterestRate,
              @ConstructionCompletionDate, @LeaseUpCompletedDate, @IOMaturityDate,
              @PermanentCloseDate, @PermanentLoanAmount
            );
            SELECT SCOPE_IDENTITY() AS LoanId;
          `);
        loanId = result.recordset[0].LoanId;
        loansCreated++;
      }
    }
    
    // Add DSCR Tests
    if (loanId) {
      // 1st DSCR Test
      if (row[18] && row[18].trim() !== '') {
        const testDate = parseDate(row[18]);
        if (testDate) {
          await pool.request()
            .input('ProjectId', sql.Int, projectId)
            .input('LoanId', sql.Int, loanId)
            .input('TestNumber', sql.Int, 1)
            .input('TestDate', sql.Date, testDate)
            .input('ProjectedInterestRate', sql.NVarChar, row[19]?.trim() || null)
            .input('Requirement', sql.Decimal(10, 2), parseAmount(row[20]))
            .input('ProjectedValue', sql.NVarChar, row[21]?.trim() || null)
            .query(`
              IF NOT EXISTS (SELECT 1 FROM banking.DSCRTest WHERE ProjectId = @ProjectId AND TestNumber = 1)
              INSERT INTO banking.DSCRTest (ProjectId, LoanId, TestNumber, TestDate, ProjectedInterestRate, Requirement, ProjectedValue)
              VALUES (@ProjectId, @LoanId, @TestNumber, @TestDate, @ProjectedInterestRate, @Requirement, @ProjectedValue)
            `);
          dscrTestsCreated++;
        }
      }
      
      // 2nd DSCR Test
      if (row[22] && row[22].trim() !== '') {
        const testDate = parseDate(row[22]);
        if (testDate) {
          await pool.request()
            .input('ProjectId', sql.Int, projectId)
            .input('LoanId', sql.Int, loanId)
            .input('TestNumber', sql.Int, 2)
            .input('TestDate', sql.Date, testDate)
            .input('ProjectedInterestRate', sql.NVarChar, row[23]?.trim() || null)
            .input('Requirement', sql.Decimal(10, 2), parseAmount(row[24]))
            .input('ProjectedValue', sql.NVarChar, row[25]?.trim() || null)
            .query(`
              IF NOT EXISTS (SELECT 1 FROM banking.DSCRTest WHERE ProjectId = @ProjectId AND TestNumber = 2)
              INSERT INTO banking.DSCRTest (ProjectId, LoanId, TestNumber, TestDate, ProjectedInterestRate, Requirement, ProjectedValue)
              VALUES (@ProjectId, @LoanId, @TestNumber, @TestDate, @ProjectedInterestRate, @Requirement, @ProjectedValue)
            `);
          dscrTestsCreated++;
        }
      }
      
      // 3rd DSCR Test
      if (row[26] && row[26].trim() !== '') {
        const testDate = parseDate(row[26]);
        if (testDate) {
          await pool.request()
            .input('ProjectId', sql.Int, projectId)
            .input('LoanId', sql.Int, loanId)
            .input('TestNumber', sql.Int, 3)
            .input('TestDate', sql.Date, testDate)
            .input('ProjectedInterestRate', sql.NVarChar, row[27]?.trim() || null)
            .input('Requirement', sql.Decimal(10, 2), parseAmount(row[28]))
            .input('ProjectedValue', sql.NVarChar, row[29]?.trim() || null)
            .query(`
              IF NOT EXISTS (SELECT 1 FROM banking.DSCRTest WHERE ProjectId = @ProjectId AND TestNumber = 3)
              INSERT INTO banking.DSCRTest (ProjectId, LoanId, TestNumber, TestDate, ProjectedInterestRate, Requirement, ProjectedValue)
              VALUES (@ProjectId, @LoanId, @TestNumber, @TestDate, @ProjectedInterestRate, @Requirement, @ProjectedValue)
            `);
          dscrTestsCreated++;
        }
      }
      
      // Liquidity Requirements
      const totalLiquidity = parseAmount(row[30]);
      const lendingBankLiquidity = parseAmount(row[31]);
      if (totalLiquidity !== null) {
        await pool.request()
          .input('ProjectId', sql.Int, projectId)
          .input('LoanId', sql.Int, loanId)
          .input('TotalAmount', sql.Decimal(18, 2), totalLiquidity)
          .input('LendingBankAmount', sql.Decimal(18, 2), lendingBankLiquidity)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM banking.LiquidityRequirement WHERE ProjectId = @ProjectId)
            INSERT INTO banking.LiquidityRequirement (ProjectId, LoanId, TotalAmount, LendingBankAmount)
            VALUES (@ProjectId, @LoanId, @TotalAmount, @LendingBankAmount)
          `);
        liquidityCreated++;
      }
      
      // Covenants (Occupancy)
      const occupancyDate = parseDate(row[32]);
      if (occupancyDate) {
        await pool.request()
          .input('ProjectId', sql.Int, projectId)
          .input('LoanId', sql.Int, loanId)
          .input('CovenantType', sql.NVarChar, 'Occupancy')
          .input('CovenantDate', sql.Date, occupancyDate)
          .input('Requirement', sql.NVarChar, row[33]?.trim() || null)
          .input('ProjectedValue', sql.NVarChar, row[34]?.trim() || null)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM banking.Covenant WHERE ProjectId = @ProjectId AND CovenantType = 'Occupancy')
            INSERT INTO banking.Covenant (ProjectId, LoanId, CovenantType, CovenantDate, Requirement, ProjectedValue)
            VALUES (@ProjectId, @LoanId, @CovenantType, @CovenantDate, @Requirement, @ProjectedValue)
          `);
        covenantsCreated++;
      }
    }
  }
  
  console.log(`  ✅ Created ${loansCreated} loans`);
  console.log(`  ✅ Created ${dscrTestsCreated} DSCR tests`);
  console.log(`  ✅ Created ${covenantsCreated} covenants`);
  console.log(`  ✅ Created ${liquidityCreated} liquidity requirements`);
}

async function importExposure(pool: sql.ConnectionPool, csvPath: string) {
  console.log('📊 Importing Exposure data...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  // Find header row
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][9]?.includes('Bank')) {
      headerRow = i;
      break;
    }
  }
  
  if (headerRow === -1) {
    console.log('⚠️  Could not find header row in Exposure CSV');
    return;
  }
  
  let banksUpdated = 0;
  
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 10 || !row[9] || row[9].trim() === '' || row[9] === 'Total') continue;
    
    const bankName = row[9].trim();
    const hqState = row[8]?.trim() || null;
    const holdLimit = parseAmount(row[12]);
    const perDealLimit = parseAmount(row[13]);
    const deposits = parseAmount(row[15]);
    const notes = row[14]?.trim() || null;
    
    const bankId = await getBankId(pool, bankName);
    if (bankId) {
      await pool.request()
        .input('BankId', sql.Int, bankId)
        .input('HQState', sql.NVarChar, hqState)
        .input('HoldLimit', sql.Decimal(18, 2), holdLimit)
        .input('PerDealLimit', sql.Decimal(18, 2), perDealLimit)
        .input('Deposits', sql.Decimal(18, 2), deposits)
        .input('Notes', sql.NVarChar(sql.MAX), notes)
        .query(`
          UPDATE core.Bank
          SET HQState = ISNULL(@HQState, HQState),
              HoldLimit = ISNULL(@HoldLimit, HoldLimit),
              PerDealLimit = ISNULL(@PerDealLimit, PerDealLimit),
              Deposits = ISNULL(@Deposits, Deposits),
              Notes = ISNULL(@Notes, Notes)
          WHERE BankId = @BankId
        `);
      banksUpdated++;
    }
  }
  
  console.log(`  ✅ Updated ${banksUpdated} banks with exposure data`);
}

async function importParticipants(pool: sql.ConnectionPool, csvPath: string) {
  console.log('📊 Importing Participants data...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  // Find header row
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0]?.includes('Project')) {
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
    if (row[0] && (row[0].includes('The') || row[0].includes('$'))) {
      currentProject = row[0].replace(/[$",]/g, '').trim();
      if (currentProject.includes('$')) {
        // Extract project name from previous rows
        continue;
      }
    }
    
    // Check if this is a participation row
    const bankName = row[1]?.trim();
    const percentage = row[2]?.trim();
    const exposure = parseAmount(row[3]);
    const paidOff = row.length > 5 ? row[5]?.trim() === '$' + exposure?.toLocaleString() : false;
    
    if (bankName && percentage && currentProject && currentProject !== 'Project') {
      const projectId = await getProjectId(pool, currentProject);
      const bankId = await getBankId(pool, bankName);
      
      if (projectId && bankId) {
        const loanId = await getLoanId(pool, projectId);
        
        await pool.request()
          .input('ProjectId', sql.Int, projectId)
          .input('LoanId', sql.Int, loanId)
          .input('BankId', sql.Int, bankId)
          .input('ParticipationPercent', sql.NVarChar, percentage)
          .input('ExposureAmount', sql.Decimal(18, 2), exposure)
          .input('PaidOff', sql.Bit, paidOff)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM banking.Participation WHERE ProjectId = @ProjectId AND BankId = @BankId)
            INSERT INTO banking.Participation (ProjectId, LoanId, BankId, ParticipationPercent, ExposureAmount, PaidOff)
            VALUES (@ProjectId, @LoanId, @BankId, @ParticipationPercent, @ExposureAmount, @PaidOff)
          `);
        participationsCreated++;
      }
    }
  }
  
  console.log(`  ✅ Created ${participationsCreated} participations`);
}

async function importContingentLiabilities(pool: sql.ConnectionPool, csvPath: string) {
  console.log('📊 Importing Contingent Liabilities data...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  // Find header row (row with "Property Name")
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][1]?.includes('Property Name')) {
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
    if (row.length < 3 || !row[1] || row[1].trim() === '' || row[1] === 'Property Name') continue;
    
    const projectName = row[1].trim();
    const projectId = await getProjectId(pool, projectName);
    if (!projectId) {
      console.log(`⚠️  Project not found: ${projectName}`);
      continue;
    }
    
    const loanId = await getLoanId(pool, projectId);
    const loanAmount = parseAmount(row[3]);
    
    // Add guarantees for each person
    for (const person of personColumns) {
      const percentStr = row[person.percentCol]?.trim();
      const amountStr = row[person.amountCol]?.trim();
      
      if (percentStr && percentStr !== '0%' && amountStr && amountStr !== '$-') {
        const personId = await getPersonId(pool, person.name);
        if (personId) {
          const percent = parseFloat(percentStr.replace('%', ''));
          const amount = parseAmount(amountStr);
          
          if (amount !== null) {
            await pool.request()
              .input('ProjectId', sql.Int, projectId)
              .input('LoanId', sql.Int, loanId)
              .input('PersonId', sql.Int, personId)
              .input('GuaranteePercent', sql.Decimal(10, 4), percent)
              .input('GuaranteeAmount', sql.Decimal(18, 2), amount)
              .query(`
                IF NOT EXISTS (SELECT 1 FROM banking.Guarantee WHERE ProjectId = @ProjectId AND PersonId = @PersonId)
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
    if (covenantText && covenantText !== '') {
      await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('LoanId', sql.Int, loanId)
        .input('CovenantType', sql.NVarChar, 'Other')
        .input('Notes', sql.NVarChar(sql.MAX), covenantText)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM banking.Covenant WHERE ProjectId = @ProjectId AND Notes = @Notes)
          INSERT INTO banking.Covenant (ProjectId, LoanId, CovenantType, Notes)
          VALUES (@ProjectId, @LoanId, @CovenantType, @Notes)
        `);
      covenantsCreated++;
    }
  }
  
  console.log(`  ✅ Created ${guaranteesCreated} guarantees`);
  console.log(`  ✅ Created ${covenantsCreated} additional covenants`);
}

async function importTargetedBanks(pool: sql.ConnectionPool, csvPath: string) {
  console.log('📊 Importing Targeted Banks data...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  // Find header row (row with "Bank")
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][4]?.includes('Bank') && rows[i][7]?.includes('City')) {
      headerRow = i;
      break;
    }
  }
  
  if (headerRow === -1) {
    console.log('⚠️  Could not find header row in Targeted Banks CSV');
    return;
  }
  
  let bankTargetsCreated = 0;
  
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 10 || !row[4] || row[4].trim() === '') continue;
    
    const bankName = row[4].trim();
    const assets = row[3]?.trim() || null;
    const city = row[5]?.trim() || null;
    const state = row[8]?.trim() || null;
    const exposure = parseAmount(row[9]);
    const contact = row[10]?.trim() || null;
    const comments = row[11]?.trim() || null;
    
    // First, ensure bank exists
    let bankId = await getBankId(pool, bankName);
    if (!bankId) {
      // Create bank
      const result = await pool.request()
        .input('BankName', sql.NVarChar, bankName)
        .input('City', sql.NVarChar, city)
        .input('State', sql.NVarChar, state)
        .query(`
          INSERT INTO core.Bank (BankName, City, State)
          VALUES (@BankName, @City, @State);
          SELECT SCOPE_IDENTITY() AS BankId;
        `);
      bankId = result.recordset[0].BankId;
    }
    
    // Create or update bank target
    await pool.request()
      .input('BankId', sql.Int, bankId)
      .input('AssetsText', sql.NVarChar(200), assets)
      .input('City', sql.NVarChar, city)
      .input('State', sql.NVarChar, state)
      .input('ExposureWithStoa', sql.Decimal(18, 2), exposure)
      .input('ContactText', sql.NVarChar(4000), contact)
      .input('Comments', sql.NVarChar(sql.MAX), comments)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM banking.BankTarget WHERE BankId = @BankId)
        INSERT INTO banking.BankTarget (BankId, AssetsText, City, State, ExposureWithStoa, ContactText, Comments)
        VALUES (@BankId, @AssetsText, @City, @State, @ExposureWithStoa, @ContactText, @Comments)
        ELSE
        UPDATE banking.BankTarget
        SET AssetsText = @AssetsText, City = @City, State = @State,
            ExposureWithStoa = @ExposureWithStoa, ContactText = @ContactText, Comments = @Comments
        WHERE BankId = @BankId
      `);
    bankTargetsCreated++;
  }
  
  console.log(`  ✅ Created/updated ${bankTargetsCreated} bank targets`);
}

async function main() {
  console.log('🚀 Starting Complete CSV Data Import...\n');
  
  const pool = await getPool();
  const dataDir = path.join(__dirname, '../../data');
  
  try {
    // Import all CSV files
    await importBankingDashboard(pool, path.join(dataDir, 'Banking Dashboard(Banking Dashboard).csv'));
    await importExposure(pool, path.join(dataDir, 'Banking Dashboard(Exposure).csv'));
    await importParticipants(pool, path.join(dataDir, 'Banking Dashboard(Participants).csv'));
    await importContingentLiabilities(pool, path.join(dataDir, 'Banking Dashboard(Contingent Liabilities).csv'));
    await importTargetedBanks(pool, path.join(dataDir, 'Banking Dashboard(Targeted Banks).csv'));
    
    console.log('\n✅ All CSV data imported successfully!');
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
