#!/usr/bin/env ts-node
/**
 * Fix Database Schema
 * 
 * Adds missing columns to core.Bank table for exposure data
 * 
 * Usage: npm run db:fix-schema
 */

import * as fs from 'fs';
import * as path from 'path';
import { getPool } from './db-manipulate';
import sql from 'mssql';

async function fixSchema() {
  console.log('🔧 Fixing Database Schema...\n');
  
  const pool = await getPool();
  
  try {
    // Read the migration SQL file
    const sqlPath = path.join(__dirname, '../../schema/02_add_bank_exposure_fields.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
    
    // Execute the SQL
    console.log('📝 Running migration: 02_add_bank_exposure_fields.sql\n');
    const result = await pool.request().query(sqlContent);
    
    console.log('✅ Schema migration completed successfully!\n');
    
    // Verify columns were added
    const checkResult = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'core' 
        AND TABLE_NAME = 'Bank'
        AND COLUMN_NAME IN ('HQState', 'HoldLimit', 'PerDealLimit', 'Deposits')
      ORDER BY COLUMN_NAME
    `);
    
    if (checkResult.recordset.length > 0) {
      console.log('📊 Verified columns in core.Bank:');
      checkResult.recordset.forEach((col: any) => {
        let type = col.DATA_TYPE;
        if (col.CHARACTER_MAXIMUM_LENGTH) {
          type += `(${col.CHARACTER_MAXIMUM_LENGTH})`;
        } else if (col.NUMERIC_PRECISION) {
          type += `(${col.NUMERIC_PRECISION},${col.NUMERIC_SCALE})`;
        }
        console.log(`   ✅ ${col.COLUMN_NAME}: ${type}`);
      });
    } else {
      console.log('⚠️  Warning: Could not verify columns were added');
    }
    
    console.log('\n✅ Schema fix completed!');
    
  } catch (error: any) {
    console.error('❌ Error fixing schema:', error.message);
    
    // If it's a column already exists error, that's okay
    if (error.message.includes('already exists') || error.message.includes('duplicate')) {
      console.log('\n✅ Columns may already exist - this is fine!');
    } else {
      process.exit(1);
    }
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  fixSchema();
}
