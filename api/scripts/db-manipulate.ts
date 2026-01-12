#!/usr/bin/env ts-node
/**
 * Database Manipulation Script
 * 
 * Connect directly to Azure SQL Database and run queries/manipulate data
 * 
 * Usage:
 *   npm run db:query "SELECT * FROM core.Project"
 *   npm run db:exec "UPDATE core.Project SET Units = 100 WHERE ProjectId = 1"
 */

import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';

// Load environment variables - try multiple locations
// 1. api/.env (when running from api/ directory)
// 2. ../.env (root directory when running from api/)
// 3. Default dotenv behavior

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

// Fallback to default dotenv behavior
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
  console.error(`\n   Current working directory: ${process.cwd()}`);
  console.error(`   Checked paths: ${possibleEnvPaths.join(', ')}`);
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
    requestTimeout: 300000, // 5 minutes for long-running imports
    connectionTimeout: 30000, // 30 seconds to connect
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

/**
 * Execute a SELECT query and return results
 */
export async function query(sqlQuery: string): Promise<any[]> {
  try {
    const pool = await sql.connect(config);
    console.log('✅ Connected to Azure SQL Database');
    
    const result = await pool.request().query(sqlQuery);
    await pool.close();
    
    return result.recordset;
  } catch (error: any) {
    console.error('❌ Database error:', error.message);
    throw error;
  }
}

/**
 * Execute an INSERT, UPDATE, DELETE, or other DML/DDL statement
 */
export async function execute(sqlQuery: string): Promise<{ rowsAffected: number; message?: string }> {
  try {
    const pool = await sql.connect(config);
    console.log('✅ Connected to Azure SQL Database');
    
    const result = await pool.request().query(sqlQuery);
    await pool.close();
    
    return {
      rowsAffected: result.rowsAffected[0] || 0,
      message: 'Query executed successfully',
    };
  } catch (error: any) {
    console.error('❌ Database error:', error.message);
    throw error;
  }
}

/**
 * Execute a stored procedure
 */
export async function executeProcedure(
  procedureName: string,
  params?: Record<string, any>
): Promise<any> {
  try {
    const pool = await sql.connect(config);
    console.log('✅ Connected to Azure SQL Database');
    
    const request = pool.request();
    
    if (params) {
      Object.keys(params).forEach((key) => {
        request.input(key, params[key]);
      });
    }
    
    const result = await request.execute(procedureName);
    await pool.close();
    
    return result.recordset;
  } catch (error: any) {
    console.error('❌ Database error:', error.message);
    throw error;
  }
}

/**
 * Get connection pool (for advanced usage)
 */
export async function getPool(): Promise<sql.ConnectionPool> {
  return await sql.connect(config);
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const sqlQuery = args.slice(1).join(' ');

  if (!command || !sqlQuery) {
    console.log(`
Usage:
  npm run db:query "SELECT * FROM core.Project"
  npm run db:exec "UPDATE core.Project SET Units = 100 WHERE ProjectId = 1"
  npm run db:sp "sp_GetProjects" '{"param1": "value1"}'

Or use as a module:
  import { query, execute } from './scripts/db-manipulate';
    `);
    process.exit(1);
  }

  (async () => {
    try {
      if (command === 'query') {
        const results = await query(sqlQuery);
        console.log('\n📊 Results:');
        console.log(JSON.stringify(results, null, 2));
        console.log(`\n✅ Returned ${results.length} row(s)`);
      } else if (command === 'exec') {
        const result = await execute(sqlQuery);
        console.log(`\n✅ ${result.message}`);
        console.log(`📊 Rows affected: ${result.rowsAffected}`);
      } else if (command === 'sp') {
        const params = args[2] ? JSON.parse(args[2]) : {};
        const results = await executeProcedure(sqlQuery, params);
        console.log('\n📊 Results:');
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.error('❌ Unknown command. Use "query", "exec", or "sp"');
        process.exit(1);
      }
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  })();
}
