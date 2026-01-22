/**
 * Create admin user for Land Development
 * Run: npm run db:create-admin-user
 */

import sql from 'mssql';
import bcrypt from 'bcrypt';
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
  console.error('   Make sure you have a .env file with DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD');
  process.exit(1);
}

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

async function createAdminUser() {
  try {
    console.log('🔐 Creating admin user for Land Development...\n');

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

    const username = 'hspring@stoagroup.com';
    const password = 'LandDevelopment26';
    const email = 'hspring@stoagroup.com';
    const fullName = 'H Spring';

    // Check if user already exists
    const existingUser = await pool.request()
      .input('username', sql.NVarChar, username)
      .query(`
        SELECT UserId, Username
        FROM auth.[User]
        WHERE Username = @username
      `);

    if (existingUser.recordset.length > 0) {
      console.log(`⚠️  User ${username} already exists.`);
      console.log('   Updating password...');
      
      // Hash new password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      
      // Update user
      await pool.request()
        .input('username', sql.NVarChar, username)
        .input('passwordHash', sql.NVarChar, passwordHash)
        .input('email', sql.NVarChar, email)
        .input('fullName', sql.NVarChar, fullName)
        .query(`
          UPDATE auth.[User]
          SET PasswordHash = @passwordHash,
              Email = @email,
              FullName = @fullName,
              IsActive = 1,
              UpdatedAt = SYSDATETIME()
          WHERE Username = @username
        `);
      
      console.log(`✅ Updated user: ${username}`);
    } else {
      // Hash password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Insert user
      const result = await pool.request()
        .input('username', sql.NVarChar, username)
        .input('passwordHash', sql.NVarChar, passwordHash)
        .input('email', sql.NVarChar, email)
        .input('fullName', sql.NVarChar, fullName)
        .query(`
          INSERT INTO auth.[User] (Username, PasswordHash, Email, FullName, IsActive)
          VALUES (@username, @passwordHash, @email, @fullName, 1)
          SELECT SCOPE_IDENTITY() as UserId
        `);

      const userId = result.recordset[0].UserId;
      console.log(`✅ Created admin user: ${username} (ID: ${userId})`);
    }

    console.log('\n✨ Admin user setup completed!');
    console.log(`\n📝 Login credentials:`);
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
    console.log('\n💡 Use these credentials to login via POST /api/auth/login');

    await pool.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser();
