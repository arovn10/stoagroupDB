#!/usr/bin/env ts-node
/**
 * Import Contingent Liabilities Data
 * 
 * Imports contingent liabilities data (guarantees and construction loan info) from provided text data.
 * Updates/creates:
 * - Construction loan closing date and amount in banking.Loan
 * - Guarantees for Stoa Holdings, Toby Easterly, Ryan Nash, Saun Sullivan
 * 
 * Usage: npm run db:import-contingent-liabilities
 */

import { getPool } from './db-manipulate';
import sql from 'mssql';

// Helper functions
function parseAmount(str: string | null | undefined): number | null {
  if (!str || str.trim() === '' || str === 'N/A' || str === '-' || str === '$-') return null;
  const cleaned = str.replace(/[$,]/g, '').trim();
  if (cleaned === '' || cleaned === '0') return null;
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

function parseDate(str: string | null | undefined): string | null {
  if (!str || str.trim() === '' || str === 'N/A' || str === '-') return null;
  const cleaned = str.trim();
  
  // Handle MM/DD/YYYY format
  const dateMatch = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dateMatch) {
    const [, month, day, year] = dateMatch;
    const yearNum = parseInt(year, 10);
    
    // Ignore dates with year 1900 (common placeholder for missing dates)
    if (yearNum === 1900) {
      return null;
    }
    
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    
    // Skip invalid dates (day 0, month 0)
    if (dayNum === 0 || monthNum === 0) {
      return null;
    }
    
    // Validate month and day ranges
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
      return null;
    }
    
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return null;
}

async function getProjectId(pool: sql.ConnectionPool, projectName: string): Promise<number | null> {
  const result = await pool.request()
    .input('name', sql.NVarChar, projectName.trim())
    .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @name');
  
  return result.recordset.length > 0 ? result.recordset[0].ProjectId : null;
}

async function getPersonId(pool: sql.ConnectionPool, personName: string): Promise<number | null> {
  const result = await pool.request()
    .input('name', sql.NVarChar, personName.trim())
    .query('SELECT PersonId FROM core.Person WHERE FullName = @name');
  
  return result.recordset.length > 0 ? result.recordset[0].PersonId : null;
}

async function getOrCreatePerson(pool: sql.ConnectionPool, personName: string): Promise<number> {
  let personId = await getPersonId(pool, personName);
  
  if (!personId) {
    // Create person if doesn't exist
    const result = await pool.request()
      .input('name', sql.NVarChar, personName.trim())
      .query(`
        INSERT INTO core.Person (FullName)
        OUTPUT INSERTED.PersonId
        VALUES (@name)
      `);
    personId = result.recordset[0].PersonId;
  }
  
  return personId;
}

async function getBankId(pool: sql.ConnectionPool, bankName: string): Promise<number | null> {
  const result = await pool.request()
    .input('name', sql.NVarChar, bankName.trim())
    .query('SELECT BankId FROM core.Bank WHERE BankName = @name');
  
  return result.recordset.length > 0 ? result.recordset[0].BankId : null;
}

