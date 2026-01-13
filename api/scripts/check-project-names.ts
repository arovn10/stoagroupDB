#!/usr/bin/env ts-node
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';

const possibleEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../../.env'),
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) dotenv.config();

const config: sql.config = {
  server: process.env.DB_SERVER!,
  database: process.env.DB_DATABASE!,
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
  },
};

(async () => {
  const pool = await sql.connect(config);
  const result = await pool.request().query(`
    SELECT ProjectName FROM core.Project 
    WHERE ProjectName LIKE '%Crosspointe%' 
       OR ProjectName LIKE '%Blue Bonnet%' 
       OR ProjectName LIKE '%BlueBonnet%'
       OR ProjectName LIKE '%Cross Pointe%'
    ORDER BY ProjectName
  `);
  console.log('\nFound projects matching Crosspointe or Blue Bonnet:');
  if (result.recordset.length === 0) {
    console.log('  (none found)');
  } else {
    result.recordset.forEach((p: any) => console.log(`  - "${p.ProjectName}"`));
  }
  
  // Also show all projects to help find them
  const allResult = await pool.request().query(`
    SELECT ProjectName FROM core.Project 
    ORDER BY ProjectName
  `);
  console.log('\nAll projects in database:');
  allResult.recordset.forEach((p: any) => console.log(`  - "${p.ProjectName}"`));
  
  await pool.close();
})();
