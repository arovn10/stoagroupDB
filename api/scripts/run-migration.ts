#!/usr/bin/env ts-node
/**
 * Run SQL Migration Script
 * 
 * Executes a SQL migration file against the database
 * 
 * Usage:
 *   npm run db:run-migration schema/add_financing_type_to_participation.sql
 *   OR
 *   npx ts-node scripts/run-migration.ts schema/add_financing_type_to_participation.sql
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

// Validate required environment variables
if (!process.env.DB_SERVER || !process.env.DB_DATABASE || !process.env.DB_USER || !process.env.DB_PASSWORD) {
  console.error('❌ Missing required environment variables!');
  console.error('Required:');
  console.error('   - DB_SERVER');
  console.error('   - DB_DATABASE');
  console.error('   - DB_USER');
  console.error('   - DB_PASSWORD');
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

async function runMigrationFile(filePath: string): Promise<void> {
  console.log(`🚀 Running migration: ${filePath}\n`);
  
  // Resolve file path (try multiple locations)
  const possiblePaths = [
    path.resolve(process.cwd(), filePath),
    path.resolve(process.cwd(), '../', filePath),
    path.resolve(__dirname, '../../', filePath),
    path.resolve(__dirname, '../../../', filePath),
  ];
  
  let sqlFilePath: string | null = null;
  for (const possiblePath of possiblePaths) {
    if (existsSync(possiblePath)) {
      sqlFilePath = possiblePath;
      break;
    }
  }
  
  if (!sqlFilePath) {
    console.error(`❌ Migration file not found: ${filePath}`);
    console.error('Tried paths:');
    possiblePaths.forEach(p => console.error(`   - ${p}`));
    process.exit(1);
  }
  
  console.log(`📄 Reading migration file: ${sqlFilePath}`);
  const sqlContent = readFileSync(sqlFilePath, 'utf-8');
  
  const pool = await getPool();
  
  try {
    // Split SQL by GO statements (SQL Server batch separator)
    // GO can be on its own line or with other text, so we need to handle both cases
    const batches = sqlContent
      .split(/^\s*GO\s*$/gim) // Match GO on its own line (with optional whitespace)
      .map(batch => batch.trim())
      .filter(batch => {
        // Remove empty batches and batches that are only comments
        const withoutComments = batch.replace(/--.*$/gm, '').trim();
        return withoutComments.length > 0;
      });
    
    console.log(`📦 Found ${batches.length} batch(es) to execute\n`);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (batch.trim().length === 0) continue;
      
      console.log(`🔄 Executing batch ${i + 1}/${batches.length}...`);
      
      try {
        const result = await pool.request().query(batch);
        // Note: PRINT statements from SQL won't show up here, but errors will
        console.log(`   ✅ Batch ${i + 1} completed`);
      } catch (error: any) {
        console.error(`   ❌ Error in batch ${i + 1}:`, error.message);
        // Show a snippet of the failing batch
        const batchPreview = batch.substring(0, 200).replace(/\n/g, ' ');
        console.error(`   Batch content: ${batchPreview}...`);
        throw error;
      }
    }
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.close();
    console.log('\n🔌 Database connection closed');
  }
}

async function main(): Promise<void> {
  const migrationFile = process.argv[2];
  
  if (!migrationFile) {
    console.error('❌ Please provide a migration file path');
    console.error('');
    console.error('Usage:');
    console.error('  npm run db:run-migration schema/add_financing_type_to_participation.sql');
    console.error('  OR');
    console.error('  npx ts-node scripts/run-migration.ts schema/add_financing_type_to_participation.sql');
    process.exit(1);
  }
  
  await runMigrationFile(migrationFile);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}