async function getLoanId(pool: sql.ConnectionPool, projectId: number): Promise<number | null> {
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT TOP 1 LoanId 
      FROM banking.Loan 
      WHERE ProjectId = @projectId 
      ORDER BY CASE WHEN LoanPhase = 'Construction' THEN 0 ELSE 1 END, LoanId
    `);
  
  return result.recordset.length > 0 ? result.recordset[0].LoanId : null;
}

// Raw data provided by user
const contingentLiabilitiesData = `
The Waters at Ransley	5/24/2021	 $        37,800,000 	The First	100%	 $    37,800,000 	100%	 $    37,800,000 	100%	 $    37,800,000 	100%	 $    37,800,000 
The Waters at Heritage	10/26/2021	 $        37,218,163 	b1Bank	100%	 $    37,218,163 	100%	 $    37,218,163 	100%	 $    37,218,163 	100%	 $    37,218,163 
The Waters at Millerville	6/13/2022	 $        36,200,000 	First Horizon Bank	0%	 $                       -   	0%	 $                       -   	0%	 $                       -   	100%	 $    36,200,000 
The Waters at Redstone	2/25/2022	 $        30,000,000 	Renasant Bank	100%	 $    30,000,000 	100%	 $    30,000,000 	100%	 $    30,000,000 	100%	 $    30,000,000 
The Waters at Settlers Trace	8/24/2022	 $        49,996,842 	b1Bank	100%	 $    49,996,842 	100%	 $    49,996,842 	100%	 $    49,996,842 	100%	 $    49,996,842 
The Flats at East Bay	6/16/2022	 $        31,599,189 	Cadence Bank	100%	 $    31,599,189 	100%	 $    31,599,189 	100%	 $    31,599,189 	100%	 $    31,599,189 
The Waters at West Village	12/15/2022	 $        25,390,000 	Trustmark Bank	100%	 $    25,390,000 	100%	 $    25,390,000 	100%	 $    25,390,000 	100%	 $    25,390,000 
The Waters at Bluebonnet	4/12/2023	 $        39,812,626 	Trustmark Bank	100%	 $    39,812,626 	100%	 $    39,812,626 	100%	 $    39,812,626 	100%	 $    39,812,626 
The Waters at Crestview	8/25/2023	 $        31,000,000 	Renasant Bank	100%	 $    31,000,000 	100%	 $    31,000,000 	100%	 $    31,000,000 	100%	 $    31,000,000 
The Heights at Picardy	10/11/2023	 $        35,962,776 	b1Bank	100%	 $    35,962,776 	100%	 $    35,962,776 	100%	 $    35,962,776 	100%	 $    35,962,776 
The Waters at McGowin	1/19/2024	 $        31,815,771 	Fidelity Bank	100%	 $    31,815,771 	100%	 $    31,815,771 	100%	 $    31,815,771 	100%	 $    31,815,771 
The Waters at Freeport	4/24/2024	 $        35,000,000 	Pen-Air	100%	 $    35,000,000 	100%	 $    35,000,000 	100%	 $    35,000,000 	100%	 $    35,000,000 
The Heights at Waterpointe	7/31/2024	 $        32,467,928 	Trustmark Bank	100%	 $    32,467,928 	100%	 $    32,467,928 	100%	 $    32,467,928 	100%	 $    32,467,928 
The Waters at Promenade	10/15/2024	 $        43,540,541 	b1Bank	100%	 $    43,540,541 	100%	 $    43,540,541 	100%	 $    43,540,541 	100%	 $    43,540,541 
The Waters at Inverness	1/0/1900	 $        39,587,145 	Hancock Whitney	100%	 $    39,587,145 	100%	 $    39,587,145 	100%	 $    39,587,145 	100%	 $    39,587,145 
The Waters at OWA	1/0/1900	 $        33,456,617 	Renasant Bank	100%	 $    33,456,617 	100%	 $    33,456,617 	100%	 $    33,456,617 	100%	 $    33,456,617 
The Waters at Covington	1/0/1900	 $        41,117,057 	Hancock Whitney	100%	 $    41,117,057 	100%	 $    41,117,057 	100%	 $    41,117,057 	100%	 $    41,117,057 
The Waters at Southpoint	1/0/1900	 $        42,468,145 	0.00%	100%	 $    42,468,145 	100%	 $    42,468,145 	100%	 $    42,468,145 	100%	 $    42,468,145 
The Flats at Ransley	12/20/2024	 $        38,624,364 	Hancock Whitney	100%	 $    38,624,364 	100%	 $    38,624,364 	100%	 $    38,624,364 	100%	 $    38,624,364 
The Heights at Materra	1/0/1900	 $        38,002,833 	First Horizon Bank	100%	 $    38,002,833 	100%	 $    38,002,833 	100%	 $    38,002,833 	100%	 $    38,002,833 
The Waters at Crosspointe	3/27/2024	 $        41,580,000 	Wells Fargo	100%	 $    41,580,000 	100%	 $    41,580,000 	100%	 $    41,580,000 	100%	 $    41,580,000 
`;

interface ContingentLiabilityRow {
  propertyName: string;
  constructionLoanClosing: string | null;
  constructionLoanAmount: number | null;
  constructionFinancingLender: string;
  stoaHoldingsPercent: number | null;
  stoaHoldingsAmount: number | null;
  tobyEasterlyPercent: number | null;
  tobyEasterlyAmount: number | null;
  ryanNashPercent: number | null;
  ryanNashAmount: number | null;
  saunSullivanPercent: number | null;
  saunSullivanAmount: number | null;
  covenants: string | null;
}

function parseContingentLiabilitiesData(data: string): ContingentLiabilityRow[] {
  const rows: ContingentLiabilityRow[] = [];
  const lines = data.trim().split('\n').filter(line => line.trim() !== '');
  
  for (const line of lines) {
    // Split by tab character
    const columns = line.split('\t').map(col => col.trim());
    
    if (columns.length < 12) continue;
    
    // Handle case where lender column might be missing or contain percentage (like "0.00%")
    // Check if column 3 looks like a percentage instead of a bank name
    let lenderCol = 3;
    let stoaHoldingsPercentCol = 4;
    let stoaHoldingsAmountCol = 5;
    
    // If column 3 is a percentage (contains '%'), shift columns
    if (columns[3] && columns[3].includes('%')) {
      lenderCol = -1; // No lender provided
      stoaHoldingsPercentCol = 3;
      stoaHoldingsAmountCol = 4;
    }
    
    const row: ContingentLiabilityRow = {
      propertyName: columns[0],
      constructionLoanClosing: parseDate(columns[1]),
      constructionLoanAmount: parseAmount(columns[2]),
      constructionFinancingLender: lenderCol >= 0 && columns[lenderCol] && !columns[lenderCol].includes('%') 
        ? columns[lenderCol] 
        : '',
      stoaHoldingsPercent: parseFloat(columns[stoaHoldingsPercentCol]?.replace('%', '').replace(',', '') || '0') || null,
      stoaHoldingsAmount: parseAmount(columns[stoaHoldingsAmountCol]),
      tobyEasterlyPercent: parseFloat(columns[stoaHoldingsAmountCol + 1]?.replace('%', '').replace(',', '') || '0') || null,
      tobyEasterlyAmount: parseAmount(columns[stoaHoldingsAmountCol + 2]),
      ryanNashPercent: parseFloat(columns[stoaHoldingsAmountCol + 3]?.replace('%', '').replace(',', '') || '0') || null,
      ryanNashAmount: parseAmount(columns[stoaHoldingsAmountCol + 4]),
      saunSullivanPercent: parseFloat(columns[stoaHoldingsAmountCol + 5]?.replace('%', '').replace(',', '') || '0') || null,
      saunSullivanAmount: parseAmount(columns[stoaHoldingsAmountCol + 6]),
      covenants: columns[stoaHoldingsAmountCol + 7] && columns[stoaHoldingsAmountCol + 7].trim() !== '' 
        ? columns[stoaHoldingsAmountCol + 7].trim() 
        : null
    };
    
    rows.push(row);
  }
  
  return rows;
}

async function main() {
  console.log('🚀 Starting Contingent Liabilities Import...\n');
  
  const pool = await getPool();
  
  try {
    const rows = parseContingentLiabilitiesData(contingentLiabilitiesData);
    console.log(`📊 Parsed ${rows.length} rows of contingent liabilities data\n`);
    
    let loansUpdated = 0;
    let guaranteesCreated = 0;
    let guaranteesUpdated = 0;
    let covenantsCreated = 0;
    let errors = 0;
    
    // Person mapping
    const personNames = [
      { key: 'stoaHoldings', name: 'Stoa Holdings, LLC' },
      { key: 'tobyEasterly', name: 'Toby Easterly' },
      { key: 'ryanNash', name: 'Ryan Nash' },
      { key: 'saunSullivan', name: 'Saun Sullivan' }
    ];
    
    // Get or create all person IDs
    const personIds: Record<string, number> = {};
    for (const person of personNames) {
      personIds[person.key] = await getOrCreatePerson(pool, person.name);
      console.log(`  ✓ Person: ${person.name} (ID: ${personIds[person.key]})`);
    }
    
    for (const row of rows) {
      try {
        // Get project ID
        const projectId = await getProjectId(pool, row.propertyName);
        if (!projectId) {
          console.log(`⚠️  Project not found: ${row.propertyName}`);
          errors++;
          continue;
        }
        
        // Get or create loan
        let loanId = await getLoanId(pool, projectId);
        
        // Get bank ID
        let bankId: number | null = null;
        if (row.constructionFinancingLender) {
          bankId = await getBankId(pool, row.constructionFinancingLender);
          if (!bankId) {
            console.log(`⚠️  Bank not found: ${row.constructionFinancingLender} (for ${row.propertyName})`);
          }
        }
        
        // Update or create construction loan
        if (row.constructionLoanClosing || row.constructionLoanAmount || bankId) {
          if (loanId) {
            // Update existing loan
            await pool.request()
              .input('LoanId', sql.Int, loanId)
              .input('LoanClosingDate', sql.Date, row.constructionLoanClosing)
              .input('LoanAmount', sql.Decimal(18, 2), row.constructionLoanAmount)
              .input('LenderId', sql.Int, bankId)
              .input('LoanPhase', sql.NVarChar, 'Construction')
              .query(`
                UPDATE banking.Loan
                SET 
                  LoanClosingDate = @LoanClosingDate,
                  LoanAmount = @LoanAmount,
                  LenderId = CASE WHEN @LenderId IS NOT NULL THEN @LenderId ELSE LenderId END,
                  LoanPhase = CASE WHEN LoanPhase IS NULL OR LoanPhase = '' THEN @LoanPhase ELSE LoanPhase END
                WHERE LoanId = @LoanId
              `);
            loansUpdated++;
          } else {
            // Create new loan
            const result = await pool.request()
              .input('ProjectId', sql.Int, projectId)
              .input('LoanClosingDate', sql.Date, row.constructionLoanClosing)
              .input('LoanAmount', sql.Decimal(18, 2), row.constructionLoanAmount)
              .input('LenderId', sql.Int, bankId)
              .input('LoanPhase', sql.NVarChar, 'Construction')
              .query(`
                INSERT INTO banking.Loan (ProjectId, LoanClosingDate, LoanAmount, LenderId, LoanPhase)
                OUTPUT INSERTED.LoanId
                VALUES (@ProjectId, @LoanClosingDate, @LoanAmount, @LenderId, @LoanPhase)
              `);
            loanId = result.recordset[0].LoanId;
            loansUpdated++;
          }
        }
        
        // Process guarantees
        const guaranteeData = [
          { personKey: 'stoaHoldings', percent: row.stoaHoldingsPercent, amount: row.stoaHoldingsAmount },
          { personKey: 'tobyEasterly', percent: row.tobyEasterlyPercent, amount: row.tobyEasterlyAmount },
          { personKey: 'ryanNash', percent: row.ryanNashPercent, amount: row.ryanNashAmount },
          { personKey: 'saunSullivan', percent: row.saunSullivanPercent, amount: row.saunSullivanAmount }
        ];
        
        for (const guarantee of guaranteeData) {
          const personId = personIds[guarantee.personKey];
          // personId should always exist now since we create them, but double-check
          if (!personId) {
            console.log(`⚠️  Person ID not found for key: ${guarantee.personKey}`);
            continue;
          }
          
          // Only create/update if there's a percent or amount
          if (guarantee.percent !== null && guarantee.percent > 0 || guarantee.amount !== null && guarantee.amount > 0) {
            // Check if guarantee already exists
            const existingResult = await pool.request()
              .input('ProjectId', sql.Int, projectId)
              .input('PersonId', sql.Int, personId)
              .query('SELECT GuaranteeId FROM banking.Guarantee WHERE ProjectId = @ProjectId AND PersonId = @PersonId');
            
            if (existingResult.recordset.length > 0) {
              // Update existing guarantee
              await pool.request()
                .input('GuaranteeId', sql.Int, existingResult.recordset[0].GuaranteeId)
                .input('LoanId', sql.Int, loanId)
                .input('GuaranteePercent', sql.Decimal(10, 4), guarantee.percent)
                .input('GuaranteeAmount', sql.Decimal(18, 2), guarantee.amount)
                .query(`
                  UPDATE banking.Guarantee
                  SET LoanId = @LoanId,
                      GuaranteePercent = @GuaranteePercent,
                      GuaranteeAmount = @GuaranteeAmount
                  WHERE GuaranteeId = @GuaranteeId
                `);
              guaranteesUpdated++;
            } else {
              // Create new guarantee
              await pool.request()
                .input('ProjectId', sql.Int, projectId)
                .input('LoanId', sql.Int, loanId)
                .input('PersonId', sql.Int, personId)
                .input('GuaranteePercent', sql.Decimal(10, 4), guarantee.percent)
                .input('GuaranteeAmount', sql.Decimal(18, 2), guarantee.amount)
                .query(`
                  INSERT INTO banking.Guarantee (ProjectId, LoanId, PersonId, GuaranteePercent, GuaranteeAmount)
                  VALUES (@ProjectId, @LoanId, @PersonId, @GuaranteePercent, @GuaranteeAmount)
                `);
              guaranteesCreated++;
            }
          }
        }
        
        // Process covenants
        if (row.covenants && row.covenants.trim() !== '') {
          // Check if covenant already exists
          const existingCovenant = await pool.request()
            .input('ProjectId', sql.Int, projectId)
            .input('Notes', sql.NVarChar(sql.MAX), row.covenants)
            .query('SELECT CovenantId FROM banking.Covenant WHERE ProjectId = @ProjectId AND Notes = @Notes');
          
          if (existingCovenant.recordset.length === 0) {
            await pool.request()
              .input('ProjectId', sql.Int, projectId)
              .input('LoanId', sql.Int, loanId)
              .input('CovenantType', sql.NVarChar, 'Other')
              .input('Notes', sql.NVarChar(sql.MAX), row.covenants)
              .query(`
                INSERT INTO banking.Covenant (ProjectId, LoanId, CovenantType, Notes)
                VALUES (@ProjectId, @LoanId, @CovenantType, @Notes)
              `);
            covenantsCreated++;
          }
        }
        
        console.log(`✅ Processed: ${row.propertyName}`);
      } catch (error: any) {
        console.error(`❌ Error processing ${row.propertyName}:`, error.message);
        errors++;
      }
    }
    
    console.log('\n📊 Import Summary:');
    console.log(`  ✅ Loans updated/created: ${loansUpdated}`);
    console.log(`  ✅ Guarantees created: ${guaranteesCreated}`);
    console.log(`  ✅ Guarantees updated: ${guaranteesUpdated}`);
    console.log(`  ✅ Covenants created: ${covenantsCreated}`);
    console.log(`  ❌ Errors: ${errors}`);
    
  } catch (error: any) {
    console.error('❌ Fatal error:', error);
    throw error;
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}
