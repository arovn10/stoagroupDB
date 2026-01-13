#!/usr/bin/env ts-node
/**
 * Add BirthOrder to core.Project
 * Birth Order is a CORE attribute that identifies projects
 * 
 * Usage: npm run db:add-birth-order-to-project
 */

import { getPool } from './db-manipulate';
import sql from 'mssql';

async function main() {
  console.log('🚀 Adding BirthOrder to core.Project...\n');
  
  const pool = await getPool();
  
  try {
    // Check if column exists
    const checkColumn = await pool.request().query(`
      SELECT COUNT(*) AS col_count
      FROM sys.columns 
      WHERE object_id = OBJECT_ID('core.Project') 
      AND name = 'BirthOrder'
    `);
    
    if (checkColumn.recordset[0].col_count === 0) {
      // Add BirthOrder column
      await pool.request().query(`
        ALTER TABLE core.Project
        ADD BirthOrder INT NULL
      `);
      console.log('✅ Added BirthOrder column to core.Project');
    } else {
      console.log('ℹ️  BirthOrder column already exists in core.Project');
    }
    
    // Create index if it doesn't exist
    const checkIndex = await pool.request().query(`
      SELECT COUNT(*) AS idx_count
      FROM sys.indexes 
      WHERE name = 'IX_Project_BirthOrder' 
      AND object_id = OBJECT_ID('core.Project')
    `);
    
    if (checkIndex.recordset[0].idx_count === 0) {
      await pool.request().query(`
        CREATE INDEX IX_Project_BirthOrder ON core.Project(BirthOrder)
      `);
      console.log('✅ Created index IX_Project_BirthOrder');
    } else {
      console.log('ℹ️  Index IX_Project_BirthOrder already exists');
    }
    
    // Migrate existing BirthOrder data from banking.Loan to core.Project
    const migrateResult = await pool.request().query(`
      UPDATE p
      SET p.BirthOrder = l.BirthOrder
      FROM core.Project p
      INNER JOIN (
        SELECT 
          ProjectId,
          BirthOrder,
          ROW_NUMBER() OVER (PARTITION BY ProjectId ORDER BY 
            CASE WHEN LoanPhase = 'Construction' THEN 0 
                 WHEN LoanPhase = 'Land' THEN 1 
                 ELSE 2 END,
            LoanId
          ) AS rn
        FROM banking.Loan
        WHERE BirthOrder IS NOT NULL
      ) l ON p.ProjectId = l.ProjectId AND l.rn = 1
      WHERE p.BirthOrder IS NULL
    `);
    
    console.log(`✅ Migrated BirthOrder data: ${migrateResult.rowsAffected[0]} projects updated`);
    
    // Show summary
    const summary = await pool.request().query(`
      SELECT 
        COUNT(*) AS total_projects,
        COUNT(BirthOrder) AS projects_with_birth_order
      FROM core.Project
    `);
    
    console.log('\n📊 Summary:');
    console.log(`  Total Projects: ${summary.recordset[0].total_projects}`);
    console.log(`  Projects with Birth Order: ${summary.recordset[0].projects_with_birth_order}`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}
