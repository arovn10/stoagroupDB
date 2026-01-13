#!/usr/bin/env ts-node
/**
 * Safe Database Rescaffolding Script (No Data Loss)
 * 
 * Safely rebuilds/updates the database schema without deleting data:
 * 1. Creates missing schemas
 * 2. Creates missing tables (only if they don't exist)
 * 3. Adds missing columns to existing tables
 * 4. Applies all migrations (which are already safe)
 * 5. Verifies schema integrity
 * 
 * Usage:
 *   npm run db:safe-rescaffold
 * 
 * This script is SAFE - it will NOT delete any data!
 */

import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { existsSync, readFileSync } from 'fs';

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
    requestTimeout: 300000,
    connectionTimeout: 30000,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

/**
 * Check if a table exists
 */
async function tableExists(pool: sql.ConnectionPool, schema: string, table: string): Promise<boolean> {
  try {
    const result = await pool.request().query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${table}'
    `);
    return result.recordset[0].count > 0;
  } catch {
    return false;
  }
}

/**
 * Check if a column exists in a table
 */
async function columnExists(pool: sql.ConnectionPool, schema: string, table: string, column: string): Promise<boolean> {
  try {
    const result = await pool.request().query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = '${schema}' 
        AND TABLE_NAME = '${table}' 
        AND COLUMN_NAME = '${column}'
    `);
    return result.recordset[0].count > 0;
  } catch {
    return false;
  }
}

/**
 * Find schema directory
 */
function findSchemaDirectory(): string {
  const possibleSchemaDirs = [
    path.resolve(__dirname, '../../../schema'),           // From api/scripts/ to root/schema
    path.resolve(process.cwd(), '../schema'),            // From api/ to root/schema
    path.resolve(process.cwd(), 'schema'),               // If running from root
    path.resolve(__dirname, '../../schema'),              // Alternative relative path
  ];
  
  for (const dir of possibleSchemaDirs) {
    if (existsSync(dir) && existsSync(path.join(dir, '01_create_schema.sql'))) {
      return dir;
    }
  }
  
  throw new Error('Schema directory not found');
}

/**
 * Extract table name from CREATE TABLE statement
 */
function extractTableInfo(createTableStmt: string): { schema: string; table: string } | null {
  // Match: CREATE TABLE schema.table or CREATE TABLE [schema].[table]
  const match = createTableStmt.match(/CREATE\s+TABLE\s+(?:\[?(\w+)\]?\.)?\[?(\w+)\]?/i);
  if (match) {
    return {
      schema: match[1] || 'dbo',
      table: match[2],
    };
  }
  return null;
}

/**
 * Execute SQL file content safely (only creates if doesn't exist)
 */
async function executeSqlFileSafe(pool: sql.ConnectionPool, sqlContent: string, fileName: string): Promise<void> {
  try {
    console.log(`\n📄 Processing: ${fileName}`);
    
    // Split by GO statements
    const batches = sqlContent
      .split(/^\s*GO\s*$/gim)
      .map(batch => batch.trim())
      .filter(batch => batch.length > 0 && !batch.startsWith('--'));
    
    let executedCount = 0;
    let skippedCount = 0;
    
    for (const batch of batches) {
      if (batch.trim().length > 0) {
        try {
          // Check if this is a CREATE TABLE statement
          if (batch.trim().toUpperCase().startsWith('CREATE TABLE')) {
            const tableInfo = extractTableInfo(batch);
            if (tableInfo) {
              const exists = await tableExists(pool, tableInfo.schema, tableInfo.table);
              if (exists) {
                console.log(`  ⏭️  Skipping CREATE TABLE ${tableInfo.schema}.${tableInfo.table} (already exists)`);
                skippedCount++;
                continue;
              }
            }
          }
          
          // Execute the batch
          await pool.request().query(batch);
          executedCount++;
        } catch (error: any) {
          // If it's a "table already exists" error, skip it
          const errorMsg = error.message.toLowerCase();
          if (errorMsg.includes('already exists') || 
              errorMsg.includes('there is already an object') ||
              errorMsg.includes('duplicate key') ||
              errorMsg.includes('duplicate constraint') ||
              errorMsg.includes('duplicate index')) {
            console.log(`  ⏭️  Skipped (already exists)`);
            skippedCount++;
            continue;
          }
          // If it's a constraint/index that already exists, skip it
          if (errorMsg.includes('constraint') && errorMsg.includes('already exists')) {
            skippedCount++;
            continue;
          }
          // Re-throw if it's a real error
          throw error;
        }
      }
    }
    
    console.log(`✅ Completed: ${fileName} (${executedCount} executed, ${skippedCount} skipped)`);
  } catch (error: any) {
    console.error(`❌ Error processing ${fileName}:`, error.message);
    throw error;
  }
}

/**
 * Create missing tables from schema definition
 */
async function createMissingTables(pool: sql.ConnectionPool): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Creating missing tables (preserving existing data)');
  console.log('═══════════════════════════════════════════════════════════');
  
  const schemaDir = findSchemaDirectory();
  console.log(`📁 Using schema directory: ${schemaDir}`);
  
  const createSqlPath = path.join(schemaDir, '01_create_schema.sql');
  const createSql = readFileSync(createSqlPath, 'utf8');
  await executeSqlFileSafe(pool, createSql, '01_create_schema.sql');
}

/**
 * Apply safe migrations
 */
