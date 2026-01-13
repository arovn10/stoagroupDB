#!/usr/bin/env ts-node
/**
 * Update Banking Dashboard Data
 * 
 * Updates loan, DSCR test, liquidity requirement, and covenant data from banking dashboard.
 * Fills in gaps, corrects inaccurate info, and adds missing data.
 * 
 * Usage: npm run db:update-banking-dashboard
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

function parsePercent(str: string | null | undefined): string | null {
  if (!str || str.trim() === '' || str === 'N/A' || str === '-') return null;
  return str.trim();
}

async function getProjectId(pool: sql.ConnectionPool, borrowerName: string): Promise<number | null> {
  // Try to find project by borrower name (which might match ProjectName)
  // First try direct ProjectName match
  let result = await pool.request()
    .input('name', sql.NVarChar, borrowerName.trim())
    .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @name');
  
  if (result.recordset.length > 0) {
    return result.recordset[0].ProjectId;
  }
  
  // Then try to find via Loan.Borrower
  result = await pool.request()
    .input('name', sql.NVarChar, borrowerName.trim())
    .query(`
      SELECT DISTINCT l.ProjectId 
      FROM banking.Loan l 
      WHERE l.Borrower = @name
    `);
  
  return result.recordset.length > 0 ? result.recordset[0].ProjectId : null;
}

async function getBankId(pool: sql.ConnectionPool, bankName: string): Promise<number | null> {
  if (!bankName || bankName.trim() === '') return null;
  const result = await pool.request()
    .input('name', sql.NVarChar, bankName.trim())
    .query('SELECT BankId FROM core.Bank WHERE BankName = @name');
  
  return result.recordset.length > 0 ? result.recordset[0].BankId : null;
}

async function getLoanId(pool: sql.ConnectionPool, projectId: number, borrowerName?: string, loanType?: string | null, birthOrder?: number | null): Promise<number | null> {
  // Try to find by birth order first (most specific)
  if (birthOrder !== null && birthOrder !== undefined) {
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .input('birthOrder', sql.Int, birthOrder)
      .query('SELECT TOP 1 LoanId FROM banking.Loan WHERE ProjectId = @projectId AND BirthOrder = @birthOrder ORDER BY LoanId');
    
    if (result.recordset.length > 0) {
      return result.recordset[0].LoanId;
    }
  }
  
  // Try to find by loan type (more specific)
  if (loanType) {
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .input('loanType', sql.NVarChar, loanType.trim())
      .query('SELECT TOP 1 LoanId FROM banking.Loan WHERE ProjectId = @projectId AND LoanType = @loanType ORDER BY LoanId');
    
    if (result.recordset.length > 0) {
      return result.recordset[0].LoanId;
    }
  }
  
  // Fallback: get first loan for project
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT TOP 1 LoanId 
      FROM banking.Loan 
      WHERE ProjectId = @projectId 
      ORDER BY CASE WHEN LoanPhase = 'Construction' THEN 0 
                    WHEN LoanPhase = 'Land' THEN 1 
                    ELSE 2 END, LoanId
    `);
  
  return result.recordset.length > 0 ? result.recordset[0].LoanId : null;
}

interface BankingDashboardRow {
  birthOrder: number | null;
  borrower: string;
  loanType: string | null;
  location: string | null;
  units: number | null;
  constructionFinancingLender: string | null;
  constructionLoanAmount: number | null;
  constructionLoanClosing: string | null;
  constructionCompletionDate: string | null;
  constructionIOMaturity: string | null;
  fixedOrFloating: string | null;
  index: string | null;
  spread: string | null;
  miniPermMaturity: string | null;
  miniPermInterestRate: string | null;
  permPhaseMaturity: string | null;
  permPhaseInterestRate: string | null;
  dscr1Date: string | null;
  dscr1Requirement: string | null;
  dscr2Date: string | null;
  dscr2Requirement: string | null;
  dscr3Date: string | null;
  dscr3Requirement: string | null;
  liquidityTotal: number | null;
  liquidityLendingBank: number | null;
  occupancyCovenantDate: string | null;
  occupancyRequirement: string | null;
  projectedOccupancy: string | null;
  permanentCloseDate: string | null;
  permanentLender: string | null;
  permanentLoanAmount: number | null;
}

function parseBankingDashboardData(data: string): BankingDashboardRow[] {
  const rows: BankingDashboardRow[] = [];
  const lines = data.trim().split('\n').filter(line => line.trim() !== '');
  
  for (const line of lines) {
    // Split by tab character
    const columns = line.split('\t').map(col => col.trim());
    
    // Skip header rows or empty rows
    if (columns.length < 2) continue;
    
    // Check if first column is Birth Order (numeric) or Borrower (text)
    const firstCol = columns[0].trim();
    let birthOrder: number | null = null;
    let borrowerColIndex = 0;
    
    // If first column is numeric, it's Birth Order
    if (firstCol && !isNaN(parseInt(firstCol))) {
      birthOrder = parseInt(firstCol) || null;
      borrowerColIndex = 1;
    }
    
    const borrower = columns[borrowerColIndex]?.trim();
    
    // Skip if no borrower
    if (!borrower || borrower === '') continue;
    
    // Skip known header rows
    if (['Plane Loan', 'Tredge', 'Stoa Construction, LLC'].includes(borrower)) {
      continue;
    }
    
    // Column mapping (adjust indices based on whether Birth Order exists)
    // If Birth Order exists: 0=Birth Order, 1=Borrower, 2=Loan Type, etc.
    // If no Birth Order: 0=Borrower, 1=Loan Type, etc.
    const offset = borrowerColIndex;
    
    const row: BankingDashboardRow = {
      birthOrder: birthOrder,
      borrower: borrower,
      loanType: columns[offset + 1] && columns[offset + 1].trim() !== '' ? columns[offset + 1].trim() : null,
      location: columns[offset + 2] && columns[offset + 2].trim() !== '' ? columns[offset + 2].trim() : null,
      units: columns[offset + 3] ? parseInt(columns[offset + 3].replace(/,/g, '')) || null : null,
      constructionFinancingLender: columns[offset + 4] && columns[offset + 4].trim() !== '' ? columns[offset + 4].trim() : null,
      constructionLoanAmount: parseAmount(columns[offset + 5]),
      constructionLoanClosing: parseDate(columns[offset + 6]),
      constructionCompletionDate: columns[offset + 7] && columns[offset + 7].trim() !== '' ? columns[offset + 7].trim() : null, // Text field like "May-23"
      constructionIOMaturity: parseDate(columns[offset + 9]),
      fixedOrFloating: columns[offset + 10] && columns[offset + 10].trim() !== '' ? columns[offset + 10].trim() : null,
      index: columns[offset + 11] && columns[offset + 11].trim() !== '' ? columns[offset + 11].trim() : null,
      spread: parsePercent(columns[offset + 12]),
      miniPermMaturity: parseDate(columns[offset + 13]),
      miniPermInterestRate: parsePercent(columns[offset + 14]),
      permPhaseMaturity: parseDate(columns[offset + 15]),
      permPhaseInterestRate: parsePercent(columns[offset + 16]),
      dscr1Date: parseDate(columns[offset + 17]),
      dscr1Requirement: columns[offset + 19] && columns[offset + 19].trim() !== '' ? columns[offset + 19].trim() : null,
      dscr2Date: parseDate(columns[offset + 21]),
      dscr2Requirement: columns[offset + 23] && columns[offset + 23].trim() !== '' ? columns[offset + 23].trim() : null,
      dscr3Date: parseDate(columns[offset + 25]),
      dscr3Requirement: columns[offset + 27] && columns[offset + 27].trim() !== '' ? columns[offset + 27].trim() : null,
      liquidityTotal: parseAmount(columns[offset + 29]),
      liquidityLendingBank: parseAmount(columns[offset + 30]),
      occupancyCovenantDate: parseDate(columns[offset + 31]),
      occupancyRequirement: columns[offset + 32] && columns[offset + 32].trim() !== '' ? columns[offset + 32].trim() : null,
      projectedOccupancy: parsePercent(columns[offset + 33]),
      permanentCloseDate: parseDate(columns[offset + 34]),
      permanentLender: columns[offset + 35] && columns[offset + 35].trim() !== '' ? columns[offset + 35].trim() : null,
      permanentLoanAmount: parseAmount(columns[offset + 36])
    };
    
    rows.push(row);
  }
  
  return rows;
}

// Raw data - will be updated with more batches
const bankingDashboardData = `
Bauerle Rd Land, LLC	RLOC - Land			Fidelity Bank	 $   4,250,000 	2/10/2025			2/10/2027	Floating	SOFR	2.75%																								
Plane Loan																																				
210 E Morris Ave, LLC	Owner Occupied Office			Renasant Bank	 $   2,975,000 	8/28/2020			9/5/2030	Fixed	N/A	3.85%																								
Amor Fati, LLC	RLOC	LA		b1Bank	 $   4,571,200 	12/28/2023			12/28/2025	Floating	WSJ Prime	0.25%																								
Amor Fati, LLC	RLOC	MS		b1Bank	 $       751,000 	12/28/2023			12/28/2025	Floating	WSJ Prime	0.25%																								
Icarus Development, LLC	RLOC - Plane			b1Bank	 $   2,150,000 	11/28/2023			11/28/2025	Floating	WSJ Prime	0.25%																								
Tredge																																				
Stoa Construction, LLC																																				
6	The Waters at Hammond		Hammond, LA	312	b1Bank	 $31,520,000 	9/24/2020	8/24/2022	May-23	9/24/2023	Floating	WSJ Prime	0.50%	9/24/2026	5yr US Treasury + TBD - 25yr am			9/24/2024	N/A	               1.00 	N/A	3/24/2025	N/A	               1.25 	N/A					$5,000,000 	$1,000,000 				4/30/2024	Berkadia	 $                 39,364,000 
10	The Waters at Millerville		Baton Rouge, LA	295	First Horizon Bank	 $36,200,000 	6/13/2022	7/2/2024	Apr-25	7/25/2025	Floating	WSJ Prime	0.50%	6/13/2027	SOFR + 2.35% - 30yr am			6/30/2025	0.00%	               1.00 	 2,795,107.64 	9/30/2025	0.00%	               1.15 	 2,744,826.50 	12/31/2025	0.00%	               1.15 	 2,660,818.47 	$15,000,000 	$0 				4/30/2026	Berkadia	 $                 41,741,692 
11	The Waters at Redstone		Crestview, FL	240	Renasant Bank	 $30,000,000 	2/25/2022	7/25/2024	May-25	2/25/2025	Fixed	N/A	4.25%	2/25/2027	WSJ Prime + 0.5% - 25yr am			3/31/2025	0.00%	               1.20 	 1,950,257.16 									$4,000,000 	$0 				4/30/2026	Berkadia	 $                 24,849,983 
12	The Waters at Settlers Trace		Lafayette, LA	348	b1Bank	 $49,996,842 	8/24/2022	2/10/2025	Dec-25	8/24/2025	Floating	WSJ Prime	0.50%	8/24/2028	3yr US Treasury + 250 - 25yr am			9/30/2025	8.00%	               1.00 	                   0.41 	9/30/2026	6.76%	               1.10 	                   1.08 					$5,000,000 	$2,000,000 				6/30/2026	Berkadia	 $                 54,163,986 
14	The Waters at West Village		Scott, LA	216	Trustmark Bank	 $25,390,000 	12/15/2022	10/29/2024	Dec-25	12/15/2025	Floating	SOFR	2.75%	12/15/2027	SOFR + 2.75% - 30yr am			11/15/2025	0.00%	               1.25 	 2,031,943.05 									$7,500,000 	$0 				6/30/2026	Berkadia	 $                 30,802,504 
15	The Waters at Bluebonnet	LOC - Construction	Baton Rouge, LA	324	Trustmark Bank	 $39,812,626 	4/12/2023	4/3/2025	Dec-25	4/12/2027	Floating	SOFR	3.00%	4/12/2028	SOFR + 3.00% - 30yr am			3/12/2026	7.00%	               1.25 	                   1.25 									$7,500,000 	$0 				6/30/2026	Berkadia	 $                 50,618,438 
16	The Waters at Crestview	LOC - Construction	Crestview, FL	288	Renasant Bank	 $31,000,000 	8/25/2023	8/6/2025	Aug-26	1/11/2027	Floating	SOFR	2.50%	8/25/2028	3yr Treasury + 2.5% - 30yr am			9/30/2026	5.72%	               1.20 	                   1.33 									$4,000,000 	$0 				2/28/2027	Berkadia	 $                 43,012,246 
17	The Heights at Picardy	LOC - Construction	Baton Rouge, LA	232	b1Bank	 $35,962,776 	10/11/2023	6/30/2025	Aug-26	5/11/2027	Floating	SOFR	3.00%	10/11/2028	SOFR + 3.00% - 30yr am			4/30/2027	8.00%	               1.00 	                   1.05 	10/31/2027	8.00%	               1.25 	                   1.05 					$7,500,000 	$0 				2/28/2027	Berkadia	 $                 40,895,220 
18	The Waters at McGowin	LOC - Construction	Mobile, AL	252	Fidelity Bank	 $31,815,771 	1/19/2024	11/24/2025	Oct-26	1/19/2027	Floating	SOFR	2.75%	1/19/2028	SOFR + 2.75% + Principal Reduction			6/30/2027	5.94%	               1.25 	                   1.16 									$10,000,000 	$0 				4/30/2027	Berkadia	 $                 46,158,947 
19	The Waters at Freeport	LOC - Construction	Freeport, FL	226	Pen-Air	 $35,000,000 	4/24/2024	1/28/2026	Jan-27	4/24/2027	Fixed	N/A	7.50%	4/24/2029	7.5% Fixed - 30yr am			4/24/2028	7.50%	               1.20 	                   1.19 									$0 	$0 				7/31/2027	Berkadia	 $                 43,709,325 
20	The Heights at Waterpointe	LOC - Construction	Flowood, MS	240	Trustmark Bank	 $32,467,928 	7/31/2024	9/4/2026	Sep-27	7/31/2028	Floating	SOFR	3.25%	7/31/2029	SOFR + 3.25% - 30yr am			1/31/2028	7.50%	               1.00 	                   1.27 	7/31/2028	7.50%	               1.25 	                   1.27 					$7,500,000 	$0 				3/31/2028	Berkadia	 $                 44,729,630 
21	The Waters at Promenade	LOC - Construction	Marerro, LA	324	b1Bank	 $43,540,541 	10/15/2024	9/16/2026	Sep-27	4/15/2028	Floating	SOFR	3.00%	10/15/2029	SOFR + 3.00% - 30yr am			4/30/2028	6.32%	               1.00 	                   1.37 	10/31/2028	6.32%	               1.25 	                   1.38 					$7,500,000 	$0 				3/31/2028	Berkadia	 $                 56,967,430 
22	The Flats at Ransley	LOC - Construction	Pensacola, FL	294	Hancock Whitney	 $38,624,364 	12/20/2024	11/12/2026	Oct-27	6/20/2028	Floating	SOFR	2.75%	12/20/2028	SOFR + 2.75% + Principal Reduction			12/31/2027		               1.00 		9/30/2028		               1.25 						$7,500,000 	$0 				4/30/2028	Berkadia	 $                 55,343,547 
23	The Heights at Materra	LOC - Construction	Baton Rouge, LA	295	First Horizon Bank	 $38,002,833 		12/31/2026	Jun-27	3/25/2028	Floating	SOFR	3.00%	3/25/2030	SOFR + 3.00% - 30yr am 			8/17/2027	6.11%	               1.00 	                   0.67 	11/15/2027	6.21%	1.15	                   1.14 	2/13/2028	6.22%	1.25	                   1.67 	$7,500,000 					12/31/2027	Berkadia	 $                 50,502,547 
24	The Waters at Crosspointe	LOC - Construction	Columbia, SC	336	Wells Fargo	 $41,580,000 	3/27/2024	2/28/2027	Jul-27	3/27/2028	Floating	SOFR	3.50%	3/27/2030	5% 30 year am 			3/27/2028	5%	               1.20 	                   1.17 	3/27/2029	5%	1.42	                   1.20 					 $             11,117,935 	$0 	3/31/2027	50%	76.5%	1/31/2028	Berkadia	 $                 56,269,711 
25	The Waters at Inverness	LOC - Construction	Hoover, AL	289	Hancock Whitney	 $39,587,145 		3/31/2027	Nov-27																										5/31/2028	Berkadia	 $                 47,025,609 
	The Waters at Conway	LOC - Construction			b1Bank	 $38,982,446 																															
26	The Waters at OWA	LOC - Construction	Foley, AL	300	Renasant Bank	 $33,456,617 		8/31/2028	Dec-28																										6/30/2029	Berkadia	 $                 45,186,605 
27	The Waters at Greenville	LOC - Construction			Trustmark Bank	 $40,237,620 																														Berkadia	
28	The Waters at Covington	LOC - Construction	Covington, LA	336	Hancock Whitney	 $41,117,057 		12/31/2027	Jul-28																										1/31/2029	Berkadia	 $                 50,451,568 
29	The Waters at Oxford	LOC - Construction	Oxford, MS	316		 $49,632,250 		2/28/2029	Aug-29																										2/28/2030	Berkadia	 $                 69,525,969 
30	The Waters at Southpoint	LOC - Construction	Hardeeville, SC	288		 $42,468,145 		10/31/2028	Feb-29																										8/31/2029	Berkadia	 $                 51,027,668 
	The Waters at Robinwood	LOC - Construction			Wells Fargo	 $41,383,172 																															
1	Silver Oaks		Gonzales, LA	336	b1Bank	 $31,720,000 	5/3/2018	6/20/2019	Mar-20																										10/8/2019 & 7/16/2021	Berkadia	 $                 41,071,000 
2	The Heights		Hammond, LA	336	b1Bank	 $27,000,000 	10/9/2018	2/13/2020	Jul-20																										2/24/2021	Berkadia	 $                 44,880,000 
3	Sweetwater		Addis, LA	276	First American	 $28,454,715 	10/31/2018	10/31/2020	May-21																										N/A	N/A	N/A
4	The Waters at Southpark		Lake Charles, LA	220	BancorpSouth	 $20,970,360 	9/16/2019	5/18/2021	Jun-21																										N/A	N/A	N/A
5	Dawson Park		Baton Rouge, LA	155	b1Bank	 $20,900,000 	3/12/2020	1/20/2022	May-22																										N/A	N/A	N/A
7	The Waters at Manhattan		Harvey, LA	360	b1Bank	 $38,567,255 	3/25/2021	3/28/2023	Jul-23	3/25/2024		WSJ Prime + 0.75%		3/25/2027	5yr US Treasury + TBD - 25yr am			3/25/2025	N/A	               1.00 	N/A	3/25/2026	N/A	               1.10 	N/A					$5,000,000 	$1,000,000 				N/A	N/A	N/A
8	The Waters at Ransley		Pensacola, FL	336	The First	 $37,800,000 	5/24/2021	2/15/2024	Jul-24	5/24/2024		4.25% Fixed		5/24/2026	4.25% Fixed - 25yr am			6/30/2024	4.25%	               1.25 	                   1.02 									$4,000,000 	$0 				8/31/2025	Berkadia	 $                 48,977,051 
9	The Waters at Heritage		Gonzales, LA	299	b1Bank	 $37,218,163 	10/26/2021	3/6/2024	Jul-24	12/26/2024		WSJ Prime + 0.75%		12/26/2027	5yr US Treasury + TBD - 25yr am			10/26/2025	0.00%	               1.00 	                        -   	10/26/2026	0.00%	               1.10 	                        -   					$5,000,000 	$1,000,000 				7/31/2025	Berkadia	 $                 43,853,734 
13	The Flats at East Bay		Fairhope, AL	240	Cadence Bank	 $31,599,189 	6/16/2022	8/5/2024	Mar-25	6/16/2025	Fixed	N/A	4.25%	6/16/2027	4.25% Fixed - 25yr am	6/16/2050	WSJ Prime + 0.5% - 25yr am	12/31/2025	4.25%	               1.25 	                   1.21 									$0 	$0 				10/31/2025	Berkadia	 $                 34,165,221 
`;

async function main() {
  console.log('🚀 Starting Banking Dashboard Data Update...\n');
  
  const pool = await getPool();
  
  try {
    const rows = parseBankingDashboardData(bankingDashboardData);
    console.log(`📊 Parsed ${rows.length} rows of banking dashboard data\n`);
    
    let loansUpdated = 0;
    let loansCreated = 0;
    let dscrTestsCreated = 0;
    let dscrTestsUpdated = 0;
    let liquidityCreated = 0;
    let liquidityUpdated = 0;
    let covenantsCreated = 0;
    let covenantsUpdated = 0;
    let errors = 0;
    
    for (const row of rows) {
      try {
        // Find or create project
        let projectId = await getProjectId(pool, row.borrower);
        
        if (!projectId) {
          console.log(`⚠️  Project not found for borrower: ${row.borrower}`);
          // Could create project here if needed, but for now skip
          errors++;
          continue;
        }
        
        // Get or create loan
        let loanId = await getLoanId(pool, projectId, row.borrower, row.loanType, row.birthOrder);
        let lenderId: number | null = null;
        
        if (row.constructionFinancingLender) {
          lenderId = await getBankId(pool, row.constructionFinancingLender);
          if (!lenderId) {
            console.log(`⚠️  Bank not found: ${row.constructionFinancingLender} (for ${row.borrower})`);
          }
        }
        
        // Determine loan phase based on loan type
        let loanPhase = 'Other';
        if (row.loanType) {
          if (row.loanType.toLowerCase().includes('land') || row.loanType === 'RLOC - Land') {
            loanPhase = 'Land';
          } else if (row.loanType.toLowerCase().includes('construction') || row.loanType.toLowerCase().includes('rloc')) {
            loanPhase = 'Construction';
          } else if (row.loanType.toLowerCase().includes('permanent')) {
            loanPhase = 'Permanent';
          }
        }
        
        if (loanId) {
          // Build dynamic UPDATE query - only update non-null fields
          const updateFields: string[] = [];
          const request = pool.request().input('LoanId', sql.Int, loanId);
          
          if (row.birthOrder !== null && row.birthOrder !== undefined) {
            updateFields.push('BirthOrder = @BirthOrder');
            request.input('BirthOrder', sql.Int, row.birthOrder);
          }
          if (row.loanType !== null) {
            updateFields.push('LoanType = @LoanType');
            request.input('LoanType', sql.NVarChar, row.loanType);
          }
          if (loanPhase !== 'Other') {
            updateFields.push('LoanPhase = @LoanPhase');
            request.input('LoanPhase', sql.NVarChar, loanPhase);
          }
          if (lenderId !== null) {
            updateFields.push('LenderId = @LenderId');
            request.input('LenderId', sql.Int, lenderId);
          }
          if (row.constructionLoanAmount !== null) {
            updateFields.push('LoanAmount = @LoanAmount');
            request.input('LoanAmount', sql.Decimal(18, 2), row.constructionLoanAmount);
          }
          if (row.constructionLoanClosing !== null) {
            updateFields.push('LoanClosingDate = @LoanClosingDate');
            request.input('LoanClosingDate', sql.Date, row.constructionLoanClosing);
          }
          if (row.constructionCompletionDate !== null) {
            updateFields.push('ConstructionCompletionDate = @ConstructionCompletionDate');
            request.input('ConstructionCompletionDate', sql.NVarChar, row.constructionCompletionDate);
          }
          if (row.constructionIOMaturity !== null) {
            updateFields.push('IOMaturityDate = @IOMaturityDate');
            request.input('IOMaturityDate', sql.Date, row.constructionIOMaturity);
          }
          if (row.fixedOrFloating !== null) {
            updateFields.push('FixedOrFloating = @FixedOrFloating');
            request.input('FixedOrFloating', sql.NVarChar, row.fixedOrFloating);
          }
          if (row.index !== null) {
            updateFields.push('IndexName = @IndexName');
            request.input('IndexName', sql.NVarChar, row.index);
          }
          if (row.spread !== null) {
            updateFields.push('Spread = @Spread');
            request.input('Spread', sql.NVarChar, row.spread);
          }
          if (row.miniPermMaturity !== null) {
            updateFields.push('MiniPermMaturity = @MiniPermMaturity');
            request.input('MiniPermMaturity', sql.Date, row.miniPermMaturity);
          }
          if (row.miniPermInterestRate !== null) {
            updateFields.push('MiniPermInterestRate = @MiniPermInterestRate');
            request.input('MiniPermInterestRate', sql.NVarChar, row.miniPermInterestRate);
          }
          if (row.permPhaseMaturity !== null) {
            updateFields.push('PermPhaseMaturity = @PermPhaseMaturity');
            request.input('PermPhaseMaturity', sql.Date, row.permPhaseMaturity);
          }
          if (row.permPhaseInterestRate !== null) {
            updateFields.push('PermPhaseInterestRate = @PermPhaseInterestRate');
            request.input('PermPhaseInterestRate', sql.NVarChar, row.permPhaseInterestRate);
          }
          if (row.permanentCloseDate !== null) {
            updateFields.push('PermanentCloseDate = @PermanentCloseDate');
            request.input('PermanentCloseDate', sql.Date, row.permanentCloseDate);
          }
          if (row.permanentLoanAmount !== null) {
            updateFields.push('PermanentLoanAmount = @PermanentLoanAmount');
            request.input('PermanentLoanAmount', sql.Decimal(18, 2), row.permanentLoanAmount);
          }
          
          if (updateFields.length > 0) {
            await request.query(`
              UPDATE banking.Loan
              SET ${updateFields.join(', ')}
              WHERE LoanId = @LoanId
            `);
          }
          loansUpdated++;
        } else {
          // Create new loan
          const insertFields: string[] = ['ProjectId', 'LoanPhase'];
          const insertValues: string[] = ['@ProjectId', '@LoanPhase'];
          const insertRequest = pool.request()
            .input('ProjectId', sql.Int, projectId)
            .input('LoanPhase', sql.NVarChar, loanPhase);
          
          if (row.birthOrder !== null && row.birthOrder !== undefined) {
            insertFields.push('BirthOrder');
            insertValues.push('@BirthOrder');
            insertRequest.input('BirthOrder', sql.Int, row.birthOrder);
          }
          if (row.loanType !== null) {
            insertFields.push('LoanType');
            insertValues.push('@LoanType');
            insertRequest.input('LoanType', sql.NVarChar, row.loanType);
          }
          if (lenderId !== null) {
            insertFields.push('LenderId');
            insertValues.push('@LenderId');
            insertRequest.input('LenderId', sql.Int, lenderId);
          }
          if (row.constructionLoanAmount !== null) {
            insertFields.push('LoanAmount');
            insertValues.push('@LoanAmount');
            insertRequest.input('LoanAmount', sql.Decimal(18, 2), row.constructionLoanAmount);
          }
          if (row.constructionLoanClosing !== null) {
            insertFields.push('LoanClosingDate');
            insertValues.push('@LoanClosingDate');
            insertRequest.input('LoanClosingDate', sql.Date, row.constructionLoanClosing);
          }
          if (row.constructionCompletionDate !== null) {
            insertFields.push('ConstructionCompletionDate');
            insertValues.push('@ConstructionCompletionDate');
            insertRequest.input('ConstructionCompletionDate', sql.NVarChar, row.constructionCompletionDate);
          }
          if (row.constructionIOMaturity !== null) {
            insertFields.push('IOMaturityDate');
            insertValues.push('@IOMaturityDate');
            insertRequest.input('IOMaturityDate', sql.Date, row.constructionIOMaturity);
          }
          if (row.fixedOrFloating !== null) {
            insertFields.push('FixedOrFloating');
            insertValues.push('@FixedOrFloating');
            insertRequest.input('FixedOrFloating', sql.NVarChar, row.fixedOrFloating);
          }
          if (row.index !== null) {
            insertFields.push('IndexName');
            insertValues.push('@IndexName');
            insertRequest.input('IndexName', sql.NVarChar, row.index);
          }
          if (row.spread !== null) {
            insertFields.push('Spread');
            insertValues.push('@Spread');
            insertRequest.input('Spread', sql.NVarChar, row.spread);
          }
          if (row.miniPermMaturity !== null) {
            insertFields.push('MiniPermMaturity');
            insertValues.push('@MiniPermMaturity');
            insertRequest.input('MiniPermMaturity', sql.Date, row.miniPermMaturity);
          }
          if (row.miniPermInterestRate !== null) {
            insertFields.push('MiniPermInterestRate');
            insertValues.push('@MiniPermInterestRate');
            insertRequest.input('MiniPermInterestRate', sql.NVarChar, row.miniPermInterestRate);
          }
          if (row.permPhaseMaturity !== null) {
            insertFields.push('PermPhaseMaturity');
            insertValues.push('@PermPhaseMaturity');
            insertRequest.input('PermPhaseMaturity', sql.Date, row.permPhaseMaturity);
          }
          if (row.permPhaseInterestRate !== null) {
            insertFields.push('PermPhaseInterestRate');
            insertValues.push('@PermPhaseInterestRate');
            insertRequest.input('PermPhaseInterestRate', sql.NVarChar, row.permPhaseInterestRate);
          }
          if (row.permanentCloseDate !== null) {
            insertFields.push('PermanentCloseDate');
            insertValues.push('@PermanentCloseDate');
            insertRequest.input('PermanentCloseDate', sql.Date, row.permanentCloseDate);
          }
          if (row.permanentLoanAmount !== null) {
            insertFields.push('PermanentLoanAmount');
            insertValues.push('@PermanentLoanAmount');
            insertRequest.input('PermanentLoanAmount', sql.Decimal(18, 2), row.permanentLoanAmount);
          }
          
          const result = await insertRequest.query(`
            INSERT INTO banking.Loan (${insertFields.join(', ')})
            OUTPUT INSERTED.LoanId
            VALUES (${insertValues.join(', ')})
          `);
          loanId = result.recordset[0].LoanId;
          loansCreated++;
        }
        
        // Update permanent lender if different from construction lender
        if (row.permanentLender && row.permanentLender !== row.constructionFinancingLender) {
          const permanentLenderId = await getBankId(pool, row.permanentLender);
          if (permanentLenderId && loanId) {
            // For permanent loans, we might need a separate loan record
            // For now, just note that permanent lender might be different
          }
        }
        
        // Process DSCR Tests
        const dscrTests = [
          { testNumber: 1, date: row.dscr1Date, requirement: row.dscr1Requirement },
          { testNumber: 2, date: row.dscr2Date, requirement: row.dscr2Requirement },
          { testNumber: 3, date: row.dscr3Date, requirement: row.dscr3Requirement }
        ];
        
        for (const test of dscrTests) {
          if (test.date || test.requirement) {
            const existingTest = await pool.request()
              .input('ProjectId', sql.Int, projectId)
              .input('LoanId', sql.Int, loanId)
              .input('TestNumber', sql.Int, test.testNumber)
              .query(`
                SELECT DSCRTestId FROM banking.DSCRTest 
                WHERE ProjectId = @ProjectId 
                  AND (LoanId = @LoanId OR LoanId IS NULL)
                  AND TestNumber = @TestNumber
              `);
            
            if (existingTest.recordset.length > 0) {
              await pool.request()
                .input('DSCRTestId', sql.Int, existingTest.recordset[0].DSCRTestId)
                .input('TestDate', sql.Date, test.date)
                .input('Requirement', sql.NVarChar, test.requirement)
                .query(`
                  UPDATE banking.DSCRTest
                  SET TestDate = @TestDate,
                      Requirement = @Requirement
                  WHERE DSCRTestId = @DSCRTestId
                `);
              dscrTestsUpdated++;
            } else {
              await pool.request()
                .input('ProjectId', sql.Int, projectId)
                .input('LoanId', sql.Int, loanId)
                .input('TestNumber', sql.Int, test.testNumber)
                .input('TestDate', sql.Date, test.date)
                .input('Requirement', sql.NVarChar, test.requirement)
                .query(`
                  INSERT INTO banking.DSCRTest (ProjectId, LoanId, TestNumber, TestDate, Requirement)
                  VALUES (@ProjectId, @LoanId, @TestNumber, @TestDate, @Requirement)
                `);
              dscrTestsCreated++;
            }
          }
        }
        
        // Process Liquidity Requirements
        if (row.liquidityTotal !== null || row.liquidityLendingBank !== null) {
          const existingLiquidity = await pool.request()
            .input('ProjectId', sql.Int, projectId)
            .query('SELECT LiquidityRequirementId FROM banking.LiquidityRequirement WHERE ProjectId = @ProjectId');
          
          if (existingLiquidity.recordset.length > 0) {
            await pool.request()
              .input('LiquidityRequirementId', sql.Int, existingLiquidity.recordset[0].LiquidityRequirementId)
              .input('LoanId', sql.Int, loanId)
              .input('TotalAmount', sql.Decimal(18, 2), row.liquidityTotal)
              .input('LendingBankAmount', sql.Decimal(18, 2), row.liquidityLendingBank)
              .query(`
                UPDATE banking.LiquidityRequirement
                SET LoanId = @LoanId,
                    TotalAmount = @TotalAmount,
                    LendingBankAmount = @LendingBankAmount
                WHERE LiquidityRequirementId = @LiquidityRequirementId
              `);
            liquidityUpdated++;
          } else {
            await pool.request()
              .input('ProjectId', sql.Int, projectId)
              .input('LoanId', sql.Int, loanId)
              .input('TotalAmount', sql.Decimal(18, 2), row.liquidityTotal)
              .input('LendingBankAmount', sql.Decimal(18, 2), row.liquidityLendingBank)
              .query(`
                INSERT INTO banking.LiquidityRequirement (ProjectId, LoanId, TotalAmount, LendingBankAmount)
                VALUES (@ProjectId, @LoanId, @TotalAmount, @LendingBankAmount)
              `);
            liquidityCreated++;
          }
        }
        
        // Process Occupancy Covenant
        if (row.occupancyCovenantDate || row.occupancyRequirement || row.projectedOccupancy) {
          const existingCovenant = await pool.request()
            .input('ProjectId', sql.Int, projectId)
            .input('CovenantType', sql.NVarChar, 'Occupancy')
            .query(`
              SELECT CovenantId FROM banking.Covenant 
              WHERE ProjectId = @ProjectId AND CovenantType = @CovenantType
            `);
          
          if (existingCovenant.recordset.length > 0) {
            await pool.request()
              .input('CovenantId', sql.Int, existingCovenant.recordset[0].CovenantId)
              .input('LoanId', sql.Int, loanId)
              .input('CovenantDate', sql.Date, row.occupancyCovenantDate)
              .input('Requirement', sql.NVarChar, row.occupancyRequirement)
              .input('ProjectedValue', sql.NVarChar, row.projectedOccupancy)
              .query(`
                UPDATE banking.Covenant
                SET LoanId = @LoanId,
                    CovenantDate = @CovenantDate,
                    Requirement = @Requirement,
                    ProjectedValue = @ProjectedValue
                WHERE CovenantId = @CovenantId
              `);
            covenantsUpdated++;
          } else {
            await pool.request()
              .input('ProjectId', sql.Int, projectId)
              .input('LoanId', sql.Int, loanId)
              .input('CovenantType', sql.NVarChar, 'Occupancy')
              .input('CovenantDate', sql.Date, row.occupancyCovenantDate)
              .input('Requirement', sql.NVarChar, row.occupancyRequirement)
              .input('ProjectedValue', sql.NVarChar, row.projectedOccupancy)
              .query(`
                INSERT INTO banking.Covenant (ProjectId, LoanId, CovenantType, CovenantDate, Requirement, ProjectedValue)
                VALUES (@ProjectId, @LoanId, @CovenantType, @CovenantDate, @Requirement, @ProjectedValue)
              `);
            covenantsCreated++;
          }
        }
        
        console.log(`✅ Processed: ${row.borrower}`);
      } catch (error: any) {
        console.error(`❌ Error processing ${row.borrower}:`, error.message);
        errors++;
      }
    }
    
    console.log('\n📊 Update Summary:');
    console.log(`  ✅ Loans created: ${loansCreated}`);
    console.log(`  ✅ Loans updated: ${loansUpdated}`);
    console.log(`  ✅ DSCR tests created: ${dscrTestsCreated}`);
    console.log(`  ✅ DSCR tests updated: ${dscrTestsUpdated}`);
    console.log(`  ✅ Liquidity requirements created: ${liquidityCreated}`);
    console.log(`  ✅ Liquidity requirements updated: ${liquidityUpdated}`);
    console.log(`  ✅ Covenants created: ${covenantsCreated}`);
    console.log(`  ✅ Covenants updated: ${covenantsUpdated}`);
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
