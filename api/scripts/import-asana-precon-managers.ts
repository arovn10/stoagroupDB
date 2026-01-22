#!/usr/bin/env ts-node
/**
 * Import PreConManager Data from Asana
 * 
 * Fetches Pre-Con Manager information from Asana tasks and syncs to core.PreConManager table.
 * Extracts PreConManager names from custom fields and creates/updates records in the database.
 * 
 * Usage: npm run db:import-asana-precon-managers
 * 
 * Requires ASANA_ACCESS_TOKEN in .env file (or ASANA_PAT)
 * Requires ASANA_PROJECT_GID in .env file (Deal Pipeline project GID)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { getPool } from './db-manipulate';
import sql from 'mssql';

// Load environment variables - try multiple locations
const possibleEnvPaths = [
  path.resolve(__dirname, '../../../deal pipeline-FOR REFERENCE DO NOT EDIT/.env'),  // Deal pipeline .env
  path.resolve(__dirname, '../../.env'),  // Root .env
  path.resolve(process.cwd(), '.env'),  // Current directory .env
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  try {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      // Check if we have any Asana credentials
      if (process.env.ASANA_ACCESS_TOKEN || process.env.ASANA_PAT || process.env.CLIENT_ID) {
        envLoaded = true;
        console.log(`✅ Loaded .env from: ${envPath}`);
        break;
      }
    }
  } catch (e) {
    // Continue to next path
  }
}

// Load from default location if not found
if (!envLoaded) {
  const result = dotenv.config();
  if (!result.error) {
    envLoaded = true;
    console.log(`✅ Loaded .env from default location`);
  }
}

// After loading, log all Asana-related env vars (for debugging)
console.log('📋 Environment variables check:');
console.log(`   ASANA_ACCESS_TOKEN: ${process.env.ASANA_ACCESS_TOKEN ? `✅ (${process.env.ASANA_ACCESS_TOKEN.substring(0, 10)}...)` : '❌ Not set'}`);
console.log(`   ASANA_PAT: ${process.env.ASANA_PAT ? `✅ (${process.env.ASANA_PAT.substring(0, 10)}...)` : '❌ Not set'}`);
console.log(`   CLIENT_ID: ${process.env.CLIENT_ID ? `✅ (${process.env.CLIENT_ID.substring(0, 10)}...)` : '❌ Not set'}`);
console.log(`   CLIENT_SECRET: ${process.env.CLIENT_SECRET ? '✅ (hidden)' : '❌ Not set'}`);
console.log(`   REFRESH_TOKEN: ${process.env.REFRESH_TOKEN ? '✅ (hidden)' : '❌ Not set'}`);
console.log(`   ASANA_API_BASE: ${process.env.ASANA_API_BASE || 'not set (using default)'}`);
console.log('');

// Get Asana configuration
const ASANA_API_BASE = process.env.ASANA_API_BASE?.replace(/['"]/g, '').trim() || 'https://app.asana.com/api/1.0';
const ASANA_ACCESS_TOKEN = process.env.ASANA_ACCESS_TOKEN || process.env.ASANA_PAT;
const ASANA_CLIENT_ID = process.env.CLIENT_ID?.replace(/['"]/g, '').trim();
const ASANA_CLIENT_SECRET = process.env.CLIENT_SECRET?.replace(/['"]/g, '').trim();
const ASANA_REFRESH_TOKEN = process.env.REFRESH_TOKEN?.replace(/['"]/g, '').trim();
const ASANA_PROJECT_GID = process.env.ASANA_PROJECT_GID || '1207455912614114'; // Default Deal Pipeline project

// Debug: Log what we found (without exposing secrets)
console.log('🔍 Environment check:');
console.log(`   ASANA_ACCESS_TOKEN: ${ASANA_ACCESS_TOKEN ? '✅ Set' : '❌ Not set'}`);
console.log(`   CLIENT_ID: ${ASANA_CLIENT_ID ? '✅ Set' : '❌ Not set'}`);
console.log(`   CLIENT_SECRET: ${ASANA_CLIENT_SECRET ? '✅ Set' : '❌ Not set'}`);
console.log(`   ASANA_API_BASE: ${ASANA_API_BASE}`);
console.log('');

if (!ASANA_ACCESS_TOKEN && (!ASANA_CLIENT_ID || !ASANA_CLIENT_SECRET)) {
  console.error('❌ Error: Asana authentication not found!');
  console.error('');
  console.error('   Option 1: Use Personal Access Token (PAT) - Recommended for import scripts');
  console.error('      Add to .env: ASANA_ACCESS_TOKEN=your_token_here');
  console.error('      Get token from: https://app.asana.com/0/my-apps');
  console.error('');
  console.error('   Option 2: Use OAuth (requires additional setup)');
  console.error('      You have CLIENT_ID and CLIENT_SECRET set, but OAuth requires:');
  console.error('      1. Authorization flow to get access token');
  console.error('      2. Token refresh handling');
  console.error('      For import scripts, PAT is much simpler.');
  console.error('');
  process.exit(1);
}

// Note: OAuth will be attempted if CLIENT_ID and CLIENT_SECRET are provided

console.log(`📡 Asana API Configuration:`);
console.log(`   API Base: ${ASANA_API_BASE}`);
console.log(`   Project GID: ${ASANA_PROJECT_GID}`);
if (ASANA_ACCESS_TOKEN) {
  console.log(`   ✅ Using Personal Access Token`);
} else if (ASANA_CLIENT_ID && ASANA_CLIENT_SECRET && ASANA_REFRESH_TOKEN) {
  console.log(`   ✅ Using OAuth (CLIENT_ID/CLIENT_SECRET + REFRESH_TOKEN)`);
  console.log(`   Will refresh access token...`);
} else if (ASANA_CLIENT_ID && ASANA_CLIENT_SECRET) {
  console.log(`   ⚠️  OAuth credentials found but REFRESH_TOKEN missing`);
  console.log(`   Will attempt to use OAuth (may require user interaction)...`);
}
console.log('');

interface AsanaTask {
  gid: string;
  name: string;
  notes?: string;
  custom_fields?: AsanaCustomField[];
}

interface AsanaCustomField {
  gid: string;
  name: string;
  type: string;
  text_value?: string;
  number_value?: number;
  date_value?: { date: string };
  enum_value?: { name: string; gid: string };
  multi_enum_values?: Array<{ name: string; gid: string }>;
  people_value?: { name: string; gid: string; email?: string };
}

interface PreConManagerData {
  FullName: string;
  Email?: string;
  Phone?: string;
}

// Helper function to get Asana access token (if using OAuth)
async function getAsanaAccessToken(): Promise<string | null> {
  // If we have a PAT, use it
  if (ASANA_ACCESS_TOKEN) {
    return ASANA_ACCESS_TOKEN;
  }
  
  // If we have CLIENT_ID, CLIENT_SECRET, and REFRESH_TOKEN, use refresh token flow
  if (ASANA_CLIENT_ID && ASANA_CLIENT_SECRET && ASANA_REFRESH_TOKEN) {
    try {
      console.log('🔐 Refreshing OAuth access token...');
      const tokenUrl = `${ASANA_API_BASE.replace('/api/1.0', '')}/api/1.0/oauth_token`;
      
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: ASANA_CLIENT_ID,
          client_secret: ASANA_CLIENT_SECRET,
          refresh_token: ASANA_REFRESH_TOKEN,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`Token refresh failed: ${error.errors?.[0]?.message || error.message || response.statusText}`);
      }

      const tokenData = await response.json();
      if (tokenData.access_token) {
        console.log('✅ OAuth access token refreshed');
        return tokenData.access_token;
      } else {
        throw new Error('No access_token in refresh response');
      }
    } catch (error: any) {
      console.error(`❌ Failed to refresh OAuth token: ${error.message}`);
      console.error('   Make sure REFRESH_TOKEN is valid and not expired.');
      throw error;
    }
  }
  
  // If we have CLIENT_ID and CLIENT_SECRET but no refresh token, try Basic Auth
  // Some Asana integrations may support CLIENT_ID:CLIENT_SECRET as Basic Auth
  if (ASANA_CLIENT_ID && ASANA_CLIENT_SECRET) {
    try {
      console.log('🔐 Attempting Basic Auth with CLIENT_ID:CLIENT_SECRET...');
      
      // Try using Basic Auth (CLIENT_ID:CLIENT_SECRET as username:password)
      const basicAuth = Buffer.from(`${ASANA_CLIENT_ID}:${ASANA_CLIENT_SECRET}`).toString('base64');
      
      // Test with a simple API call to see if this works
      const testUrl = `${ASANA_API_BASE}/users/me`;
      const testResponse = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
      });

      if (testResponse.ok) {
        console.log('✅ Basic Auth successful!');
        // Return the Basic Auth string to use in requests
        return basicAuth;
      } else {
        // If Basic Auth doesn't work, try Bearer with CLIENT_ID:CLIENT_SECRET
        console.log('   Basic Auth failed, trying alternative method...');
        throw new Error('Basic Auth not supported');
      }
    } catch (error: any) {
      // If Basic Auth doesn't work, provide helpful error
      console.error('❌ OAuth credentials found but cannot authenticate automatically.');
      console.error('   Asana requires one of the following:');
      console.error('   1. ASANA_ACCESS_TOKEN (Personal Access Token) - Recommended');
      console.error('      Get from: https://app.asana.com/0/my-apps');
      console.error('   2. REFRESH_TOKEN (from completed OAuth flow)');
      console.error('      Complete OAuth authorization once, then add REFRESH_TOKEN to .env');
      throw new Error('Cannot authenticate with CLIENT_ID/CLIENT_SECRET alone. Use ASANA_ACCESS_TOKEN (PAT) or add REFRESH_TOKEN.');
    }
  }
  
  return null;
}

// Helper function to make Asana API requests
async function asanaRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  const accessToken = await getAsanaAccessToken();
  
  if (!accessToken) {
    throw new Error('No Asana access token available. Please set ASANA_ACCESS_TOKEN in .env file.');
  }
  
  const url = `${ASANA_API_BASE}${endpoint}`;
  
  // Determine auth header format (Bearer for tokens, Basic for CLIENT_ID:CLIENT_SECRET)
  let authHeader: string;
  if (accessToken && accessToken.includes(':')) {
    // If it looks like CLIENT_ID:CLIENT_SECRET (from Basic Auth attempt), use Basic
    authHeader = `Basic ${accessToken}`;
  } else {
    // Otherwise use Bearer token
    authHeader = `Bearer ${accessToken}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
    console.log(`⏳ Rate limited. Waiting ${retryAfter} seconds...`);
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    return asanaRequest(endpoint, options);
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Asana API Error: ${error.errors?.[0]?.message || response.statusText}`);
  }

  return response.json();
}

// Fetch all tasks from Asana project
async function fetchAsanaTasks(): Promise<AsanaTask[]> {
  console.log('📡 Fetching tasks from Asana...');
  
  const tasks: AsanaTask[] = [];
  let offset: string | null = null;
  
  do {
    const params = new URLSearchParams({
      project: ASANA_PROJECT_GID,
      opt_fields: 'gid,name,notes,custom_fields',
      opt_expand: 'custom_fields',
      limit: '100',
    });
    
    if (offset) {
      params.append('offset', offset);
    }
    
    const response = await asanaRequest(`/tasks?${params.toString()}`);
    const batch = response.data || [];
    tasks.push(...batch);
    
    offset = response.next_page?.offset || null;
    console.log(`  ✓ Fetched ${tasks.length} tasks...`);
  } while (offset);
  
  console.log(`✅ Fetched ${tasks.length} total tasks`);
  return tasks;
}

// Extract PreConManager data from Asana task
function extractPreConManagerData(task: AsanaTask): PreConManagerData | null {
  const customFields = task.custom_fields || [];
  
  // Look for Pre-Con Manager custom field
  let preConManagerName: string | null = null;
  let preConManagerEmail: string | undefined = undefined;
  
  for (const field of customFields) {
    const fieldName = field.name.toLowerCase();
    
    // Check for Pre-Con Manager field (various name variations)
    if (fieldName.includes('pre-con') || fieldName.includes('precon') || fieldName.includes('pre con')) {
      if (field.type === 'text' && field.text_value) {
        preConManagerName = field.text_value.trim();
      } else if (field.type === 'people' && field.people_value) {
        preConManagerName = field.people_value.name;
        preConManagerEmail = field.people_value.email;
      } else if (field.type === 'enum' && field.enum_value) {
        preConManagerName = field.enum_value.name;
      }
    }
  }
  
  // Also check notes for Pre-Con Manager info
  if (!preConManagerName && task.notes) {
    const preConMatch = task.notes.match(/pre-con manager:\s*([^\n]+)/i);
    if (preConMatch) {
      preConManagerName = preConMatch[1].trim();
    }
  }
  
  if (!preConManagerName) {
    return null;
  }
  
  // Try to extract email from notes if not found in custom field
  if (!preConManagerEmail && task.notes) {
    const emailMatch = task.notes.match(new RegExp(`${preConManagerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})`, 'i'));
    if (emailMatch) {
      preConManagerEmail = emailMatch[1];
    }
  }
  
  // Try to extract phone from notes
  let phone: string | undefined = undefined;
  if (task.notes) {
    const phoneMatch = task.notes.match(new RegExp(`${preConManagerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*(\\(?[0-9]{3}\\)?[-.\\s]?[0-9]{3}[-.\\s]?[0-9]{4})`, 'i'));
    if (phoneMatch) {
      phone = phoneMatch[1].replace(/[^\d]/g, ''); // Normalize phone number
      if (phone.length === 10) {
        phone = `(${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
      }
    }
  }
  
  return {
    FullName: preConManagerName,
    Email: preConManagerEmail,
    Phone: phone,
  };
}

// Get or create PreConManager in database
async function getOrCreatePreConManager(pool: sql.ConnectionPool, data: PreConManagerData): Promise<number> {
  const trimmedName = data.FullName.trim();
  
  // First, try to find existing PreConManager
  let result = await pool.request()
    .input('name', sql.NVarChar(255), trimmedName)
    .query('SELECT PreConManagerId FROM core.PreConManager WHERE FullName = @name');
  
  if (result.recordset.length > 0) {
    const preConManagerId = result.recordset[0].PreConManagerId;
    
    // Update email/phone if provided and different
    if (data.Email || data.Phone) {
      const updateFields: string[] = [];
      const updateRequest = pool.request().input('id', sql.Int, preConManagerId);
      
      if (data.Email) {
        updateFields.push('Email = @Email');
        updateRequest.input('Email', sql.NVarChar(255), data.Email);
      }
      if (data.Phone) {
        updateFields.push('Phone = @Phone');
        updateRequest.input('Phone', sql.NVarChar(50), data.Phone);
      }
      
      if (updateFields.length > 0) {
        updateFields.push('UpdatedAt = SYSDATETIME()');
        await updateRequest.query(`
          UPDATE core.PreConManager
          SET ${updateFields.join(', ')}
          WHERE PreConManagerId = @id
        `);
      }
    }
    
    return preConManagerId;
  }
  
  // If not found, create a new PreConManager
  result = await pool.request()
    .input('FullName', sql.NVarChar(255), trimmedName)
    .input('Email', sql.NVarChar(255), data.Email || null)
    .input('Phone', sql.NVarChar(50), data.Phone || null)
    .query(`
      INSERT INTO core.PreConManager (FullName, Email, Phone)
      OUTPUT INSERTED.PreConManagerId
      VALUES (@FullName, @Email, @Phone)
    `);
  
  if (result.recordset.length > 0) {
    return result.recordset[0].PreConManagerId;
  }
  
  throw new Error(`Failed to create PreConManager: ${trimmedName}`);
}

// Main import function
async function importPreConManagers() {
  console.log('🚀 Starting Asana PreConManager Import...');
  console.log(`   Project GID: ${ASANA_PROJECT_GID}`);
  console.log('');
  
  const pool = await getPool();
  
  try {
    // Fetch tasks from Asana
    const tasks = await fetchAsanaTasks();
    
    if (tasks.length === 0) {
      console.log('⚠️  No tasks found in Asana project');
      return;
    }
    
    console.log('');
    console.log('📊 Processing tasks for PreConManager data...');
    
    const preConManagerMap = new Map<string, PreConManagerData>();
    
    // Extract PreConManager data from all tasks
    for (const task of tasks) {
      const preConData = extractPreConManagerData(task);
      if (preConData) {
        const key = preConData.FullName.toLowerCase().trim();
        // Keep the most complete version (prefer one with email/phone)
        const existing = preConManagerMap.get(key);
        if (!existing || (!existing.Email && preConData.Email) || (!existing.Phone && preConData.Phone)) {
          preConManagerMap.set(key, preConData);
        }
      }
    }
    
    console.log(`✅ Found ${preConManagerMap.size} unique PreConManagers`);
    console.log('');
    
    if (preConManagerMap.size === 0) {
      console.log('⚠️  No PreConManager data found in Asana tasks');
      return;
    }
    
    console.log('💾 Syncing PreConManagers to database...');
    
    let created = 0;
    let updated = 0;
    let errors = 0;
    
    for (const [key, data] of preConManagerMap.entries()) {
      try {
        // Check if exists
        const existing = await pool.request()
          .input('name', sql.NVarChar(255), data.FullName.trim())
          .query('SELECT PreConManagerId FROM core.PreConManager WHERE FullName = @name');
        
        const wasNew = existing.recordset.length === 0;
        
        await getOrCreatePreConManager(pool, data);
        
        if (wasNew) {
          created++;
          console.log(`  ✓ Created: ${data.FullName}${data.Email ? ` (${data.Email})` : ''}`);
        } else {
          updated++;
          console.log(`  ✓ Updated: ${data.FullName}${data.Email ? ` (${data.Email})` : ''}`);
        }
      } catch (error: any) {
        errors++;
        console.error(`  ✗ Error processing ${data.FullName}: ${error.message}`);
      }
    }
    
    console.log('');
    console.log('📊 Summary:');
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Errors: ${errors}`);
    console.log('');
    console.log('✅ PreConManager import complete!');
    
  } catch (error: any) {
    console.error('❌ Import failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

// Run import
if (require.main === module) {
  importPreConManagers().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { importPreConManagers };
