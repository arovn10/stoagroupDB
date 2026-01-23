/**
 * Script to add IsCompleted column to all banking covenant tables
 * This script runs the SQL migration to add IsCompleted boolean columns
 */

import * as fs from 'fs';
import * as path from 'path';
import sql from 'mssql';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const config: sql.config = {
  server: process.env.DB_SERVER || '',
  database: process.env.DB_NAME || '',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    enableArithAbort: true,
  },
};

async function addIsCompletedToCovenants() {
  let pool: sql.ConnectionPool | null = null;

  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Read the SQL file
    const sqlFilePath = path.join(__dirname, '../../schema/add_is_completed_to_covenants.sql');
    const sqlScript = fs.readFileSync(sqlFilePath, 'utf8');

    console.log('Executing SQL migration...');
    console.log('============================================================');
    
    // Execute the SQL script
    // Split by GO statements and execute each batch
    const batches = sqlScript.split(/\bGO\b/gi).filter(batch => batch.trim().length > 0);
    
    for (const batch of batches) {
      const trimmedBatch = batch.trim();
      if (trimmedBatch) {
        await pool.request().query(trimmedBatch);
      }
    }

    console.log('============================================================');
    console.log('✓ Migration completed successfully!');
    console.log('');
    console.log('IsCompleted columns added to:');
    console.log('  - banking.Covenant');
    console.log('  - banking.DSCRTest');
    console.log('  - banking.LiquidityRequirement');
    console.log('');
    console.log('All existing records default to IsCompleted = 0 (false)');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.number) {
      console.error(`   SQL Error Number: ${error.number}`);
    }
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('\n✓ Database connection closed');
    }
  }
}

// Run the script
addIsCompletedToCovenants();
