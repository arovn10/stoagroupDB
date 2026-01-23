#!/usr/bin/env ts-node
/**
 * Test fetching covenants from the database
 * Shows all covenants including I/O Maturity covenants
 * 
 * Usage: npm run db:test-covenants
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

async function testCovenants() {
  let pool: sql.ConnectionPool | null = null;

  try {
    console.log('🔌 Connecting to database...\n');
    pool = await sql.connect(config);
    console.log('✅ Connected!\n');

    // Get all covenants
    console.log('📋 Fetching all covenants...\n');
    const allCovenants = await pool.request().query(`
      SELECT 
        c.CovenantId,
        c.ProjectId,
        p.ProjectName,
        c.LoanId,
        c.CovenantType,
        c.CovenantDate,
        c.DSCRTestDate,
        c.OccupancyCovenantDate,
        c.Requirement,
        c.IsCompleted,
        c.Notes,
        CASE 
          WHEN c.CovenantType = 'DSCR' THEN c.DSCRTestDate
          WHEN c.CovenantType = 'Occupancy' THEN c.OccupancyCovenantDate
          ELSE c.CovenantDate
        END AS DisplayDate
      FROM banking.Covenant c
      LEFT JOIN core.Project p ON c.ProjectId = p.ProjectId
      ORDER BY c.ProjectId, c.CovenantType, c.CovenantDate
    `);

    const covenants = allCovenants.recordset;
    console.log(`✅ Found ${covenants.length} total covenants\n`);

    // Group by type
    const byType: { [key: string]: any[] } = {};
    covenants.forEach(c => {
      if (!byType[c.CovenantType]) {
        byType[c.CovenantType] = [];
      }
      byType[c.CovenantType].push(c);
    });

    // Display by type
    console.log('═══════════════════════════════════════════════════════════');
    console.log('COVENANTS BY TYPE');
    console.log('═══════════════════════════════════════════════════════════\n');

    Object.keys(byType).sort().forEach(type => {
      const typeCovenants = byType[type];
      console.log(`📌 ${type}: ${typeCovenants.length} covenant(s)`);
      
      typeCovenants.forEach(c => {
        const completed = c.IsCompleted ? '✅' : '⏳';
        const date = c.DisplayDate ? new Date(c.DisplayDate).toISOString().split('T')[0] : 'N/A';
        const note = c.Notes ? ` (Note: ${c.Notes.substring(0, 50)}${c.Notes.length > 50 ? '...' : ''})` : '';
        console.log(`   ${completed} Project: ${c.ProjectName || `ID ${c.ProjectId}`} | Date: ${date} | Completed: ${c.IsCompleted}${note}`);
      });
      console.log('');
    });

    // Show I/O Maturity covenants specifically
    const ioMaturityCovenants = covenants.filter(c => c.CovenantType === 'I/O Maturity');
    
    if (ioMaturityCovenants.length > 0) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('I/O MATURITY COVENANTS (Auto-created)');
      console.log('═══════════════════════════════════════════════════════════\n');
      
      ioMaturityCovenants.forEach(c => {
        console.log(`Covenant ID: ${c.CovenantId}`);
        console.log(`  Project: ${c.ProjectName || `ID ${c.ProjectId}`}`);
        console.log(`  Loan ID: ${c.LoanId || 'N/A'}`);
        console.log(`  Maturity Date: ${c.CovenantDate ? new Date(c.CovenantDate).toISOString().split('T')[0] : 'N/A'}`);
        console.log(`  Is Completed: ${c.IsCompleted ? '✅ Yes' : '⏳ No'}`);
        if (c.Notes) {
          console.log(`  Notes: ${c.Notes}`);
        }
        console.log('');
      });
    } else {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('I/O MATURITY COVENANTS');
      console.log('═══════════════════════════════════════════════════════════\n');
      console.log('⚠️  No I/O Maturity covenants found.');
      console.log('   These are auto-created when Construction loans have IOMaturityDate.\n');
    }

    // Check for Construction loans with IOMaturityDate that might need covenants
    console.log('═══════════════════════════════════════════════════════════');
    console.log('CONSTRUCTION LOANS WITH I/O MATURITY DATES');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    const loansWithIO = await pool.request().query(`
      SELECT 
        l.LoanId,
        l.ProjectId,
        p.ProjectName,
        l.IOMaturityDate,
        CASE 
          WHEN c.CovenantId IS NOT NULL THEN 'Has Covenant'
          ELSE 'Missing Covenant'
        END AS CovenantStatus
      FROM banking.Loan l
      LEFT JOIN core.Project p ON l.ProjectId = p.ProjectId
      LEFT JOIN banking.Covenant c ON c.LoanId = l.LoanId AND c.CovenantType = 'I/O Maturity'
      WHERE l.LoanPhase = 'Construction'
        AND l.IOMaturityDate IS NOT NULL
      ORDER BY p.ProjectName
    `);

    const loans = loansWithIO.recordset;
    if (loans.length > 0) {
      console.log(`Found ${loans.length} Construction loan(s) with I/O Maturity dates:\n`);
      loans.forEach(loan => {
        const date = loan.IOMaturityDate ? new Date(loan.IOMaturityDate).toISOString().split('T')[0] : 'N/A';
        const status = loan.CovenantStatus === 'Has Covenant' ? '✅' : '⚠️';
        console.log(`  ${status} ${loan.ProjectName || `Project ID ${loan.ProjectId}`} | I/O Date: ${date} | ${loan.CovenantStatus}`);
      });
    } else {
      console.log('No Construction loans with I/O Maturity dates found.\n');
    }

    console.log('\n✅ Test complete!');

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

// Run the test
testCovenants();
