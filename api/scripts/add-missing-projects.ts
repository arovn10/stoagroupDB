#!/usr/bin/env ts-node
/**
 * Add Missing Projects
 * 
 * Adds projects that exist in CSV files but are missing from the database
 * 
 * Usage: npm run db:add-missing-projects
 */

import { getPool } from './db-manipulate';
import sql from 'mssql';

const missingProjects = [
  // Banking Dashboard projects
  { name: 'Bauerle Rd Land, LLC', stage: 'Other' },
  { name: '210 E Morris Ave, LLC', stage: 'Other' },
  { name: 'Amor Fati, LLC', stage: 'Other' }, // LA entry
  { name: 'Icarus Development, LLC', stage: 'Other' },
  
  // Under Contract projects
  { name: 'The Waters at Bartlett', stage: 'Under Contract' },
  { name: 'Cahaba Valley Project', stage: 'Under Contract' },
  { name: 'Greenville Project', stage: 'Under Contract' },
  { name: 'Fort Walton Beach Project', stage: 'Under Contract' },
  { name: 'The Waters at New Bern', stage: 'Under Contract' },
  { name: 'Lake Murray', stage: 'Under Contract' },
  { name: 'The Waters at SweetBay', stage: 'Under Contract' },
  { name: 'The Waters at Fayetteville', stage: 'Under Contract' },
  
  // Note: "The Heights at Inverness" might be a typo - checking if "The Waters at Inverness" exists
];

async function addMissingProjects() {
  console.log('🚀 Adding Missing Projects...\n');
  
  const pool = await getPool();
  let added = 0;
  let skipped = 0;
  let errors = 0;
  
  try {
    for (const project of missingProjects) {
      try {
        // Check if project already exists
        const checkResult = await pool.request()
          .input('name', sql.NVarChar, project.name)
          .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @name');
        
        if (checkResult.recordset.length > 0) {
          console.log(`⏭️  Skipped: "${project.name}" (already exists)`);
          skipped++;
          continue;
        }
        
        // Add project
        const result = await pool.request()
          .input('ProjectName', sql.NVarChar, project.name)
          .input('Stage', sql.NVarChar, project.stage)
          .query(`
            INSERT INTO core.Project (ProjectName, Stage)
            VALUES (@ProjectName, @Stage);
            SELECT SCOPE_IDENTITY() AS ProjectId;
          `);
        
        const projectId = result.recordset[0].ProjectId;
        console.log(`✅ Added: "${project.name}" (ID: ${projectId}, Stage: ${project.stage})`);
        added++;
      } catch (error: any) {
        if (error.number === 2627) {
          // Unique constraint violation - project already exists
          console.log(`⏭️  Skipped: "${project.name}" (already exists)`);
          skipped++;
        } else {
          console.error(`❌ Error adding "${project.name}":`, error.message);
          errors++;
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Added: ${added} projects`);
    console.log(`⏭️  Skipped: ${skipped} projects`);
    console.log(`❌ Errors: ${errors} projects`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  addMissingProjects();
}
