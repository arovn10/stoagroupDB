#!/usr/bin/env ts-node
/**
 * Update LLC Projects to "HoldCo" Stage
 * 
 * Updates the following LLC projects to "HoldCo" stage:
 * - 210 E Morris Ave, LLC
 * - Amor Fati, LLC
 * - Bauerle Rd Land, LLC
 * - Icarus Development, LLC
 */

import { getPool } from './db-manipulate';
import sql from 'mssql';

const LLC_PROJECTS = [
  '210 E Morris Ave, LLC',
  'Amor Fati, LLC',
  'Bauerle Rd Land, LLC',
  'Icarus Development, LLC'
];

async function updateHoldCoStage() {
  const pool = await getPool();
  
  try {
    console.log('Updating LLC projects to "HoldCo" stage...');
    console.log('');
    
    // Build parameterized update query
    const updateRequest = pool.request();
    const placeholders: string[] = [];
    LLC_PROJECTS.forEach((name, i) => {
      const paramName = `P${i}`;
      placeholders.push(`@${paramName}`);
      updateRequest.input(paramName, sql.NVarChar, name);
    });
    
    // Update projects to HoldCo stage
    const updateResult = await updateRequest.query(`
      UPDATE core.Project
      SET Stage = 'HoldCo',
          UpdatedAt = SYSDATETIME()
      WHERE ProjectName IN (${placeholders.join(', ')})
        AND (Stage IS NULL OR Stage != 'HoldCo')
    `);
    
    console.log(`✅ Updated ${updateResult.rowsAffected[0]} project(s) to "HoldCo" stage`);
    console.log('');
    
    // Show final results
    const finalRequest = pool.request();
    LLC_PROJECTS.forEach((name, i) => {
      finalRequest.input(`P${i}`, sql.NVarChar, name);
    });
    
    const finalResult = await finalRequest.query(`
      SELECT 
        ProjectId,
        ProjectName,
        City,
        State,
        Region,
        ProductType,
        Stage,
        UpdatedAt
      FROM core.Project
      WHERE ProjectName IN (${placeholders.join(', ')})
      ORDER BY ProjectName
    `);
    
    console.log('📊 Updated Projects:');
    console.log(JSON.stringify(finalResult.recordset, null, 2));
    console.log('');
    
    // Validation
    const holdCoCount = finalResult.recordset.filter(p => p.Stage === 'HoldCo').length;
    if (holdCoCount === LLC_PROJECTS.length) {
      console.log(`✅ All ${LLC_PROJECTS.length} LLC projects successfully updated to "HoldCo" stage`);
    } else {
      console.log(`⚠️  Warning: Only ${holdCoCount} of ${LLC_PROJECTS.length} projects have "HoldCo" stage`);
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  updateHoldCoStage().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { updateHoldCoStage };
