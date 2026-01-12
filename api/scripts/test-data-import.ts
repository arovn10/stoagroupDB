#!/usr/bin/env ts-node
/**
 * Test Data Import - Verify all data was imported correctly
 * 
 * Usage: npm run db:test-data
 * Or: ts-node scripts/test-data-import.ts
 */

import { query, getPool } from './db-manipulate';
import sql from 'mssql';

interface TableCount {
  table: string;
  count: number;
  description: string;
}

async function testDataImport() {
  try {
    console.log('🔍 Testing Data Import Status...\n');
    
    const pool = await getPool();
    const results: TableCount[] = [];
    
    // Core Tables
    console.log('📊 Checking Core Tables...');
    const projects = await query('SELECT COUNT(*) AS cnt FROM core.Project');
    results.push({ table: 'core.Project', count: projects[0].cnt, description: 'Projects' });
    console.log(`  ✅ Projects: ${projects[0].cnt}`);
    
    const banks = await query('SELECT COUNT(*) AS cnt FROM core.Bank');
    results.push({ table: 'core.Bank', count: banks[0].cnt, description: 'Banks' });
    console.log(`  ✅ Banks: ${banks[0].cnt}`);
    
    const people = await query('SELECT COUNT(*) AS cnt FROM core.Person');
    results.push({ table: 'core.Person', count: people[0].cnt, description: 'People' });
    console.log(`  ✅ People: ${people[0].cnt}`);
    
    const equityPartners = await query('SELECT COUNT(*) AS cnt FROM core.EquityPartner');
    results.push({ table: 'core.EquityPartner', count: equityPartners[0].cnt, description: 'Equity Partners' });
    console.log(`  ✅ Equity Partners: ${equityPartners[0].cnt}`);
    
    // Banking Tables
    console.log('\n🏦 Checking Banking Tables...');
    const loans = await query('SELECT COUNT(*) AS cnt FROM banking.Loan');
    results.push({ table: 'banking.Loan', count: loans[0].cnt, description: 'Loans' });
    console.log(`  ✅ Loans: ${loans[0].cnt}`);
    
    const participations = await query('SELECT COUNT(*) AS cnt FROM banking.Participation');
    results.push({ table: 'banking.Participation', count: participations[0].cnt, description: 'Participations' });
    console.log(`  ✅ Participations: ${participations[0].cnt}`);
    
    const guarantees = await query('SELECT COUNT(*) AS cnt FROM banking.Guarantee');
    results.push({ table: 'banking.Guarantee', count: guarantees[0].cnt, description: 'Guarantees' });
    console.log(`  ✅ Guarantees: ${guarantees[0].cnt}`);
    
    const dscrTests = await query('SELECT COUNT(*) AS cnt FROM banking.DSCRTest');
    results.push({ table: 'banking.DSCRTest', count: dscrTests[0].cnt, description: 'DSCR Tests' });
    console.log(`  ✅ DSCR Tests: ${dscrTests[0].cnt}`);
    
    const covenants = await query('SELECT COUNT(*) AS cnt FROM banking.Covenant');
    results.push({ table: 'banking.Covenant', count: covenants[0].cnt, description: 'Covenants' });
    console.log(`  ✅ Covenants: ${covenants[0].cnt}`);
    
    const liquidityReqs = await query('SELECT COUNT(*) AS cnt FROM banking.LiquidityRequirement');
    results.push({ table: 'banking.LiquidityRequirement', count: liquidityReqs[0].cnt, description: 'Liquidity Requirements' });
    console.log(`  ✅ Liquidity Requirements: ${liquidityReqs[0].cnt}`);
    
    const equityCommitments = await query('SELECT COUNT(*) AS cnt FROM banking.EquityCommitment');
    results.push({ table: 'banking.EquityCommitment', count: equityCommitments[0].cnt, description: 'Equity Commitments (IMS)' });
    console.log(`  ✅ Equity Commitments (IMS): ${equityCommitments[0].cnt}`);
    
    const bankTargets = await query('SELECT COUNT(*) AS cnt FROM banking.BankTarget');
    results.push({ table: 'banking.BankTarget', count: bankTargets[0].cnt, description: 'Bank Targets' });
    console.log(`  ✅ Bank Targets: ${bankTargets[0].cnt}`);
    
    // Pipeline Tables
    console.log('\n🏗️  Checking Pipeline Tables...');
    const underContract = await query('SELECT COUNT(*) AS cnt FROM pipeline.UnderContract');
    results.push({ table: 'pipeline.UnderContract', count: underContract[0].cnt, description: 'Under Contract' });
    console.log(`  ✅ Under Contract: ${underContract[0].cnt}`);
    
    const closedProperties = await query('SELECT COUNT(*) AS cnt FROM pipeline.ClosedProperty');
    results.push({ table: 'pipeline.ClosedProperty', count: closedProperties[0].cnt, description: 'Closed Properties' });
    console.log(`  ✅ Closed Properties: ${closedProperties[0].cnt}`);
    
    const commercialListed = await query('SELECT COUNT(*) AS cnt FROM pipeline.CommercialListed');
    results.push({ table: 'pipeline.CommercialListed', count: commercialListed[0].cnt, description: 'Commercial Listed' });
    console.log(`  ✅ Commercial Listed: ${commercialListed[0].cnt}`);
    
    const commercialAcreage = await query('SELECT COUNT(*) AS cnt FROM pipeline.CommercialAcreage');
    results.push({ table: 'pipeline.CommercialAcreage', count: commercialAcreage[0].cnt, description: 'Commercial Acreage' });
    console.log(`  ✅ Commercial Acreage: ${commercialAcreage[0].cnt}`);
    
    // Sample Data
    console.log('\n📋 Sample Data:');
    
    if (projects[0].cnt > 0) {
      const sampleProjects = await query('SELECT TOP 3 ProjectName, City, State, Stage FROM core.Project ORDER BY ProjectName');
      console.log('\n  Sample Projects:');
      sampleProjects.forEach((p: any) => {
        console.log(`    - ${p.ProjectName} (${p.City}, ${p.State}) - ${p.Stage || 'N/A'}`);
      });
    }
    
    if (loans[0].cnt > 0) {
      const sampleLoans = await query(`
        SELECT TOP 3 l.LoanId, p.ProjectName, l.LoanAmount, l.LoanPhase
        FROM banking.Loan l
        INNER JOIN core.Project p ON l.ProjectId = p.ProjectId
        ORDER BY l.LoanId
      `);
      console.log('\n  Sample Loans:');
      sampleLoans.forEach((l: any) => {
        const amount = l.LoanAmount ? `$${Number(l.LoanAmount).toLocaleString()}` : 'N/A';
        console.log(`    - ${l.ProjectName}: ${amount} (${l.LoanPhase || 'N/A'})`);
      });
    }
    
    if (equityCommitments[0].cnt > 0) {
      const sampleEquity = await query(`
        SELECT TOP 3 ec.EquityCommitmentId, p.ProjectName, ep.PartnerName, ec.Amount, ec.FundingDate
        FROM banking.EquityCommitment ec
        INNER JOIN core.Project p ON ec.ProjectId = p.ProjectId
        LEFT JOIN core.EquityPartner ep ON ec.EquityPartnerId = ep.EquityPartnerId
        ORDER BY ec.EquityCommitmentId
      `);
      console.log('\n  Sample Equity Commitments (IMS):');
      sampleEquity.forEach((e: any) => {
        const amount = e.Amount ? `$${Number(e.Amount).toLocaleString()}` : 'N/A';
        const date = e.FundingDate ? new Date(e.FundingDate).toLocaleDateString() : 'N/A';
        console.log(`    - ${e.ProjectName}: ${amount} from ${e.PartnerName || 'N/A'} (${date})`);
      });
    }
    
    if (equityPartners[0].cnt > 0) {
      const samplePartners = await query('SELECT TOP 5 PartnerName FROM core.EquityPartner ORDER BY PartnerName');
      console.log('\n  Sample Equity Partners:');
      samplePartners.forEach((ep: any) => {
        console.log(`    - ${ep.PartnerName}`);
      });
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 DATA IMPORT SUMMARY');
    console.log('='.repeat(60));
    
    const totalRecords = results.reduce((sum, r) => sum + r.count, 0);
    console.log(`\nTotal Records Across All Tables: ${totalRecords.toLocaleString()}\n`);
    
    console.log('Table Breakdown:');
    results.forEach(r => {
      const status = r.count > 0 ? '✅' : '⚠️ ';
      console.log(`  ${status} ${r.description.padEnd(30)} ${r.count.toString().padStart(6)} records`);
    });
    
    // Check for common issues
    console.log('\n🔍 Data Quality Checks:');
    
    const projectsWithoutLoans = await query(`
      SELECT COUNT(*) AS cnt 
      FROM core.Project p
      LEFT JOIN banking.Loan l ON p.ProjectId = l.ProjectId
      WHERE l.LoanId IS NULL
    `);
    console.log(`  Projects without loans: ${projectsWithoutLoans[0].cnt}`);
    
    const loansWithoutProjects = await query(`
      SELECT COUNT(*) AS cnt 
      FROM banking.Loan l
      WHERE l.ProjectId IS NULL
    `);
    console.log(`  Loans without projects: ${loansWithoutProjects[0].cnt}`);
    
    const equityWithoutProjects = await query(`
      SELECT COUNT(*) AS cnt 
      FROM banking.EquityCommitment ec
      WHERE ec.ProjectId IS NULL
    `);
    console.log(`  Equity commitments without projects: ${equityWithoutProjects[0].cnt}`);
    
    await pool.close();
    
    console.log('\n✅ Data import test completed!');
    
  } catch (error: any) {
    console.error('\n❌ Test failed!');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('\nStack:', error.stack);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  testDataImport();
}
