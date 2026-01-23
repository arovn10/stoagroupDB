#!/usr/bin/env ts-node
/**
 * Sync I/O Maturity Covenants for Existing Construction Loans
 * 
 * Creates I/O Maturity covenants for all Construction loans that have IOMaturityDate
 * but don't have a corresponding covenant yet.
 * 
 * Usage: npm run db:sync-io-maturity-covenants
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

if (!process.env.DB_SERVER || !process.env.DB_DATABASE || !process.env.DB_USER || !process.env.DB_PASSWORD) {
  console.error('❌ Missing required environment variables!');
  process.exit(1);
}

const config: sql.config = {
  server: process.env.DB_SERVER || '',
  database: process.env.DB_DATABASE || '',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
  },
};

async function syncIOMaturityCovenants() {
  let pool: sql.ConnectionPool | null = null;

  try {
    console.log('🔌 Connecting to database...\n');
    pool = await sql.connect(config);
    console.log('✅ Connected!\n');

    // Find Construction loans with IOMaturityDate that don't have I/O Maturity covenants
    console.log('📋 Finding Construction loans with I/O Maturity dates...\n');
    const loansResult = await pool.request().query(`
      SELECT 
        l.LoanId,
        l.ProjectId,
        p.ProjectName,
        l.IOMaturityDate,
        c.CovenantId
      FROM banking.Loan l
      LEFT JOIN core.Project p ON l.ProjectId = p.ProjectId
      LEFT JOIN banking.Covenant c ON c.LoanId = l.LoanId AND c.CovenantType = 'I/O Maturity'
      WHERE l.LoanPhase = 'Construction'
        AND l.IOMaturityDate IS NOT NULL
        AND c.CovenantId IS NULL
      ORDER BY p.ProjectName
    `);

    const loansToSync = loansResult.recordset;
    console.log(`Found ${loansToSync.length} Construction loan(s) that need I/O Maturity covenants\n`);

    if (loansToSync.length === 0) {
      console.log('✅ All Construction loans with I/O Maturity dates already have covenants!\n');
      return;
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('CREATING I/O MATURITY COVENANTS');
    console.log('═══════════════════════════════════════════════════════════\n');

    let created = 0;
    let errors = 0;

    for (const loan of loansToSync) {
      try {
        const maturityDate = new Date(loan.IOMaturityDate);
        
        await pool.request()
          .input('projectId', sql.Int, loan.ProjectId)
          .input('loanId', sql.Int, loan.LoanId)
          .input('covenantType', sql.NVarChar, 'I/O Maturity')
          .input('covenantDate', sql.Date, maturityDate)
          .input('requirement', sql.NVarChar, 'Construction I/O Maturity')
          .query(`
            INSERT INTO banking.Covenant (
              ProjectId, LoanId, CovenantType,
              CovenantDate, Requirement, IsCompleted
            )
            VALUES (
              @projectId, @loanId, @covenantType,
              @covenantDate, @requirement, 0
            )
          `);

        created++;
        const dateStr = maturityDate.toISOString().split('T')[0];
        console.log(`✅ Created covenant for: ${loan.ProjectName || `Project ID ${loan.ProjectId}`} | I/O Date: ${dateStr}`);
      } catch (error: any) {
        errors++;
        console.error(`❌ Failed to create covenant for ${loan.ProjectName || `Project ID ${loan.ProjectId}`}: ${error.message}`);
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`✅ Created: ${created} covenant(s)`);
    if (errors > 0) {
      console.log(`❌ Errors: ${errors}`);
    }
    console.log('');

    // Verify the results
    const verifyResult = await pool.request().query(`
      SELECT COUNT(*) AS Count
      FROM banking.Covenant
      WHERE CovenantType = 'I/O Maturity'
    `);

    const totalIOMaturityCovenants = verifyResult.recordset[0].Count;
    console.log(`📊 Total I/O Maturity covenants in database: ${totalIOMaturityCovenants}`);

    console.log('\n✅ Sync complete!');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.number) {
      console.error(`   SQL Error Number: ${error.number}`);
    }
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run the sync
syncIOMaturityCovenants();
