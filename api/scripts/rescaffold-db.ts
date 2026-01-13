#!/usr/bin/env ts-node
/**
 * Database Rescaffolding Script
 * 
 * Completely rebuilds the database schema from scratch:
 * 1. Clears all existing tables
 * 2. Recreates base schema
 * 3. Applies all migrations
 * 4. Verifies schema integrity
 * 
 * Usage:
 *   npm run db:rescaffold
 * 
 * WARNING: This will DELETE ALL DATA in the database!
 */

import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { existsSync, readFileSync } from 'fs';

// Load environment variables
const possibleEnvPaths = [
  path.resolve(process.cwd(), '.env'),              // api/.env
  path.resolve(process.cwd(), '../.env'),          // root/.env (when in api/)
  path.resolve(__dirname, '../../.env'),           // root/.env (from script location)
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
  console.error('   Make sure you have a .env file with:');
  console.error('   - DB_SERVER');
  console.error('   - DB_DATABASE');
  console.error('   - DB_USER');
  console.error('   - DB_PASSWORD');
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
    requestTimeout: 300000, // 5 minutes for long-running operations
    connectionTimeout: 30000,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

/**
 * Execute SQL file content
 */
async function executeSqlFile(pool: sql.ConnectionPool, sqlContent: string, fileName: string): Promise<void> {
  try {
    console.log(`\n📄 Executing: ${fileName}`);
    
    // Split by GO statements (SQL Server batch separator)
    const batches = sqlContent
      .split(/^\s*GO\s*$/gim)
      .map(batch => batch.trim())
      .filter(batch => batch.length > 0 && !batch.startsWith('--'));
    
    for (const batch of batches) {
      if (batch.trim().length > 0) {
        await pool.request().query(batch);
      }
    }
    
    console.log(`✅ Completed: ${fileName}`);
  } catch (error: any) {
    console.error(`❌ Error executing ${fileName}:`, error.message);
    throw error;
  }
}

/**
 * Verify schema was created correctly
 */
async function verifySchema(pool: sql.ConnectionPool): Promise<void> {
  console.log('\n🔍 Verifying schema integrity...\n');
  
  const expectedTables = [
    // Core schema
    { schema: 'core', table: 'Project' },
    { schema: 'core', table: 'Bank' },
    { schema: 'core', table: 'Person' },
    { schema: 'core', table: 'EquityPartner' },
    
    // Banking schema
    { schema: 'banking', table: 'Loan' },
    { schema: 'banking', table: 'DSCRTest' },
    { schema: 'banking', table: 'Covenant' },
    { schema: 'banking', table: 'LiquidityRequirement' },
    { schema: 'banking', table: 'Participation' },
    { schema: 'banking', table: 'Guarantee' },
    { schema: 'banking', table: 'BankTarget' },
    { schema: 'banking', table: 'EquityCommitment' },
    
    // Pipeline schema
    { schema: 'pipeline', table: 'UnderContract' },
    { schema: 'pipeline', table: 'CommercialListed' },
    { schema: 'pipeline', table: 'CommercialAcreage' },
    { schema: 'pipeline', table: 'ClosedProperty' },
  ];
  
  const missingTables: string[] = [];
  const existingTables: string[] = [];
  
  for (const { schema, table } of expectedTables) {
    try {
      const result = await pool.request().query(`
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${table}'
      `);
      
      if (result.recordset[0].count > 0) {
        existingTables.push(`${schema}.${table}`);
        console.log(`  ✅ ${schema}.${table}`);
      } else {
        missingTables.push(`${schema}.${table}`);
        console.log(`  ❌ ${schema}.${table} - MISSING`);
      }
    } catch (error: any) {
      console.error(`  ⚠️  Error checking ${schema}.${table}:`, error.message);
      missingTables.push(`${schema}.${table}`);
    }
  }
  
  console.log(`\n📊 Summary: ${existingTables.length}/${expectedTables.length} tables created`);
  
  if (missingTables.length > 0) {
    console.error(`\n❌ Missing tables:`);
    missingTables.forEach(table => console.error(`   - ${table}`));
    throw new Error('Schema verification failed - some tables are missing');
  }
  
  // Verify Bank table has exposure fields
  console.log('\n🔍 Verifying Bank table columns...');
  try {
    const bankColumns = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'core' AND TABLE_NAME = 'Bank'
      ORDER BY COLUMN_NAME
    `);
    
    const columnNames = bankColumns.recordset.map((r: any) => r.COLUMN_NAME);
    const expectedColumns = ['HQState', 'HoldLimit', 'PerDealLimit', 'Deposits'];
    const missingColumns = expectedColumns.filter(col => !columnNames.includes(col));
    
    if (missingColumns.length > 0) {
      console.error(`  ⚠️  Missing Bank columns: ${missingColumns.join(', ')}`);
    } else {
      console.log(`  ✅ Bank table has all exposure fields`);
    }
  } catch (error: any) {
    console.error(`  ⚠️  Error checking Bank columns:`, error.message);
  }
  
  // Verify EquityPartner has IMSInvestorProfileId
  console.log('\n🔍 Verifying EquityPartner table columns...');
  try {
    const equityColumns = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'core' AND TABLE_NAME = 'EquityPartner'
      AND COLUMN_NAME = 'IMSInvestorProfileId'
    `);
    
    if (equityColumns.recordset.length > 0) {
      console.log(`  ✅ EquityPartner has IMSInvestorProfileId column`);
    } else {
      console.error(`  ⚠️  EquityPartner missing IMSInvestorProfileId column`);
    }
  } catch (error: any) {
    console.error(`  ⚠️  Error checking EquityPartner columns:`, error.message);
  }
  
  console.log('\n✅ Schema verification complete!');
}

