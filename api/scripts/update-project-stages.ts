#!/usr/bin/env ts-node
/**
 * Update Project Stages and Financing Stages
 * 
 * Updates core.Project.Stage and banking.Loan.FinancingStage based on provided lists
 * Does NOT delete any data - only updates existing records
 * 
 * Usage:
 *   npm run update-stages
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

// Project stage mappings
const projectStages: { [key: string]: string } = {
  // Under Construction
  'The Flats at Ransley': 'Under Construction',
  'The Waters at Crosspointe': 'Under Construction',
  'The Heights at Waterpointe': 'Under Construction',
  'The Heights at Materra': 'Under Construction',
  'The Heights at Inverness': 'Under Construction',
  'The Waters at Conway': 'Under Construction',
  'The Waters at Covington': 'Under Construction',
  
  // Stabilized
  'The Waters at Hammond': 'Stabilized',
  'The Waters at Millerville': 'Stabilized',
  'The Waters at Redstone': 'Stabilized',
  'The Waters at Settlers Trace': 'Stabilized',
  'The Waters at West Village': 'Stabilized',
  'The Waters at Bluebonnet': 'Stabilized',
  
  // Lease-Up
  'The Waters at Crestview': 'Lease-Up',
  'The Waters at MCgowin': 'Lease-Up',
  'The Heights at Picardy': 'Lease-Up',
  'The Waters at Freeport': 'Lease-Up',
  'The Waters at Promenade': 'Lease-Up',
  
  // Sold (Liquidated)
  'Silver Oaks': 'Liquidated',
  'The Heights': 'Liquidated',
  'Sweetwater': 'Liquidated',
  'The Waters at Southpark': 'Liquidated',
  'Dawson Park': 'Liquidated',
  'The Waters at Manhattan': 'Liquidated',
  'The Waters at Ransley': 'Liquidated',
  'The Waters at Heritage': 'Liquidated',
  'The Flats at East Bay': 'Liquidated',
};

// Financing stage: Only "The Waters at Hammond" is on permanent financing
const permanentFinancingProjects = ['The Waters at Hammond'];

async function updateProjectStages(pool: sql.ConnectionPool): Promise<void> {
  console.log('\n📊 Updating Project Stages...');
  
  let updated = 0;
  let notFound = 0;
  
  for (const [projectName, stage] of Object.entries(projectStages)) {
    const result = await pool.request()
      .input('ProjectName', sql.NVarChar, projectName)
      .input('Stage', sql.NVarChar, stage)
      .query(`
        UPDATE core.Project
        SET Stage = @Stage, UpdatedAt = SYSDATETIME()
        WHERE ProjectName = @ProjectName
      `);
    
    if (result.rowsAffected[0] > 0) {
      console.log(`  ✅ ${projectName} → ${stage}`);
      updated++;
    } else {
      console.log(`  ⚠️  ${projectName} → NOT FOUND`);
      notFound++;
    }
  }
  
  console.log(`\n  ✅ Updated ${updated} projects`);
  if (notFound > 0) {
    console.log(`  ⚠️  ${notFound} projects not found (may have different names in database)`);
  }
}

async function updateFinancingStages(pool: sql.ConnectionPool): Promise<void> {
  console.log('\n💰 Updating Financing Stages...');
  
  const allProjects = Object.keys(projectStages);
  const liquidatedProjects = allProjects.filter(p => projectStages[p] === 'Liquidated');
  
  // Update loans for liquidated projects
  if (liquidatedProjects.length > 0) {
    const liquidatedRequest = pool.request();
    liquidatedProjects.forEach((name, i) => {
      liquidatedRequest.input(`P${i}`, sql.NVarChar, name);
    });
    
    const placeholders = liquidatedProjects.map((_, i) => `@P${i}`).join(', ');
    const liquidatedQuery = await liquidatedRequest.query(`
      UPDATE banking.Loan
      SET FinancingStage = 'Liquidated'
      WHERE ProjectId IN (
        SELECT ProjectId FROM core.Project 
        WHERE ProjectName IN (${placeholders})
      )
    `);
    
    console.log(`  ✅ Set ${liquidatedQuery.rowsAffected[0]} loans to "Liquidated" for sold projects`);
  }
  
  // Set "The Waters at Hammond" to Permanent Loan
  const permanentResult = await pool.request()
    .input('ProjectName', sql.NVarChar, 'The Waters at Hammond')
    .query(`
      UPDATE banking.Loan
      SET FinancingStage = 'Permanent Loan'
      WHERE ProjectId IN (
        SELECT ProjectId FROM core.Project WHERE ProjectName = @ProjectName
      )
      AND (FinancingStage IS NULL OR FinancingStage != 'Liquidated')
    `);
  
  console.log(`  ✅ Set ${permanentResult.rowsAffected[0]} loans to "Permanent Loan" for The Waters at Hammond`);
  
  // Set all other non-liquidated projects to "Construction Loan"
  const constructionProjects = allProjects.filter(
    p => projectStages[p] !== 'Liquidated' && p !== 'The Waters at Hammond'
  );
  
  if (constructionProjects.length > 0) {
    const constructionRequest = pool.request();
    constructionProjects.forEach((name, i) => {
      constructionRequest.input(`P${i}`, sql.NVarChar, name);
    });
    
    const placeholders = constructionProjects.map((_, i) => `@P${i}`).join(', ');
    const constructionQuery = await constructionRequest.query(`
      UPDATE banking.Loan
      SET FinancingStage = 'Construction Loan'
      WHERE ProjectId IN (
        SELECT ProjectId FROM core.Project 
        WHERE ProjectName IN (${placeholders})
      )
      AND (FinancingStage IS NULL OR FinancingStage != 'Liquidated')
    `);
    
    console.log(`  ✅ Set ${constructionQuery.rowsAffected[0]} loans to "Construction Loan"`);
  }
  
  // Also update any loans that don't match the projects but should be Construction Loan
  // (for projects not in the list but have construction loans)
  if (liquidatedProjects.length > 0) {
    const escapedNames = liquidatedProjects.map(p => `'${p.replace(/'/g, "''")}'`).join(', ');
    const defaultConstructionResult = await pool.request().query(`
      UPDATE banking.Loan
      SET FinancingStage = 'Construction Loan'
      WHERE FinancingStage IS NULL
        AND LoanPhase IN ('Construction', 'Land', 'MiniPerm')
        AND ProjectId IN (
          SELECT ProjectId FROM core.Project 
          WHERE Stage IN ('Under Construction', 'Lease-Up')
            AND ProjectName NOT IN (${escapedNames})
        )
    `);
    
    console.log(`  ✅ Set ${defaultConstructionResult.rowsAffected[0]} additional loans to "Construction Loan" (default)`);
  }
}

async function verifySchema(pool: sql.ConnectionPool): Promise<boolean> {
  console.log('\n🔍 Verifying Schema...');
  
  // Check if FinancingStage column exists
  const checkResult = await pool.request().query(`
    SELECT COUNT(*) AS ColumnExists
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'banking'
      AND TABLE_NAME = 'Loan'
      AND COLUMN_NAME = 'FinancingStage'
  `);
  
  const columnExists = checkResult.recordset[0].ColumnExists > 0;
  
  if (!columnExists) {
    console.log('  ⚠️  FinancingStage column does not exist - will need to run migration');
    return false;
  }
  
  console.log('  ✅ FinancingStage column exists');
  return true;
}

async function main(): Promise<void> {
  console.log('🚀 Starting Project Stage and Financing Stage Update...\n');
  
  const pool = await getPool();
  
  try {
    // Verify schema
    const schemaOk = await verifySchema(pool);
    
    if (!schemaOk) {
      console.log('\n⚠️  Schema needs to be updated. Please run the migration first:');
      console.log('   Run: schema/03_add_financing_stage.sql');
      process.exit(1);
    }
    
    // Update project stages
    await updateProjectStages(pool);
    
    // Update financing stages
    await updateFinancingStages(pool);
    
    console.log('\n✅ All updates completed successfully!');
  } catch (error) {
    console.error('❌ Error updating stages:', error);
    process.exit(1);
  } finally {
    await pool.close();
    console.log('🔌 Database connection closed');
  }
}

if (require.main === module) {
  main();
}
