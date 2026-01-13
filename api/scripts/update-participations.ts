#!/usr/bin/env ts-node
/**
 * Update Participations for a Project
 * 
 * Updates or creates bank participations for a specific project
 * 
 * Usage:
 *   npm run db:update-participations
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

async function findProjectByName(pool: sql.ConnectionPool, projectName: string): Promise<number | null> {
  const result = await pool.request()
    .input('projectName', sql.NVarChar, projectName)
    .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @projectName');
  
  if (result.recordset.length > 0) {
    return result.recordset[0].ProjectId;
  }
  
  return null;
}

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
  
  return null;
}

async function findLoanForProject(pool: sql.ConnectionPool, projectId: number): Promise<number | null> {
  // Find construction loan for this project
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT TOP 1 LoanId 
      FROM banking.Loan 
      WHERE ProjectId = @projectId 
      ORDER BY CASE WHEN LoanPhase = 'Construction' THEN 0 ELSE 1 END, LoanId
    `);
  
  if (result.recordset.length > 0) {
    return result.recordset[0].LoanId;
  }
  
  return null;
}

async function updateOrCreateParticipation(
  pool: sql.ConnectionPool,
  projectId: number,
  loanId: number | null,
  bankId: number,
  exposureAmount: number,
  paidOffAmount: number | null = null
): Promise<void> {
  // Determine if paid off: if paidOffAmount equals exposureAmount, it's fully paid off
  const isPaidOff = paidOffAmount !== null && paidOffAmount === exposureAmount;
  
  // Check if participation already exists
  const existing = await pool.request()
    .input('projectId', sql.Int, projectId)
    .input('bankId', sql.Int, bankId)
    .query('SELECT ParticipationId FROM banking.Participation WHERE ProjectId = @projectId AND BankId = @bankId');
  
  // Store with temporary percentage - will recalculate after all are inserted
  const tempPercent = '0.0%';
  
  if (existing.recordset.length > 0) {
    // Update existing
    const participationId = existing.recordset[0].ParticipationId;
    await pool.request()
      .input('participationId', sql.Int, participationId)
      .input('loanId', sql.Int, loanId)
      .input('participationPercent', sql.NVarChar, tempPercent)
      .input('exposureAmount', sql.Decimal(18, 2), exposureAmount)
      .input('paidOff', sql.Bit, isPaidOff ? 1 : 0)
      .query(`
        UPDATE banking.Participation
        SET LoanId = @loanId,
            ParticipationPercent = @participationPercent,
            ExposureAmount = @exposureAmount,
            PaidOff = @paidOff
        WHERE ParticipationId = @participationId
      `);
  } else {
    // Create new
    await pool.request()
      .input('projectId', sql.Int, projectId)
      .input('loanId', sql.Int, loanId)
      .input('bankId', sql.Int, bankId)
      .input('participationPercent', sql.NVarChar, tempPercent)
      .input('exposureAmount', sql.Decimal(18, 2), exposureAmount)
      .input('paidOff', sql.Bit, isPaidOff ? 1 : 0)
      .query(`
        INSERT INTO banking.Participation (ProjectId, LoanId, BankId, ParticipationPercent, ExposureAmount, PaidOff)
        VALUES (@projectId, @loanId, @bankId, @participationPercent, @exposureAmount, @paidOff)
      `);
  }
}

async function recalculateParticipationPercentages(pool: sql.ConnectionPool, projectId: number): Promise<void> {
  // Get total active exposure (only non-paid-off participations)
  const totalResult = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT 
        SUM(CASE 
          WHEN PaidOff = 1 THEN 0
          ELSE ExposureAmount
        END) AS TotalActiveExposure
      FROM banking.Participation
      WHERE ProjectId = @projectId
    `);
  
  const totalActiveExposure = totalResult.recordset[0]?.TotalActiveExposure || 0;
  
  if (totalActiveExposure === 0) {
    // All participations are paid off, set all to 0%
    await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        UPDATE banking.Participation
        SET ParticipationPercent = '0.0%'
        WHERE ProjectId = @projectId
      `);
    return;
  }
  
  // Get all participations and calculate percentages
  const participations = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT ParticipationId, ExposureAmount, PaidOff
      FROM banking.Participation
      WHERE ProjectId = @projectId
    `);
  
  // Update each participation with calculated percentage
  for (const part of participations.recordset) {
    const exposure = parseFloat(part.ExposureAmount) || 0;
    const isPaidOff = part.PaidOff === true || part.PaidOff === 1;
    
    let calculatedPercent: string;
    if (isPaidOff) {
      calculatedPercent = '0.0%';
    } else {
      const percentValue = (exposure / totalActiveExposure) * 100;
      calculatedPercent = `${percentValue.toFixed(1)}%`;
    }
    
    await pool.request()
      .input('participationId', sql.Int, part.ParticipationId)
      .input('participationPercent', sql.NVarChar, calculatedPercent)
      .query(`
        UPDATE banking.Participation
        SET ParticipationPercent = @participationPercent
        WHERE ParticipationId = @participationId
      `);
  }
}

async function main(): Promise<void> {
  // Get project name from command line argument or use default
  const projectName = process.argv[2] || 'The Waters at Millerville';
  
  console.log(`🚀 Starting Participation Update for ${projectName}...\n`);
  
  const pool = await getPool();
  
  try {
    const projectId = await findProjectByName(pool, projectName);
    
    if (!projectId) {
      console.error(`❌ Project "${projectName}" not found!`);
      process.exit(1);
    }
    
    console.log(`✅ Found project: ${projectName} (ID: ${projectId})`);
    
    const loanId = await findLoanForProject(pool, projectId);
    if (!loanId) {
      console.log(`⚠️  No loan found for project, participations will be created without LoanId`);
    } else {
      console.log(`✅ Found loan ID: ${loanId}`);
    }
    
    // Participation data - default to Millerville, can be overridden
    let participations: Array<{ bankName: string; percent: string; exposure: number; paidOff?: number }>;
    
    if (projectName.includes('Settlers Trace')) {
      participations = [
        { bankName: 'b1Bank', percent: '32.0%', exposure: 15998489 },
        { bankName: 'The Citizens Bank', percent: '16.0%', exposure: 7999995 },
        { bankName: 'Rayne State Bank', percent: '4.0%', exposure: 1999874 },
        { bankName: 'Catalyst Bank', percent: '10.0%', exposure: 4999684 },
        { bankName: 'Community First Bank', percent: '10.0%', exposure: 4999684 },
        { bankName: 'BOM Bank', percent: '10.0%', exposure: 4999684 },
        { bankName: 'CLB Bank', percent: '8.0%', exposure: 3999747 },
        { bankName: 'FNB Jeanerette', percent: '10.0%', exposure: 4999684 },
      ];
    } else if (projectName.includes('Millerville')) {
      participations = [
        { bankName: 'First Horizon Bank', percent: '100.0%', exposure: 36200000 },
      ];
    } else if (projectName.includes('Redstone')) {
      participations = [
        { bankName: 'Renasant Bank', percent: '66.7%', exposure: 20000000 },
        { bankName: 'Bryant Bank', percent: '16.7%', exposure: 5000000 },
        { bankName: 'Home Bank', percent: '16.7%', exposure: 5000000 },
      ];
    } else if (projectName.includes('West Village')) {
      participations = [
        { bankName: 'Trustmark Bank', percent: '80.3%', exposure: 20436963 },
        { bankName: 'Red River Bank', percent: '19.7%', exposure: 5000000 },
      ];
    } else if (projectName.includes('Bluebonnet')) {
      participations = [
        { bankName: 'Trustmark Bank', percent: '59.3%', exposure: 23612626 },
        { bankName: 'b1Bank', percent: '4.3%', exposure: 1700000 },
        { bankName: 'JD Bank', percent: '17.6%', exposure: 7000000 },
        { bankName: 'Home Bank', percent: '18.8%', exposure: 7500000 },
      ];
    } else if (projectName.includes('Crestview')) {
      participations = [
        { bankName: 'Renasant Bank', percent: '100.0%', exposure: 33000000 },
        { bankName: 'Investar Bank', percent: '0.0%', exposure: 0 },
        { bankName: 'Bryant Bank', percent: '0.0%', exposure: 0 },
        { bankName: 'Home Bank', percent: '0.0%', exposure: 0 },
      ];
    } else if (projectName.includes('Picardy')) {
      participations = [
        { bankName: 'b1Bank', percent: '47.2%', exposure: 16962776 },
        { bankName: 'First National Bank USA', percent: '8.3%', exposure: 3000000 },
        { bankName: 'St Landry Bank', percent: '7.0%', exposure: 2500000 },
        { bankName: 'Plaquemine Bank', percent: '2.8%', exposure: 1000000 },
        { bankName: 'Liberty Bank', percent: '13.9%', exposure: 5000000 },
        { bankName: 'Citizens Bank & Trust', percent: '8.3%', exposure: 3000000 },
        { bankName: 'Bank of Zachary', percent: '12.5%', exposure: 4500000 },
      ];
    } else if (projectName.includes('MCgowin') || projectName.includes('McGowin')) {
      participations = [
        { bankName: 'Fidelity Bank', percent: '37.7%', exposure: 12000000 },
        { bankName: 'Gulf Coast Bank and Trust', percent: '22.2%', exposure: 7065771 },
        { bankName: 'The Citizens National Bank of Meridian', percent: '15.7%', exposure: 5000000 },
        { bankName: 'Southern Bancorp', percent: '14.9%', exposure: 4750000 },
        { bankName: 'Southern Heritage Bank', percent: '9.4%', exposure: 3000000 },
      ];
    } else if (projectName.includes('Freeport')) {
      participations = [
        { bankName: 'Pen-Air Credit Union', percent: '54.3%', exposure: 19000000 },
        { bankName: 'JD Bank', percent: '21.4%', exposure: 7500000 },
        { bankName: 'Radifi Federal Credit Union', percent: '7.1%', exposure: 2500000 },
        { bankName: 'Avadian Credit Union', percent: '5.7%', exposure: 2000000 },
        { bankName: 'Heart of Louisiana Federal Credit Union', percent: '4.3%', exposure: 1500000 },
        { bankName: 'Mutual Federal Credit Union', percent: '2.9%', exposure: 1000000 },
        { bankName: 'Aneca Federal Credit Union', percent: '2.9%', exposure: 1000000 },
        { bankName: 'Red River Employees Federal Credit Union', percent: '1.4%', exposure: 500000 },
      ];
    } else if (projectName.includes('Waterpointe')) {
      participations = [
        { bankName: 'Trustmark Bank', percent: '46.2%', exposure: 15000000 },
        { bankName: 'The Citizens National Bank of Meridian', percent: '26.9%', exposure: 8733984 },
        { bankName: 'First US Bank', percent: '26.9%', exposure: 8733984 },
      ];
    } else if (projectName.includes('Promenade')) {
      participations = [
        { bankName: 'b1Bank', percent: '67.8%', exposure: 29540541 },
        { bankName: 'United Community Bank - Louisiana', percent: '11.5%', exposure: 5000000 },
        { bankName: 'Community Bank of Louisiana', percent: '11.5%', exposure: 5000000 },
        { bankName: 'Synergy Bank', percent: '9.2%', exposure: 4000000 },
      ];
    } else if (projectName.includes('Waters at Ransley') && !projectName.includes('Flats')) {
      participations = [
        { bankName: 'First Horizon Bank', percent: '52.9%', exposure: 20000000, paidOff: 20000000 },
        { bankName: 'Bank Plus', percent: '47.1%', exposure: 17800000, paidOff: 17800000 },
      ];
    } else if (projectName.includes('Flats at Ransley')) {
      participations = [
        { bankName: 'Hancock Whitney', percent: '74.1%', exposure: 23418034 },
        { bankName: 'Renasant Bank', percent: '25.9%', exposure: 10000000 },
      ];
    } else if (projectName.includes('Flats at East Bay')) {
      participations = [
        { bankName: 'Cadence Bank', percent: '100.0%', exposure: 31599189, paidOff: 31599189 },
      ];
    } else if (projectName.includes('Materra')) {
      participations = [
        { bankName: 'First Horizon Bank', percent: '100.0%', exposure: 36573000 },
      ];
    } else if (projectName.includes('Crosspointe')) {
      participations = [
        { bankName: 'Wells Fargo', percent: '100.0%', exposure: 41580000 },
      ];
    } else if (projectName.includes('Inverness')) {
      participations = [
        { bankName: 'Hancock Whitney', percent: '100.0%', exposure: 41874574 },
      ];
    } else if (projectName.includes('Conway')) {
      participations = [
        { bankName: 'b1Bank', percent: '100.0%', exposure: 41874574 },
      ];
    } else if (projectName.includes('Covington')) {
      participations = [
        { bankName: 'Hancock Whitney', percent: '100.0%', exposure: 41874574 },
      ];
    } else if (projectName.includes('Hammond')) {
      participations = [
        { bankName: 'b1Bank', percent: '44.5%', exposure: 14019970, paidOff: 14019970 },
        { bankName: 'First National Bank USA', percent: '7.9%', exposure: 2500009, paidOff: 2500009 },
        { bankName: 'St Landry Bank', percent: '7.9%', exposure: 2500009, paidOff: 2500009 },
        { bankName: 'The Citizens Bank', percent: '20.6%', exposure: 6499991, paidOff: 6499991 },
        { bankName: 'Citizens Savings Bank', percent: '9.5%', exposure: 3000011, paidOff: 3000011 },
        { bankName: 'BOM Bank', percent: '9.5%', exposure: 3000011, paidOff: 3000011 },
      ];
    } else if (projectName.includes('Manhattan')) {
      participations = [
        { bankName: 'b1Bank', percent: '40.4%', exposure: 15567672, paidOff: 15567672 },
        { bankName: 'First American Bank & Trust', percent: '46.7%', exposure: 17999724, paidOff: 17999724 },
        { bankName: 'Liberty Bank', percent: '13.0%', exposure: 4999859, paidOff: 4999859 },
      ];
    } else if (projectName.includes('Heritage')) {
      participations = [
        { bankName: 'b1Bank', percent: '44.4%', exposure: 16521515, paidOff: 16521515 },
        { bankName: 'JD Bank', percent: '13.4%', exposure: 4999888, paidOff: 4999888 },
        { bankName: 'Rayne State Bank', percent: '8.1%', exposure: 2999784, paidOff: 2999784 },
        { bankName: 'United Mississippi', percent: '5.4%', exposure: 1999732, paidOff: 1999732 },
        { bankName: 'Currency Bank', percent: '5.4%', exposure: 1999732, paidOff: 1999732 },
        { bankName: 'Gibsland Bank & Trust', percent: '5.4%', exposure: 1999732, paidOff: 1999732 },
        { bankName: 'Magnolia State Bank', percent: '4.0%', exposure: 1499520, paidOff: 1499520 },
        { bankName: 'Citizens Bank & Trust', percent: '3.2%', exposure: 1199541, paidOff: 1199541 },
        { bankName: 'Richton Bank & Trust', percent: '2.7%', exposure: 999680, paidOff: 999680 },
        { bankName: 'Winnsboro State Bank & Trust', percent: '2.7%', exposure: 999680, paidOff: 999680 },
        { bankName: 'American Bank & Trust', percent: '2.7%', exposure: 999680, paidOff: 999680 },
        { bankName: 'Farmers State Bank', percent: '2.7%', exposure: 999680, paidOff: 999680 },
      ];
    } else {
      console.error('❌ Unknown project. Please specify project name or update script.');
      process.exit(1);
    }
    
    console.log(`\n📊 Updating ${participations.length} participations...\n`);
    
    let updated = 0;
    let created = 0;
    const notFound: string[] = [];
    
    // First, delete any existing participations for this project that aren't in our list
    const existingBanks = participations.map(p => p.bankName);
    const bankIds: number[] = [];
    
    for (const part of participations) {
      const bankId = await findBankByName(pool, part.bankName);
      if (bankId) {
        bankIds.push(bankId);
      }
    }
    
    if (bankIds.length > 0) {
      const placeholders = bankIds.map((_, i) => `@bankId${i}`).join(', ');
      const deleteRequest = pool.request();
      bankIds.forEach((id, i) => {
        deleteRequest.input(`bankId${i}`, sql.Int, id);
      });
      deleteRequest.input('projectId', sql.Int, projectId);
      
      await deleteRequest.query(`
        DELETE FROM banking.Participation
        WHERE ProjectId = @projectId
          AND BankId NOT IN (${placeholders})
      `);
      console.log(`  🗑️  Deleted old participations not in the new list`);
    }
    
    // Now update/create participations
    for (const part of participations) {
      const bankId = await findBankByName(pool, part.bankName);
      
      if (!bankId) {
        console.log(`  ⚠️  Bank "${part.bankName}" → NOT FOUND`);
        notFound.push(part.bankName);
        continue;
      }
      
      const existing = await pool.request()
        .input('projectId', sql.Int, projectId)
        .input('bankId', sql.Int, bankId)
        .query('SELECT ParticipationId FROM banking.Participation WHERE ProjectId = @projectId AND BankId = @bankId');
      
      const paidOffAmount = part.paidOff !== undefined ? part.paidOff : null;
      const isPaidOff = paidOffAmount !== null && paidOffAmount === part.exposure;
      const paidOffText = isPaidOff ? ' [PAID OFF]' : '';
      
      if (existing.recordset.length > 0) {
        await updateOrCreateParticipation(pool, projectId, loanId, bankId, part.exposure, paidOffAmount);
        console.log(`  ✅ "${part.bankName}" → Updated ($${part.exposure.toLocaleString()}${paidOffText})`);
        updated++;
      } else {
        await updateOrCreateParticipation(pool, projectId, loanId, bankId, part.exposure, paidOffAmount);
        console.log(`  ✅ "${part.bankName}" → Created ($${part.exposure.toLocaleString()}${paidOffText})`);
        created++;
      }
    }
    
    // Recalculate all participation percentages based on active exposure
    console.log(`\n📊 Recalculating participation percentages based on active exposure...`);
    await recalculateParticipationPercentages(pool, projectId);
    
    console.log(`\n✅ Summary:`);
    console.log(`   - Updated: ${updated} participations`);
    console.log(`   - Created: ${created} participations`);
    if (notFound.length > 0) {
      console.log(`   - Not Found: ${notFound.length} banks`);
      notFound.forEach(name => console.log(`     - ${name}`));
    }
    
    // Verify totals
    const totalResult = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          COUNT(*) AS Count,
          SUM(ExposureAmount) AS TotalExposure,
          SUM(CASE WHEN PaidOff = 1 THEN 0 ELSE ExposureAmount END) AS TotalActiveExposure,
          SUM(CAST(REPLACE(ParticipationPercent, '%', '') AS FLOAT)) AS TotalPercent
        FROM banking.Participation
        WHERE ProjectId = @projectId
      `);
    
    if (totalResult.recordset.length > 0) {
      const totals = totalResult.recordset[0];
      console.log(`\n📊 Verification:`);
      console.log(`   - Total Participations: ${totals.Count}`);
      console.log(`   - Total Exposure: $${totals.TotalExposure?.toLocaleString() || '0'}`);
      console.log(`   - Total Active Exposure: $${totals.TotalActiveExposure?.toLocaleString() || '0'}`);
      console.log(`   - Total Percentage (active): ${totals.TotalPercent || 0}%`);
      
      // Show individual participations with calculated percentages
      const detailsResult = await pool.request()
        .input('projectId', sql.Int, projectId)
        .query(`
          SELECT 
            b.BankName,
            p.ParticipationPercent,
            p.ExposureAmount,
            p.PaidOff
          FROM banking.Participation p
          INNER JOIN core.Bank b ON p.BankId = b.BankId
          WHERE p.ProjectId = @projectId
          ORDER BY p.ExposureAmount DESC
        `);
      
      console.log(`\n📋 Participation Details:`);
      detailsResult.recordset.forEach((p: any) => {
        const status = p.PaidOff ? ' [PAID OFF]' : '';
        console.log(`   - ${p.BankName}: ${p.ParticipationPercent} ($${p.ExposureAmount?.toLocaleString()}${status})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error updating participations:', error);
    process.exit(1);
  } finally {
    await pool.close();
    console.log('\n🔌 Database connection closed');
  }
}

if (require.main === module) {
  main();
}