/**
 * Main rescaffolding function
 */
async function rescaffoldDatabase(): Promise<void> {
  let pool: sql.ConnectionPool | null = null;
  
  try {
    console.log('🚀 Starting database rescaffolding...\n');
    console.log('⚠️  WARNING: This will DELETE ALL DATA in the database!');
    console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
    
    // Wait 5 seconds for user to cancel
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Connect to database
    console.log('📡 Connecting to database...');
    pool = await sql.connect(config);
    console.log('✅ Connected to Azure SQL Database\n');
    
    // Get schema directory path (try multiple possible locations)
    const possibleSchemaDirs = [
      path.resolve(__dirname, '../../../schema'),           // From api/scripts/ to root/schema
      path.resolve(process.cwd(), '../schema'),            // From api/ to root/schema
      path.resolve(process.cwd(), 'schema'),                // If running from root
      path.resolve(__dirname, '../../schema'),              // Alternative relative path
    ];
    
    let schemaDir: string | null = null;
    for (const dir of possibleSchemaDirs) {
      if (existsSync(dir) && existsSync(path.join(dir, 'clear_all_tables.sql'))) {
        schemaDir = dir;
        console.log(`📁 Using schema directory: ${schemaDir}`);
        break;
      }
    }
    
    if (!schemaDir) {
      console.error('❌ Could not find schema directory!');
      console.error('   Checked paths:');
      possibleSchemaDirs.forEach(dir => console.error(`   - ${dir}`));
      throw new Error('Schema directory not found');
    }
    
    // Step 1: Clear all tables
    console.log('═══════════════════════════════════════════════════════════');
    console.log('STEP 1: Clearing all existing tables');
    console.log('═══════════════════════════════════════════════════════════');
    const clearSqlPath = path.join(schemaDir, 'clear_all_tables.sql');
    if (existsSync(clearSqlPath)) {
      const clearSql = readFileSync(clearSqlPath, 'utf8');
      await executeSqlFile(pool, clearSql, 'clear_all_tables.sql');
    } else {
      console.error('❌ clear_all_tables.sql not found!');
      throw new Error('Required SQL file not found');
    }
    
    // Step 2: Create base schema
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('STEP 2: Creating base schema');
    console.log('═══════════════════════════════════════════════════════════');
    const createSqlPath = path.join(schemaDir, '01_create_schema.sql');
    if (existsSync(createSqlPath)) {
      const createSql = readFileSync(createSqlPath, 'utf8');
      await executeSqlFile(pool, createSql, '01_create_schema.sql');
    } else {
      console.error('❌ 01_create_schema.sql not found!');
      throw new Error('Required SQL file not found');
    }
    
    // Step 3: Apply migrations
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('STEP 3: Applying migrations');
    console.log('═══════════════════════════════════════════════════════════');
    
    // Migration 1: Bank exposure fields
    const bankExposurePath = path.join(schemaDir, '02_add_bank_exposure_fields.sql');
    if (existsSync(bankExposurePath)) {
      const bankExposureSql = readFileSync(bankExposurePath, 'utf8');
      await executeSqlFile(pool, bankExposureSql, '02_add_bank_exposure_fields.sql');
    } else {
      console.warn('⚠️  02_add_bank_exposure_fields.sql not found - skipping');
    }
    
    // Migration 2: IMS Investor ID
    const imsInvestorPath = path.join(schemaDir, 'add_ims_investor_id.sql');
    if (existsSync(imsInvestorPath)) {
      const imsInvestorSql = readFileSync(imsInvestorPath, 'utf8');
      await executeSqlFile(pool, imsInvestorSql, 'add_ims_investor_id.sql');
    } else {
      console.warn('⚠️  add_ims_investor_id.sql not found - skipping');
    }
    
    // Step 4: Verify schema
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('STEP 4: Verifying schema integrity');
    console.log('═══════════════════════════════════════════════════════════');
    await verifySchema(pool);
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ Database rescaffolding completed successfully!');
    console.log('═══════════════════════════════════════════════════════════\n');
    
  } catch (error: any) {
    console.error('\n❌ Rescaffolding failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run if executed directly
if (require.main === module) {
  rescaffoldDatabase().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { rescaffoldDatabase };
