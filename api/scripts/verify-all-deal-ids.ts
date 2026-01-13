#!/usr/bin/env ts-node
/**
 * Verify ALL Tables Are Deal-Centric
 * 
 * Checks that ALL records across ALL departments (banking, pipeline, core)
 * are properly linked to valid ProjectIds (deals)
 * 
 * Usage: npm run db:verify-all-deal-ids
 */

import { getPool } from './db-manipulate';
import sql from 'mssql';

async function verifyAllDealIds() {
  const pool = await getPool();
  
  try {
    console.log('🔍 Verifying ALL Tables Are Deal-Centric...\n');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    let hasErrors = false;
    const errors: string[] = [];
    
    // Get all tables with ProjectId columns
    const tablesWithProjectId = await pool.request().query(`
      SELECT 
        TABLE_SCHEMA,
        TABLE_NAME,
        COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA IN ('core', 'banking', 'pipeline')
        AND COLUMN_NAME = 'ProjectId'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);
    
    console.log(`Found ${tablesWithProjectId.recordset.length} tables with ProjectId:\n`);
    
    for (const table of tablesWithProjectId.recordset) {
      const schema = table.TABLE_SCHEMA;
      const tableName = table.TABLE_NAME;
      const fullTableName = `${schema}.${tableName}`;
      
      console.log(`Checking ${fullTableName}...`);
      
      // Check for NULL ProjectIds
      const nullCheck = await pool.request().query(`
        SELECT COUNT(*) as count
        FROM ${fullTableName}
        WHERE ProjectId IS NULL
      `);
      
      if (nullCheck.recordset[0].count > 0) {
        const errorMsg = `   ❌ ${nullCheck.recordset[0].count} records with NULL ProjectId`;
        console.log(errorMsg);
        errors.push(`${fullTableName}: ${errorMsg}`);
        hasErrors = true;
      }
      
      // Check for invalid ProjectIds (not in core.Project)
      const invalidCheck = await pool.request().query(`
        SELECT COUNT(*) as count
        FROM ${fullTableName} t
        LEFT JOIN core.Project p ON p.ProjectId = t.ProjectId
        WHERE t.ProjectId IS NOT NULL AND p.ProjectId IS NULL
      `);
      
      if (invalidCheck.recordset[0].count > 0) {
        const errorMsg = `   ❌ ${invalidCheck.recordset[0].count} records with invalid ProjectId`;
        console.log(errorMsg);
        errors.push(`${fullTableName}: ${errorMsg}`);
        hasErrors = true;
      }
      
      // Get total count
      const totalCheck = await pool.request().query(`SELECT COUNT(*) as count FROM ${fullTableName}`);
      const totalCount = totalCheck.recordset[0].count;
      
      if (!hasErrors || (nullCheck.recordset[0].count === 0 && invalidCheck.recordset[0].count === 0)) {
        console.log(`   ✅ All ${totalCount} records have valid ProjectIds`);
      }
      console.log('');
    }
    
    // Check for tables that SHOULD have ProjectId but don't
    console.log('Checking for tables that might be missing ProjectId...\n');
    
    const allTables = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND TABLE_SCHEMA IN ('core', 'banking', 'pipeline')
        AND TABLE_NAME NOT IN ('Project', 'Person', 'Bank', 'EquityPartner', 'BankTarget')
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);
    
    const tablesWithProjectIdList = tablesWithProjectId.recordset.map((t: any) => `${t.TABLE_SCHEMA}.${t.TABLE_NAME}`);
    
    for (const table of allTables.recordset) {
      const fullTableName = `${table.TABLE_SCHEMA}.${table.TABLE_NAME}`;
      
      if (!tablesWithProjectIdList.includes(fullTableName)) {
        // Check if this table has any records
        const recordCheck = await pool.request().query(`SELECT COUNT(*) as count FROM ${fullTableName}`);
        
        if (recordCheck.recordset[0].count > 0) {
          console.log(`   ⚠️  ${fullTableName} has ${recordCheck.recordset[0].count} records but no ProjectId column`);
          console.log(`      This table may need to be linked to deals!\n`);
        }
      }
    }
    
    // Summary by Project
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Summary: Records per Project across all departments\n');
    
    const projectSummary = await pool.request().query(`
      SELECT 
        p.ProjectId,
        p.ProjectName,
        (SELECT COUNT(*) FROM banking.EquityCommitment WHERE ProjectId = p.ProjectId) as EquityCommitments,
        (SELECT COUNT(*) FROM banking.Loan WHERE ProjectId = p.ProjectId) as Loans,
        (SELECT COUNT(*) FROM banking.Participation WHERE ProjectId = p.ProjectId) as Participations,
        (SELECT COUNT(*) FROM banking.DSCRTest WHERE ProjectId = p.ProjectId) as DSCRTests,
        (SELECT COUNT(*) FROM banking.Covenant WHERE ProjectId = p.ProjectId) as Covenants,
        (SELECT COUNT(*) FROM banking.Guarantee WHERE ProjectId = p.ProjectId) as Guarantees,
        (SELECT COUNT(*) FROM banking.LiquidityRequirement WHERE ProjectId = p.ProjectId) as LiquidityReqs,
        (SELECT COUNT(*) FROM pipeline.UnderContract WHERE ProjectId = p.ProjectId) as UnderContract,
        (SELECT COUNT(*) FROM pipeline.CommercialListed WHERE ProjectId = p.ProjectId) as CommercialListed,
        (SELECT COUNT(*) FROM pipeline.CommercialAcreage WHERE ProjectId = p.ProjectId) as CommercialAcreage,
        (SELECT COUNT(*) FROM pipeline.ClosedProperty WHERE ProjectId = p.ProjectId) as ClosedProperty
      FROM core.Project p
      WHERE EXISTS (
        SELECT 1 FROM banking.EquityCommitment WHERE ProjectId = p.ProjectId
        UNION ALL
        SELECT 1 FROM banking.Loan WHERE ProjectId = p.ProjectId
        UNION ALL
        SELECT 1 FROM banking.Participation WHERE ProjectId = p.ProjectId
        UNION ALL
        SELECT 1 FROM banking.DSCRTest WHERE ProjectId = p.ProjectId
        UNION ALL
        SELECT 1 FROM banking.Covenant WHERE ProjectId = p.ProjectId
        UNION ALL
        SELECT 1 FROM banking.Guarantee WHERE ProjectId = p.ProjectId
        UNION ALL
        SELECT 1 FROM banking.LiquidityRequirement WHERE ProjectId = p.ProjectId
        UNION ALL
        SELECT 1 FROM pipeline.UnderContract WHERE ProjectId = p.ProjectId
        UNION ALL
        SELECT 1 FROM pipeline.CommercialListed WHERE ProjectId = p.ProjectId
        UNION ALL
        SELECT 1 FROM pipeline.CommercialAcreage WHERE ProjectId = p.ProjectId
        UNION ALL
        SELECT 1 FROM pipeline.ClosedProperty WHERE ProjectId = p.ProjectId
      )
      ORDER BY p.ProjectName
    `);
    
    if (projectSummary.recordset.length > 0) {
      console.log(`Found ${projectSummary.recordset.length} projects with data across all departments:\n`);
      projectSummary.recordset.forEach((proj: any) => {
        const total = (proj.EquityCommitments || 0) + (proj.Loans || 0) + (proj.Participations || 0) + 
                      (proj.DSCRTests || 0) + (proj.Covenants || 0) + (proj.Guarantees || 0) + 
                      (proj.LiquidityReqs || 0) + (proj.UnderContract || 0) + (proj.CommercialListed || 0) + 
                      (proj.CommercialAcreage || 0) + (proj.ClosedProperty || 0);
        if (total > 0) {
          console.log(`   ${proj.ProjectName}:`);
          if (proj.EquityCommitments > 0) console.log(`      Equity Commitments: ${proj.EquityCommitments}`);
          if (proj.Loans > 0) console.log(`      Loans: ${proj.Loans}`);
          if (proj.Participations > 0) console.log(`      Participations: ${proj.Participations}`);
          if (proj.DSCRTests > 0) console.log(`      DSCR Tests: ${proj.DSCRTests}`);
          if (proj.Covenants > 0) console.log(`      Covenants: ${proj.Covenants}`);
          if (proj.Guarantees > 0) console.log(`      Guarantees: ${proj.Guarantees}`);
          if (proj.LiquidityReqs > 0) console.log(`      Liquidity Requirements: ${proj.LiquidityReqs}`);
          if (proj.UnderContract > 0) console.log(`      Under Contract: ${proj.UnderContract}`);
          if (proj.CommercialListed > 0) console.log(`      Commercial Listed: ${proj.CommercialListed}`);
          if (proj.CommercialAcreage > 0) console.log(`      Commercial Acreage: ${proj.CommercialAcreage}`);
          if (proj.ClosedProperty > 0) console.log(`      Closed Property: ${proj.ClosedProperty}`);
          console.log('');
        }
      });
    }
    
    // Final summary
    console.log('═══════════════════════════════════════════════════════════');
    if (hasErrors) {
      console.log('❌ ERRORS FOUND: Some records are not properly linked to deals');
      console.log('\nErrors:');
      errors.forEach(err => console.log(`   ${err}`));
      console.log('\nPlease review and fix the issues above.');
    } else {
      console.log('✅ ALL CHECKS PASSED: All records across all departments are properly linked to deals!');
      console.log('\nEvery record in every table is tied to a valid ProjectId (deal).');
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
  verifyAllDealIds().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { verifyAllDealIds };