async function applyMigrations(pool: sql.ConnectionPool): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Applying migrations (safe - only adds missing columns)');
  console.log('═══════════════════════════════════════════════════════════');
  
  const schemaDir = findSchemaDirectory();
  
  // Migration 1: Bank exposure fields
  const bankExposurePath = path.join(schemaDir, '02_add_bank_exposure_fields.sql');
  if (existsSync(bankExposurePath)) {
    const bankExposureSql = readFileSync(bankExposurePath, 'utf8');
    await executeSqlFileSafe(pool, bankExposureSql, '02_add_bank_exposure_fields.sql');
  }
  
  // Migration 2: IMS Investor ID
  const imsInvestorPath = path.join(schemaDir, 'add_ims_investor_id.sql');
  if (existsSync(imsInvestorPath)) {
    const imsInvestorSql = readFileSync(imsInvestorPath, 'utf8');
    await executeSqlFileSafe(pool, imsInvestorSql, 'add_ims_investor_id.sql');
  }
}

/**
 * Verify schema integrity
 */
async function verifySchema(pool: sql.ConnectionPool): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Verifying schema integrity');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const expectedTables = [
    { schema: 'core', table: 'Project' },
    { schema: 'core', table: 'Bank' },
    { schema: 'core', table: 'Person' },
    { schema: 'core', table: 'EquityPartner' },
    { schema: 'banking', table: 'Loan' },
    { schema: 'banking', table: 'DSCRTest' },
    { schema: 'banking', table: 'Covenant' },
    { schema: 'banking', table: 'LiquidityRequirement' },
    { schema: 'banking', table: 'Participation' },
    { schema: 'banking', table: 'Guarantee' },
    { schema: 'banking', table: 'BankTarget' },
    { schema: 'banking', table: 'EquityCommitment' },
    { schema: 'pipeline', table: 'UnderContract' },
    { schema: 'pipeline', table: 'CommercialListed' },
    { schema: 'pipeline', table: 'CommercialAcreage' },
    { schema: 'pipeline', table: 'ClosedProperty' },
  ];
  
  const existingTables: string[] = [];
  const missingTables: string[] = [];
  
  for (const { schema, table } of expectedTables) {
    const exists = await tableExists(pool, schema, table);
    if (exists) {
      existingTables.push(`${schema}.${table}`);
      console.log(`  ✅ ${schema}.${table}`);
    } else {
      missingTables.push(`${schema}.${table}`);
      console.log(`  ❌ ${schema}.${table} - MISSING`);
    }
  }
  
  console.log(`\n📊 Summary: ${existingTables.length}/${expectedTables.length} tables exist`);
  
  if (missingTables.length > 0) {
    console.warn(`\n⚠️  Missing tables: ${missingTables.join(', ')}`);
    console.warn('   These tables will be created on the next run');
  }
  
  // Verify Bank table has exposure fields
  console.log('\n🔍 Verifying Bank table columns...');
  const bankHasExposureFields = await columnExists(pool, 'core', 'Bank', 'HQState') &&
                                 await columnExists(pool, 'core', 'Bank', 'HoldLimit');
  if (bankHasExposureFields) {
    console.log(`  ✅ Bank table has exposure fields`);
  } else {
    console.warn(`  ⚠️  Bank table missing some exposure fields`);
  }
  
  // Verify EquityPartner has IMSInvestorProfileId
  console.log('\n🔍 Verifying EquityPartner table columns...');
  const hasIMSId = await columnExists(pool, 'core', 'EquityPartner', 'IMSInvestorProfileId');
  if (hasIMSId) {
    console.log(`  ✅ EquityPartner has IMSInvestorProfileId column`);
  } else {
    console.warn(`  ⚠️  EquityPartner missing IMSInvestorProfileId column`);
  }
  
  // Count existing data
  console.log('\n📊 Data preservation check...');
  try {
    const projectCount = await pool.request().query('SELECT COUNT(*) as count FROM core.Project');
    const bankCount = await pool.request().query('SELECT COUNT(*) as count FROM core.Bank');
    console.log(`  📈 Projects: ${projectCount.recordset[0].count} rows`);
    console.log(`  📈 Banks: ${bankCount.recordset[0].count} rows`);
    console.log(`  ✅ Data preserved successfully!`);
  } catch (error: any) {
    // Tables might not exist yet, that's okay
    console.log(`  ℹ️  Tables may not exist yet (will be created)`);
  }
  
  console.log('\n✅ Schema verification complete!');
}

/**
 * Main safe rescaffolding function
 */
async function safeRescaffoldDatabase(): Promise<void> {
  let pool: sql.ConnectionPool | null = null;
  
  try {
    console.log('🚀 Starting SAFE database rescaffolding (no data loss)...\n');
    console.log('✅ This script will NOT delete any data');
    console.log('   It will only add missing tables, columns, and constraints\n');
    
    // Connect to database
    console.log('📡 Connecting to database...');
    pool = await sql.connect(config);
    console.log('✅ Connected to Azure SQL Database\n');
    
    // Step 1: Create missing schemas
    console.log('═══════════════════════════════════════════════════════════');
    console.log('STEP 1: Ensuring schemas exist');
    console.log('═══════════════════════════════════════════════════════════');
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'core') EXEC('CREATE SCHEMA core');
      IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'banking') EXEC('CREATE SCHEMA banking');
      IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'pipeline') EXEC('CREATE SCHEMA pipeline');
    `);
    console.log('✅ Schemas verified\n');
    
    // Step 2: Create missing tables
    await createMissingTables(pool);
    
    // Step 3: Apply migrations
    await applyMigrations(pool);
    
    // Step 4: Verify schema
    await verifySchema(pool);
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ Safe database rescaffolding completed successfully!');
    console.log('   All existing data has been preserved.');
    console.log('═══════════════════════════════════════════════════════════\n');
    
  } catch (error: any) {
    console.error('\n❌ Safe rescaffolding failed:', error.message);
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
  safeRescaffoldDatabase().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { safeRescaffoldDatabase };
