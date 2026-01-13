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
  if (!str || str.trim() === '' || str === 'N/A' || str === '-' || str === '$-') return null;
  
  const trimmed = str.trim();
  
  // Handle dates like "2/10/2025" or "12/31/2024"
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0]);
      const day = parseInt(parts[1]);
      let year = parseInt(parts[2]);
      
      // Validate the date parts
      if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
      if (month < 1 || month > 12) return null;
      if (day < 1 || day > 31) return null;
      
      // Handle 2-digit years
      if (year < 100) {
        if (year < 50) year += 2000; // 00-49 = 2000-2049
        else year += 1900; // 50-99 = 1950-1999
      }
      
      // Validate year range
      if (year < 1900 || year > 2100) return null;
      
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  }
  
  // For month-year formats like "May-23", return null (can't convert to SQL date)
  // These should be stored as NVARCHAR in separate fields
  return null;
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
    
    // Skip section headers and non-project rows
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
    
    // Skip if borrower looks like a bank name (starts with common bank words)
    const bankPrefixes = ['Bank', 'Credit Union', 'Federal Credit', 'National Bank', 'State Bank'];
    if (bankPrefixes.some(prefix => borrower.startsWith(prefix))) continue;
    
    // Skip if it's clearly not a project name (too short)
    if (borrower.length < 5) continue;
    
    // Skip if it doesn't look like a project name (no "The", "at", "LLC", or common project words)
    const projectIndicators = ['The ', ' at ', 'LLC', 'LLC,', 'Rd', 'Ave', 'Boulevard', 'Street', 'Lane'];
    const hasProjectIndicator = projectIndicators.some(indicator => borrower.includes(indicator));
    
    // If it's a short name without project indicators, skip it (likely a section header)
    if (borrower.length < 15 && !hasProjectIndicator) continue;
    
    // Find project by borrower name
    const projectId = await getProjectId(pool, borrower);
    if (!projectId) {
      console.log(`⚠️  Project not found: ${borrower}`);
      continue;
    }
    
    // Update or create loan
    const lenderName = row[5]?.trim();
    const lenderId = lenderName ? await getBankId(pool, lenderName) : null;
    
    const loanAmount = parseAmount(row[6]);
    const loanClosingDate = parseDate(row[7]);
    const birthOrder = row[0] ? parseInt(row[0]) || null : null;
    
    let loanId: number | null = null;
    
    // Process loan even if amount or date is missing (allows updating partial data)
    // Only skip if we have absolutely no loan data
    if (loanAmount || loanClosingDate || lenderId || row[2]?.trim() || row[11]?.trim()) {
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
          MERGE banking.Loan AS target
          USING (SELECT @ProjectId AS ProjectId) AS source
          ON target.ProjectId = source.ProjectId AND target.LoanPhase = 'Construction'
          WHEN MATCHED THEN
            UPDATE SET
              BirthOrder = @BirthOrder,
              LoanType = @LoanType,
              Borrower = @Borrower,
              LenderId = @LenderId,
              LoanAmount = COALESCE(@LoanAmount, target.LoanAmount),
              LoanClosingDate = COALESCE(@LoanClosingDate, target.LoanClosingDate),
              FixedOrFloating = COALESCE(@FixedOrFloating, target.FixedOrFloating),
              IndexName = COALESCE(@IndexName, target.IndexName),
              Spread = COALESCE(@Spread, target.Spread),
              MiniPermMaturity = COALESCE(@MiniPermMaturity, target.MiniPermMaturity),
              MiniPermInterestRate = COALESCE(@MiniPermInterestRate, target.MiniPermInterestRate),
              PermPhaseMaturity = COALESCE(@PermPhaseMaturity, target.PermPhaseMaturity),
              PermPhaseInterestRate = COALESCE(@PermPhaseInterestRate, target.PermPhaseInterestRate),
              ConstructionCompletionDate = COALESCE(@ConstructionCompletionDate, target.ConstructionCompletionDate),
              LeaseUpCompletedDate = COALESCE(@LeaseUpCompletedDate, target.LeaseUpCompletedDate),
              IOMaturityDate = COALESCE(@IOMaturityDate, target.IOMaturityDate),
              PermanentCloseDate = COALESCE(@PermanentCloseDate, target.PermanentCloseDate),
              PermanentLoanAmount = COALESCE(@PermanentLoanAmount, target.PermanentLoanAmount)
          WHEN NOT MATCHED THEN
            INSERT (ProjectId, BirthOrder, LoanType, Borrower, LoanPhase, LenderId,
                    LoanAmount, LoanClosingDate, FixedOrFloating, IndexName, Spread,
                    MiniPermMaturity, MiniPermInterestRate, PermPhaseMaturity, PermPhaseInterestRate,
                    ConstructionCompletionDate, LeaseUpCompletedDate, IOMaturityDate,
                    PermanentCloseDate, PermanentLoanAmount)
            VALUES (@ProjectId, @BirthOrder, @LoanType, @Borrower, @LoanPhase, @LenderId,
                    @LoanAmount, @LoanClosingDate, @FixedOrFloating, @IndexName, @Spread,
                    @MiniPermMaturity, @MiniPermInterestRate, @PermPhaseMaturity, @PermPhaseInterestRate,
                    @ConstructionCompletionDate, @LeaseUpCompletedDate, @IOMaturityDate,
                    @PermanentCloseDate, @PermanentLoanAmount);
          SELECT LoanId FROM banking.Loan WHERE ProjectId = @ProjectId AND LoanPhase = 'Construction';
        `);
      loanId = result.recordset[0]?.LoanId || null;
      if (loanId) loansCreated++;
    } else {
      // Try to get existing loan even if we don't have amount/date
      loanId = await getLoanId(pool, projectId);
    }
    
    // Add DSCR Tests (only if we have a loan)
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
              MERGE banking.DSCRTest AS target
              USING (SELECT @ProjectId AS ProjectId, @TestNumber AS TestNumber) AS source
              ON target.ProjectId = source.ProjectId AND target.TestNumber = source.TestNumber
              WHEN MATCHED THEN
                UPDATE SET
                  LoanId = @LoanId,
                  TestDate = @TestDate,
                  ProjectedInterestRate = @ProjectedInterestRate,
                  Requirement = @Requirement,
                  ProjectedValue = @ProjectedValue
              WHEN NOT MATCHED THEN
                INSERT (ProjectId, LoanId, TestNumber, TestDate, ProjectedInterestRate, Requirement, ProjectedValue)
                VALUES (@ProjectId, @LoanId, @TestNumber, @TestDate, @ProjectedInterestRate, @Requirement, @ProjectedValue);
            `);
          dscrTestsCreated++;
        }
      }
      
      // 2nd DSCR Test
      if (row[22] && row[22].trim() !== '') {
        const testDate = parseDate(row[22]);
        // Only insert if we have a valid date
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
              MERGE banking.DSCRTest AS target
              USING (SELECT @ProjectId AS ProjectId, @TestNumber AS TestNumber) AS source
              ON target.ProjectId = source.ProjectId AND target.TestNumber = source.TestNumber
              WHEN MATCHED THEN
                UPDATE SET
                  LoanId = @LoanId,
                  TestDate = @TestDate,
                  ProjectedInterestRate = @ProjectedInterestRate,
                  Requirement = @Requirement,
                  ProjectedValue = @ProjectedValue
              WHEN NOT MATCHED THEN
                INSERT (ProjectId, LoanId, TestNumber, TestDate, ProjectedInterestRate, Requirement, ProjectedValue)
                VALUES (@ProjectId, @LoanId, @TestNumber, @TestDate, @ProjectedInterestRate, @Requirement, @ProjectedValue);
            `);
          dscrTestsCreated++;
        }
      }
      
      // 3rd DSCR Test
      if (row[26] && row[26].trim() !== '') {
        const testDate = parseDate(row[26]);
        // Only insert if we have a valid date
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
              MERGE banking.DSCRTest AS target
              USING (SELECT @ProjectId AS ProjectId, @TestNumber AS TestNumber) AS source
              ON target.ProjectId = source.ProjectId AND target.TestNumber = source.TestNumber
              WHEN MATCHED THEN
                UPDATE SET
                  LoanId = @LoanId,
                  TestDate = @TestDate,
                  ProjectedInterestRate = @ProjectedInterestRate,
                  Requirement = @Requirement,
                  ProjectedValue = @ProjectedValue
              WHEN NOT MATCHED THEN
                INSERT (ProjectId, LoanId, TestNumber, TestDate, ProjectedInterestRate, Requirement, ProjectedValue)
                VALUES (@ProjectId, @LoanId, @TestNumber, @TestDate, @ProjectedInterestRate, @Requirement, @ProjectedValue);
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
            MERGE banking.LiquidityRequirement AS target
            USING (SELECT @ProjectId AS ProjectId) AS source
            ON target.ProjectId = source.ProjectId
            WHEN MATCHED THEN
              UPDATE SET
                LoanId = @LoanId,
                TotalAmount = @TotalAmount,
                LendingBankAmount = @LendingBankAmount
            WHEN NOT MATCHED THEN
              INSERT (ProjectId, LoanId, TotalAmount, LendingBankAmount)
              VALUES (@ProjectId, @LoanId, @TotalAmount, @LendingBankAmount);
          `);
        liquidityCreated++;
      }
      
      // Covenants (Occupancy)
      const occupancyDate = parseDate(row[32]);
      // Only insert if we have a valid date
      if (occupancyDate) {
        await pool.request()
          .input('ProjectId', sql.Int, projectId)
          .input('LoanId', sql.Int, loanId)
          .input('CovenantType', sql.NVarChar, 'Occupancy')
          .input('CovenantDate', sql.Date, occupancyDate)
          .input('Requirement', sql.NVarChar, row[33]?.trim() || null)
          .input('ProjectedValue', sql.NVarChar, row[34]?.trim() || null)
          .query(`
            MERGE banking.Covenant AS target
            USING (SELECT @ProjectId AS ProjectId, 'Occupancy' AS CovenantType) AS source
            ON target.ProjectId = source.ProjectId AND target.CovenantType = source.CovenantType
            WHEN MATCHED THEN
              UPDATE SET
                LoanId = @LoanId,
                CovenantDate = @CovenantDate,
                Requirement = @Requirement,
                ProjectedValue = @ProjectedValue
            WHEN NOT MATCHED THEN
              INSERT (ProjectId, LoanId, CovenantType, CovenantDate, Requirement, ProjectedValue)
              VALUES (@ProjectId, @LoanId, @CovenantType, @CovenantDate, @Requirement, @ProjectedValue);
          `);
        covenantsCreated++;
      }
    }
  }
  
  console.log(`  ✅ Processed ${loansCreated} loans (updated if exists, created if new)`);
  console.log(`  ✅ Processed ${dscrTestsCreated} DSCR tests (updated if exists, created if new)`);
  console.log(`  ✅ Processed ${covenantsCreated} covenants (updated if exists, created if new)`);
  console.log(`  ✅ Processed ${liquidityCreated} liquidity requirements (updated if exists, created if new)`);
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
      // Check if new columns exist before trying to update them
      const columnCheck = await pool.request()
        .query(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = 'core' 
            AND TABLE_NAME = 'Bank' 
            AND COLUMN_NAME IN ('HQState', 'HoldLimit', 'PerDealLimit', 'Deposits')
        `);
      
      const existingColumns = columnCheck.recordset.map((r: any) => r.COLUMN_NAME);
      
      // Build dynamic UPDATE query based on which columns exist
      const updateFields: string[] = [];
      const request = pool.request().input('BankId', sql.Int, bankId);
      
      if (existingColumns.includes('HQState') && hqState) {
        updateFields.push('HQState = @HQState');
        request.input('HQState', sql.NVarChar, hqState);
      }
      if (existingColumns.includes('HoldLimit') && holdLimit !== null) {
        updateFields.push('HoldLimit = @HoldLimit');
        request.input('HoldLimit', sql.Decimal(18, 2), holdLimit);
      }
      if (existingColumns.includes('PerDealLimit') && perDealLimit !== null) {
        updateFields.push('PerDealLimit = @PerDealLimit');
        request.input('PerDealLimit', sql.Decimal(18, 2), perDealLimit);
      }
      if (existingColumns.includes('Deposits') && deposits !== null) {
        updateFields.push('Deposits = @Deposits');
        request.input('Deposits', sql.Decimal(18, 2), deposits);
      }
      if (notes) {
        updateFields.push('Notes = ISNULL(@Notes, Notes)');
        request.input('Notes', sql.NVarChar(sql.MAX), notes);
      }
      
      if (updateFields.length > 0) {
        await request.query(`
          UPDATE core.Bank
          SET ${updateFields.join(', ')}
          WHERE BankId = @BankId
        `);
        banksUpdated++;
      }
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
    
    // Skip rows with zero/null exposure or 0% participation
    if (!exposure || exposure === 0 || !percentage || percentage === '0' || percentage === '0%' || percentage.trim() === '') {
      continue;
    }
    
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
  }
  
  console.log(`  ✅ Processed ${participationsCreated} participations (updated if exists, created if new)`);
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
          ELSE
          UPDATE banking.Covenant
          SET LoanId = @LoanId, CovenantType = @CovenantType
          WHERE ProjectId = @ProjectId AND Notes = @Notes
        `);
      covenantsCreated++;
    }
  }
  
  console.log(`  ✅ Processed ${guaranteesCreated} guarantees (updated if exists, created if new)`);
  console.log(`  ✅ Processed ${covenantsCreated} additional covenants (updated if exists, created if new)`);
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
  
  // Determine column indices based on header row
  const headerRowData = rows[headerRow];
  let bankCol = -1, assetsCol = -1, cityCol = -1, stateCol = -1, exposureCol = -1, contactCol = -1, commentsCol = -1;
  
  for (let j = 0; j < headerRowData.length; j++) {
    const header = headerRowData[j]?.toLowerCase() || '';
    if (header.includes('bank') && !header.includes('exposure')) bankCol = j;
    if (header.includes('asset')) assetsCol = j;
    if (header.includes('city')) cityCol = j;
    if (header.includes('state') && !header.includes('exposure')) stateCol = j;
    if (header.includes('exposure')) exposureCol = j;
    if (header.includes('contact')) contactCol = j;
    if (header.includes('comment')) commentsCol = j;
  }
  
  // Fallback to original positions if not found
  if (bankCol === -1) bankCol = 4;
  if (assetsCol === -1) assetsCol = 3;
  if (cityCol === -1) cityCol = 5;
  if (stateCol === -1) stateCol = 8;
  if (exposureCol === -1) exposureCol = 9;
  if (contactCol === -1) contactCol = 10;
  if (commentsCol === -1) commentsCol = 11;
  
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < Math.max(bankCol, exposureCol) + 1 || !row[bankCol] || row[bankCol].trim() === '') continue;
    
    const bankName = row[bankCol].trim();
    // Skip empty rows or section headers
    if (!bankName || bankName === 'Bank' || bankName.includes('Lead Bank') || bankName.includes('Participant')) continue;
    
    const assets = assetsCol >= 0 && row[assetsCol] ? row[assetsCol].trim() : null;
    const city = cityCol >= 0 && row[cityCol] ? row[cityCol].trim() : null;
    const state = stateCol >= 0 && row[stateCol] ? row[stateCol].trim() : null;
    const exposure = exposureCol >= 0 && row[exposureCol] ? parseAmount(row[exposureCol]) : null;
    const contact = contactCol >= 0 && row[contactCol] ? row[contactCol].trim() : null;
    const comments = commentsCol >= 0 && row[commentsCol] ? row[commentsCol].trim() : null;
    
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
