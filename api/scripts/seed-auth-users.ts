/**
 * Seed script to create initial Capital Markets users
 * Run: npm run db:seed-auth-users
 */

import sql from 'mssql';
import bcrypt from 'bcrypt';
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
  path.resolve(__dirname, '../../.env'),             // root/.env (from script location)
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
  console.error('\n   Example .env file:');
  console.error('   DB_SERVER=stoagroupdb.database.windows.net');
  console.error('   DB_DATABASE=stoagroupDB');
  console.error('   DB_USER=arovner');
  console.error('   DB_PASSWORD=your_password_here');
  console.error('   DB_ENCRYPT=true');
  console.error('   DB_TRUST_SERVER_CERTIFICATE=false');
  process.exit(1);
}

// Create database connection config
const dbConfig: sql.config = {
  server: process.env.DB_SERVER || '',
  database: process.env.DB_DATABASE || '',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

const users = [
  {
    username: 'arovner@stoagroup.com',
    password: 'CapitalMarkets26',
    email: 'arovner@stoagroup.com',
    fullName: 'Alec Rovner'
  },
  {
    username: 'Mmurray@stoagroup.com',
    password: 'CapitalMarkets26',
    email: 'Mmurray@stoagroup.com',
    fullName: 'M Murray'
  },
  {
    username: 'hspring@stoagroup.com',
    password: 'LandDevelopment26',
    email: 'hspring@stoagroup.com',
    fullName: 'H Spring'
  }
];

async function seedUsers() {
  try {
    console.log('🔐 Seeding Capital Markets users...\n');

    // Connect to database
    const pool = await sql.connect(dbConfig);
    console.log('✅ Connected to database');

    // Check if auth.User table exists
    const tableCheck = await pool.request().query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'auth' AND TABLE_NAME = 'User'
    `);

    if (tableCheck.recordset[0].count === 0) {
      console.error('❌ Error: auth.User table does not exist!');
      console.error('   Please run schema/create_auth_table.sql first.');
      process.exit(1);
    }

    for (const userData of users) {
      // Check if user already exists
      const existingUser = await pool.request()
        .input('username', sql.NVarChar, userData.username)
        .query(`
          SELECT UserId, Username
          FROM auth.[User]
          WHERE Username = @username
        `);

      if (existingUser.recordset.length > 0) {
        console.log(`⚠️  User ${userData.username} already exists, skipping...`);
        continue;
      }

      // Hash password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(userData.password, saltRounds);

      // Insert user
      const result = await pool.request()
        .input('username', sql.NVarChar, userData.username)
        .input('passwordHash', sql.NVarChar, passwordHash)
        .input('email', sql.NVarChar, userData.email)
        .input('fullName', sql.NVarChar, userData.fullName)
        .query(`
          INSERT INTO auth.[User] (Username, PasswordHash, Email, FullName, IsActive)
          VALUES (@username, @passwordHash, @email, @fullName, 1)
          SELECT SCOPE_IDENTITY() as UserId
        `);

      const userId = result.recordset[0].UserId;
      console.log(`✅ Created user: ${userData.username} (ID: ${userId})`);
    }

    console.log('\n✨ User seeding completed successfully!');
    console.log('\n📝 Users created:');
    for (const userData of users) {
      console.log(`   - ${userData.username}`);
    }
    console.log('\n💡 Use these credentials to login via POST /api/auth/login');

    await pool.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    process.exit(1);
  }
}

seedUsers();
