#!/usr/bin/env ts-node
/**
 * Verify Deal/Project ID Integrity
 * 
 * Checks that all EquityCommitments, Loans, and Participations
 * are properly linked to valid ProjectIds
 * 
 * Usage: npm run db:verify-deal-ids
 */

import { getPool } from './db-manipulate';
import sql from 'mssql';

async function verifyDealIds() {
  const pool = await getPool();
  
  try {
    console.log('🔍 Verifying Deal/Project ID Integrity...\n');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    let hasErrors = false;
    
    // 1. Check EquityCommitments
    console.log('1. Checking EquityCommitments...');
    const equityCommitments = await pool.request().query(`
      SELECT 
        ec.EquityCommitmentId,
        ec.ProjectId,
        ec.EquityPartnerId,
        ep.PartnerName,
        ec.Amount,
        p.ProjectName
      FROM banking.EquityCommitment ec
      LEFT JOIN core.Project p ON p.ProjectId = ec.ProjectId
      LEFT JOIN core.EquityPartner ep ON ep.EquityPartnerId = ec.EquityPartnerId
      WHERE ec.ProjectId IS NULL OR p.ProjectId IS NULL
    `);
    
    if (equityCommitments.recordset.length > 0) {
      console.log(`   ❌ Found ${equityCommitments.recordset.length} EquityCommitments with invalid ProjectIds:\n`);
      equityCommitments.recordset.forEach((ec: any) => {
        console.log(`      ID: ${ec.EquityCommitmentId}, ProjectId: ${ec.ProjectId || 'NULL'}, Partner: ${ec.PartnerName || 'N/A'}, Amount: $${ec.Amount || '0'}`);
      });
      hasErrors = true;
    } else {
      const totalEC = await pool.request().query('SELECT COUNT(*) as count FROM banking.EquityCommitment');
      console.log(`   ✅ All ${totalEC.recordset[0].count} EquityCommitments have valid ProjectIds`);
    }
    console.log('');
    
    // 2. Check Loans
    console.log('2. Checking Loans...');
    const loans = await pool.request().query(`
      SELECT 
        l.LoanId,
        l.ProjectId,
        l.LoanType,
        l.LoanAmount,
        p.ProjectName
      FROM banking.Loan l
      LEFT JOIN core.Project p ON p.ProjectId = l.ProjectId
      WHERE l.ProjectId IS NULL OR p.ProjectId IS NULL
    `);
    
    if (loans.recordset.length > 0) {
      console.log(`   ❌ Found ${loans.recordset.length} Loans with invalid ProjectIds:\n`);
      loans.recordset.forEach((loan: any) => {
        console.log(`      LoanId: ${loan.LoanId}, ProjectId: ${loan.ProjectId || 'NULL'}, Type: ${loan.LoanType || 'N/A'}, Amount: $${loan.LoanAmount || '0'}`);
      });
      hasErrors = true;
    } else {
      const totalLoans = await pool.request().query('SELECT COUNT(*) as count FROM banking.Loan');
      console.log(`   ✅ All ${totalLoans.recordset[0].count} Loans have valid ProjectIds`);
    }
    console.log('');
    
    // 3. Check Participations
    console.log('3. Checking Participations...');
    const participations = await pool.request().query(`
      SELECT 
        part.ParticipationId,
        part.ProjectId,
        part.LoanId,
        part.BankId,
        b.BankName,
        part.ExposureAmount,
        p.ProjectName,
        l.LoanId as LoanExists
      FROM banking.Participation part
      LEFT JOIN core.Project p ON p.ProjectId = part.ProjectId
      LEFT JOIN banking.Loan l ON l.LoanId = part.LoanId
      LEFT JOIN core.Bank b ON b.BankId = part.BankId
      WHERE part.ProjectId IS NULL 
         OR p.ProjectId IS NULL
         OR (part.LoanId IS NOT NULL AND l.LoanId IS NULL)
    `);
    
    if (participations.recordset.length > 0) {
      console.log(`   ❌ Found ${participations.recordset.length} Participations with invalid ProjectIds or LoanIds:\n`);
      participations.recordset.forEach((part: any) => {
        console.log(`      ParticipationId: ${part.ParticipationId}`);
        console.log(`         ProjectId: ${part.ProjectId || 'NULL'} ${part.ProjectName ? `(${part.ProjectName})` : '(INVALID)'}`);
        if (part.LoanId) {
          console.log(`         LoanId: ${part.LoanId} ${part.LoanExists ? '(VALID)' : '(INVALID)'}`);
        }
        console.log(`         Bank: ${part.BankName || 'N/A'}, Exposure: $${part.ExposureAmount || '0'}\n`);
      });
      hasErrors = true;
    } else {
      const totalParts = await pool.request().query('SELECT COUNT(*) as count FROM banking.Participation');
      console.log(`   ✅ All ${totalParts.recordset[0].count} Participations have valid ProjectIds and LoanIds`);
    }
    console.log('');
    
    // 4. Summary by Project
    console.log('4. Summary by Project...\n');
    const projectSummary = await pool.request().query(`
      SELECT 
        p.ProjectId,
        p.ProjectName,
        COUNT(DISTINCT ec.EquityCommitmentId) as EquityCommitments,
        COUNT(DISTINCT l.LoanId) as Loans,
        COUNT(DISTINCT part.ParticipationId) as Participations
      FROM core.Project p
      LEFT JOIN banking.EquityCommitment ec ON ec.ProjectId = p.ProjectId
      LEFT JOIN banking.Loan l ON l.ProjectId = p.ProjectId
      LEFT JOIN banking.Participation part ON part.ProjectId = p.ProjectId
      GROUP BY p.ProjectId, p.ProjectName
      HAVING COUNT(DISTINCT ec.EquityCommitmentId) > 0
          OR COUNT(DISTINCT l.LoanId) > 0
          OR COUNT(DISTINCT part.ParticipationId) > 0
      ORDER BY p.ProjectName
    `);
    
    console.log(`   Found ${projectSummary.recordset.length} projects with banking data:\n`);
    projectSummary.recordset.forEach((proj: any) => {
      console.log(`   ${proj.ProjectName}:`);
      console.log(`      Equity Commitments: ${proj.EquityCommitments}`);
      console.log(`      Loans: ${proj.Loans}`);
      console.log(`      Participations: ${proj.Participations}\n`);
    });
    
    // Final summary
    console.log('═══════════════════════════════════════════════════════════');
    if (hasErrors) {
      console.log('❌ ERRORS FOUND: Some records have invalid ProjectIds or LoanIds');
      console.log('   Please review and fix the issues above.');
    } else {
      console.log('✅ ALL CHECKS PASSED: All records are properly linked to valid ProjectIds');
    }
    console.log('═══════════════════════════════════════════════════════════\n');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  verifyDealIds().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { verifyDealIds };
