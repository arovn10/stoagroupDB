#!/usr/bin/env ts-node
/**
 * Import Asana Deal Pipeline Data
 * 
 * Fetches deal pipeline data from Asana API and imports into database:
 * - Creates/updates Projects in core.Project
 * - Creates/updates DealPipeline records in pipeline.DealPipeline
 * 
 * Usage: npm run db:import-asana-deal-pipeline
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
    if (!result.error && (process.env.ASANA_ACCESS_TOKEN || process.env.ASANA_PAT || process.env.CLIENT_ID)) {
      envLoaded = true;
      console.log(`✅ Loaded .env from: ${envPath}`);
      break;
    }
  } catch (e) {
    // Continue to next path
  }
}

// Load from default location if not found
if (!envLoaded) {
  dotenv.config();
}

// Get Asana configuration
const ASANA_API_BASE = process.env.ASANA_API_BASE?.replace(/['"]/g, '').trim() || 'https://app.asana.com/api/1.0';
const ASANA_ACCESS_TOKEN = process.env.ASANA_ACCESS_TOKEN || process.env.ASANA_PAT;
const ASANA_CLIENT_ID = process.env.CLIENT_ID;
const ASANA_CLIENT_SECRET = process.env.CLIENT_SECRET;
const ASANA_PROJECT_GID = process.env.ASANA_PROJECT_GID || '1207455912614114'; // Default Deal Pipeline project

if (!ASANA_ACCESS_TOKEN && (!ASANA_CLIENT_ID || !ASANA_CLIENT_SECRET)) {
  console.error('❌ Error: Asana authentication not found!');
  console.error('');
  console.error('   Option 1: Use Personal Access Token (PAT) - Recommended for import');
  console.error('      Add to .env: ASANA_ACCESS_TOKEN=your_token_here');
  console.error('      Get token from: https://app.asana.com/0/my-apps');
  console.error('');
  console.error('   Option 2: Use OAuth (requires additional setup)');
  console.error('      Add to .env: CLIENT_ID=your_client_id');
  console.error('      Add to .env: CLIENT_SECRET=your_client_secret');
  console.error('      Note: OAuth requires authorization flow - PAT is simpler for import');
  console.error('');
  process.exit(1);
}

console.log(`📡 Asana API Configuration:`);
console.log(`   API Base: ${ASANA_API_BASE}`);
console.log(`   Project GID: ${ASANA_PROJECT_GID}`);
if (ASANA_ACCESS_TOKEN) {
  console.log(`   Auth: Personal Access Token (PAT) ✅`);
} else if (ASANA_CLIENT_ID && ASANA_CLIENT_SECRET) {
  console.log(`   Auth: OAuth (CLIENT_ID/CLIENT_SECRET) ⚠️`);
  console.warn('   ⚠️  Warning: OAuth flow requires user authorization.');
  console.warn('   For import script, please use ASANA_ACCESS_TOKEN (Personal Access Token)');
  console.warn('   Get token from: https://app.asana.com/0/my-apps');
  console.warn('   Or add ASANA_ACCESS_TOKEN to .env file');
  console.warn('');
} else {
  console.log(`   Auth: None ❌`);
}
console.log('');

interface AsanaTask {
  gid: string;
  name: string;
  notes?: string;
  due_on?: string;
  due_at?: string;
  completed: boolean;
  custom_fields?: AsanaCustomField[];
}

interface AsanaCustomField {
  gid: string;
  name: string;
  type: string;
  display_value?: string;
  enum_value?: { gid: string; name: string };
  multi_enum_values?: Array<{ gid: string; name: string }>;
  text_value?: string;
  number_value?: number;
  date_value?: { date?: string };
  people_value?: { gid: string; name: string };
}

interface ParsedDealData {
  // Core fields
  ProjectName: string;
  City?: string;
  State?: string;
  Region?: string;
  Units?: number;
  ProductType?: string;
  Stage?: string;
  EstimatedConstructionStartDate?: string;
  
  // Deal Pipeline fields
  Bank?: string;
  StartDate?: string;
  UnitCount?: number;
  PreConManagerId?: number;
  ConstructionLoanClosingDate?: string;
  Notes?: string;
  Priority?: string;
  Acreage?: number;
  LandPrice?: number;
  ExecutionDate?: string;
  DueDiligenceDate?: string;
  ClosingDate?: string;
  PurchasingEntity?: string;
  Cash?: boolean;
  OpportunityZone?: boolean;
  ClosingNotes?: string;
  AsanaTaskGid: string;
}

// Helper function to get Asana access token (if using OAuth)
async function getAsanaAccessToken(): Promise<string | null> {
  // If we have a PAT, use it
  if (ASANA_ACCESS_TOKEN) {
    return ASANA_ACCESS_TOKEN;
  }
  
  // If we have CLIENT_ID and CLIENT_SECRET, we could implement OAuth flow here
  // For now, return null and let the caller handle the error
  // Note: Asana OAuth requires user authorization, so PAT is simpler for import scripts
  return null;
}

// Helper function to make Asana API requests
async function asanaRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  const accessToken = await getAsanaAccessToken();
  
  if (!accessToken) {
    throw new Error('No Asana access token available. Please set ASANA_ACCESS_TOKEN in .env file.');
  }
  
  const url = `${ASANA_API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
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
      opt_fields: 'gid,name,notes,due_on,due_at,completed,custom_fields',
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

// Parse custom fields from Asana task
function parseCustomFields(task: AsanaTask): Record<string, any> {
  const fields: Record<string, any> = {};
  
  if (!task.custom_fields) return fields;
  
  for (const field of task.custom_fields) {
    const fieldName = field.name.toLowerCase();
    
    if (field.type === 'text' && field.text_value) {
      fields[fieldName] = field.text_value;
    } else if (field.type === 'number' && field.number_value !== undefined) {
      fields[fieldName] = field.number_value;
    } else if (field.type === 'date' && field.date_value?.date) {
      fields[fieldName] = field.date_value.date;
    } else if (field.type === 'enum' && field.enum_value) {
      fields[fieldName] = field.enum_value.name;
    } else if (field.type === 'multi_enum' && field.multi_enum_values) {
      fields[fieldName] = field.multi_enum_values.map(v => v.name).join(', ');
    } else if (field.type === 'people' && field.people_value) {
      fields[fieldName] = field.people_value.name;
    }
  }
  
  return fields;
}

// Parse notes to extract structured data
function parseNotes(notes: string): Record<string, any> {
  const parsed: Record<string, any> = {};
  if (!notes) return parsed;
  
  const lines = notes.split('\n').map(l => l.trim()).filter(l => l);
  
  for (const line of lines) {
    const lower = line.toLowerCase();
    
    // Extract location
    if (lower.startsWith('location:')) {
      const location = line.replace(/^location:\s*/i, '').trim();
      const parts = location.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        parsed.city = parts[0];
        parsed.state = parts[1];
      }
    }
    
    // Extract units
    if (lower.includes('units:')) {
      const match = line.match(/units?:\s*(\d+)/i);
      if (match) parsed.units = parseInt(match[1]);
    }
    
    // Extract price
    if (lower.includes('price:')) {
      const match = line.match(/price:\s*\$?([\d,]+\.?\d*)/i);
      if (match) {
        parsed.landPrice = parseFloat(match[1].replace(/,/g, ''));
      }
    }
    
    // Extract acreage
    if (lower.includes('acreage:') || lower.includes('acres:')) {
      const match = line.match(/(?:acreage|acres):\s*([\d.]+)/i);
      if (match) parsed.acreage = parseFloat(match[1]);
    }
    
    // Extract closing date
    if (lower.includes('closing:')) {
      const match = line.match(/closing:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
      if (match) {
        const dateParts = match[1].split('/');
        parsed.closingDate = `${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`;
      }
    }
  }
  
  return parsed;
}

// Parse Asana task into DealPipeline data
function parseTask(task: AsanaTask, pool: sql.ConnectionPool): ParsedDealData {
  const customFields = parseCustomFields(task);
  const notesData = parseNotes(task.notes || '');
  
  // Determine stage
  let stage = customFields.stage || 'Prospective';
  if (task.completed) {
    stage = 'Closed';
  } else if (stage && typeof stage === 'string') {
    stage = stage.trim();
  }
  
  // Parse dates
  const startDate = customFields['start date'] || customFields.startdate || task.due_on || null;
  const constructionLoanClosing = customFields['construction loan closing'] || customFields.constructionloanclosing || null;
  
  // Parse priority
  let priority: string | undefined = undefined;
  if (customFields.priority) {
    const p = String(customFields.priority).toLowerCase();
    if (p.includes('high')) priority = 'High';
    else if (p.includes('medium')) priority = 'Medium';
    else if (p.includes('low')) priority = 'Low';
  }
  
  // Parse location (from custom field or notes)
  let city: string | undefined = undefined;
  let state: string | undefined = undefined;
  if (customFields.location) {
    const location = String(customFields.location);
    if (location.includes(',')) {
      const parts = location.split(',').map(p => p.trim());
      city = parts[0];
      state = parts[1];
    } else {
      // Try to extract state abbreviation
      const stateMatch = location.match(/\b([A-Z]{2})\b/);
      if (stateMatch) {
        state = stateMatch[1];
        city = location.replace(/\b[A-Z]{2}\b/, '').trim();
      } else {
        city = location;
      }
    }
  } else if (notesData.city) {
    city = notesData.city;
    state = notesData.state;
  }
  
  // Parse product type
  let productType: string | undefined = undefined;
  if (customFields['product type'] || customFields.producttype) {
    const pt = String(customFields['product type'] || customFields.producttype);
    if (pt.includes('Prototype')) productType = 'Prototype';
    else if (pt.includes('Heights') || pt.includes('Flats')) productType = 'Heights/Flats';
  }
  
  // Parse unit count
  let unitCount: number | undefined = undefined;
  if (customFields['unit count'] || customFields.unitcount) {
    unitCount = parseInt(String(customFields['unit count'] || customFields.unitcount));
  } else if (notesData.units) {
    unitCount = notesData.units;
  }
  
  return {
    ProjectName: task.name.trim(),
    City: city,
    State: state,
    Region: customFields.region || undefined,
    Units: unitCount,
    ProductType: productType,
    Stage: stage,
    EstimatedConstructionStartDate: startDate,
    Bank: customFields.bank || undefined,
    StartDate: startDate,
    UnitCount: unitCount,
    ConstructionLoanClosingDate: constructionLoanClosing,
    Notes: task.notes || undefined,
    Priority: priority,
    Acreage: customFields.acreage || notesData.acreage || undefined,
    LandPrice: customFields.price || notesData.landPrice || undefined,
    ExecutionDate: customFields['execution date'] || customFields.executiondate || undefined,
    DueDiligenceDate: customFields['due diligence'] || customFields.duediligence || undefined,
    ClosingDate: customFields.closing || notesData.closingDate || undefined,
    PurchasingEntity: customFields['purchasing entity'] || customFields.purchasingentity || undefined,
    Cash: customFields.cash === 'Yes' || customFields.cash === true || customFields.cash === 1,
    OpportunityZone: customFields['opportunity zone'] === 'Yes' || customFields.opportunityzone === true || customFields.opportunityzone === 1,
    ClosingNotes: customFields['closing notes'] || customFields.closingnotes || undefined,
    AsanaTaskGid: task.gid,
  };
}

// Get or create Project
async function getOrCreateProject(pool: sql.ConnectionPool, data: ParsedDealData): Promise<number> {
  // Try to find existing project
  let result = await pool.request()
    .input('name', sql.NVarChar(255), data.ProjectName)
    .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @name');
  
  if (result.recordset.length > 0) {
    const projectId = result.recordset[0].ProjectId;
    
    // Update project if new data provided
    const updateFields: string[] = [];
    const updateRequest = pool.request().input('ProjectId', sql.Int, projectId);
    
    if (data.City !== undefined) { updateFields.push('City = @City'); updateRequest.input('City', sql.NVarChar(100), data.City); }
    if (data.State !== undefined) { updateFields.push('State = @State'); updateRequest.input('State', sql.NVarChar(50), data.State); }
    if (data.Region !== undefined) { updateFields.push('Region = @Region'); updateRequest.input('Region', sql.NVarChar(50), data.Region); }
    if (data.Units !== undefined) { updateFields.push('Units = @Units'); updateRequest.input('Units', sql.Int, data.Units); }
    if (data.ProductType !== undefined) { updateFields.push('ProductType = @ProductType'); updateRequest.input('ProductType', sql.NVarChar(50), data.ProductType); }
    if (data.Stage !== undefined) { updateFields.push('Stage = @Stage'); updateRequest.input('Stage', sql.NVarChar(50), data.Stage); }
    if (data.EstimatedConstructionStartDate !== undefined) { 
      updateFields.push('EstimatedConstructionStartDate = @EstimatedConstructionStartDate'); 
      updateRequest.input('EstimatedConstructionStartDate', sql.Date, data.EstimatedConstructionStartDate); 
    }
    
    if (updateFields.length > 0) {
      updateFields.push('UpdatedAt = SYSDATETIME()');
      await updateRequest.query(`UPDATE core.Project SET ${updateFields.join(', ')} WHERE ProjectId = @ProjectId`);
    }
    
    return projectId;
  }
  
  // Create new project
  const insertResult = await pool.request()
    .input('ProjectName', sql.NVarChar(255), data.ProjectName)
    .input('City', sql.NVarChar(100), data.City)
    .input('State', sql.NVarChar(50), data.State)
    .input('Region', sql.NVarChar(50), data.Region)
    .input('Units', sql.Int, data.Units)
    .input('ProductType', sql.NVarChar(50), data.ProductType)
    .input('Stage', sql.NVarChar(50), data.Stage || 'Prospective')
    .input('EstimatedConstructionStartDate', sql.Date, data.EstimatedConstructionStartDate)
    .query(`
      INSERT INTO core.Project (ProjectName, City, State, Region, Units, ProductType, Stage, EstimatedConstructionStartDate)
      OUTPUT INSERTED.ProjectId
      VALUES (@ProjectName, @City, @State, @Region, @Units, @ProductType, @Stage, @EstimatedConstructionStartDate)
    `);
  
  return insertResult.recordset[0].ProjectId;
}

// Get Pre-Con Manager PreConManagerId by name (creates if doesn't exist)
async function getPreConManagerId(pool: sql.ConnectionPool, name: string): Promise<number | null> {
  if (!name) return null;
  
  const trimmedName = name.trim();
  
  // First, try to find existing PreConManager
  let result = await pool.request()
    .input('name', sql.NVarChar(255), trimmedName)
    .query('SELECT PreConManagerId FROM core.PreConManager WHERE FullName = @name');
  
  if (result.recordset.length > 0) {
    return result.recordset[0].PreConManagerId;
  }
  
  // If not found, create a new PreConManager
  result = await pool.request()
    .input('name', sql.NVarChar(255), trimmedName)
    .query(`
      INSERT INTO core.PreConManager (FullName)
      OUTPUT INSERTED.PreConManagerId
      VALUES (@name)
    `);
  
  if (result.recordset.length > 0) {
    return result.recordset[0].PreConManagerId;
  }
  
  return null;
}

// Main import function
async function importDealPipeline() {
  console.log('🚀 Starting Asana Deal Pipeline Import...');
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
    console.log('📊 Processing tasks...');
    
    let created = 0;
    let updated = 0;
    let errors = 0;
    
    for (const task of tasks) {
      try {
        // Parse task data
        const dealData = parseTask(task, pool);
        
        // Get or create project
        const projectId = await getOrCreateProject(pool, dealData);
        
        // Get Pre-Con Manager ID if provided
        let preConManagerId: number | null = null;
        
        // First check custom fields for Pre-Con Manager
        const customFields = parseCustomFields(task);
        let preConManagerName: string | null = null;
        
        // Check custom fields for Pre-Con Manager (various name variations)
        for (const [key, value] of Object.entries(customFields)) {
          if ((key.includes('pre-con') || key.includes('precon') || key.includes('pre con')) && value) {
            preConManagerName = String(value).trim();
            break;
          }
        }
        
        // Fall back to notes if not found in custom fields
        if (!preConManagerName && dealData.Notes) {
          const preConMatch = dealData.Notes.match(/pre-con manager:\s*([^\n]+)/i);
          if (preConMatch) {
            preConManagerName = preConMatch[1].trim();
          }
        }
        
        if (preConManagerName) {
          preConManagerId = await getPreConManagerId(pool, preConManagerName);
        }
        
        // Calculate SqFtPrice
        let sqFtPrice: number | null = null;
        if (dealData.LandPrice && dealData.Acreage && dealData.Acreage > 0) {
          sqFtPrice = dealData.LandPrice / (dealData.Acreage * 43560);
        }
        
        // Check if DealPipeline record exists
        const existing = await pool.request()
          .input('ProjectId', sql.Int, projectId)
          .query('SELECT DealPipelineId FROM pipeline.DealPipeline WHERE ProjectId = @ProjectId');
        
        if (existing.recordset.length > 0) {
          // Update existing record
          const updateFields: string[] = [];
          const updateRequest = pool.request().input('DealPipelineId', sql.Int, existing.recordset[0].DealPipelineId);
          
          if (dealData.Bank !== undefined) { updateFields.push('Bank = @Bank'); updateRequest.input('Bank', sql.NVarChar(255), dealData.Bank); }
          if (dealData.StartDate !== undefined) { updateFields.push('StartDate = @StartDate'); updateRequest.input('StartDate', sql.Date, dealData.StartDate); }
          if (dealData.UnitCount !== undefined) { updateFields.push('UnitCount = @UnitCount'); updateRequest.input('UnitCount', sql.Int, dealData.UnitCount); }
          if (preConManagerId !== null) { updateFields.push('PreConManagerId = @PreConManagerId'); updateRequest.input('PreConManagerId', sql.Int, preConManagerId); }
          if (dealData.ConstructionLoanClosingDate !== undefined) { updateFields.push('ConstructionLoanClosingDate = @ConstructionLoanClosingDate'); updateRequest.input('ConstructionLoanClosingDate', sql.Date, dealData.ConstructionLoanClosingDate); }
          if (dealData.Notes !== undefined) { updateFields.push('Notes = @Notes'); updateRequest.input('Notes', sql.NVarChar(sql.MAX), dealData.Notes); }
          if (dealData.Priority !== undefined) { updateFields.push('Priority = @Priority'); updateRequest.input('Priority', sql.NVarChar(20), dealData.Priority); }
          if (dealData.Acreage !== undefined) { updateFields.push('Acreage = @Acreage'); updateRequest.input('Acreage', sql.Decimal(18, 4), dealData.Acreage); }
          if (dealData.LandPrice !== undefined) { updateFields.push('LandPrice = @LandPrice'); updateRequest.input('LandPrice', sql.Decimal(18, 2), dealData.LandPrice); }
          if (sqFtPrice !== null) { updateFields.push('SqFtPrice = @SqFtPrice'); updateRequest.input('SqFtPrice', sql.Decimal(18, 2), sqFtPrice); }
          if (dealData.ExecutionDate !== undefined) { updateFields.push('ExecutionDate = @ExecutionDate'); updateRequest.input('ExecutionDate', sql.Date, dealData.ExecutionDate); }
          if (dealData.DueDiligenceDate !== undefined) { updateFields.push('DueDiligenceDate = @DueDiligenceDate'); updateRequest.input('DueDiligenceDate', sql.Date, dealData.DueDiligenceDate); }
          if (dealData.ClosingDate !== undefined) { updateFields.push('ClosingDate = @ClosingDate'); updateRequest.input('ClosingDate', sql.Date, dealData.ClosingDate); }
          if (dealData.PurchasingEntity !== undefined) { updateFields.push('PurchasingEntity = @PurchasingEntity'); updateRequest.input('PurchasingEntity', sql.NVarChar(255), dealData.PurchasingEntity); }
          if (dealData.Cash !== undefined) { updateFields.push('Cash = @Cash'); updateRequest.input('Cash', sql.Bit, dealData.Cash); }
          if (dealData.OpportunityZone !== undefined) { updateFields.push('OpportunityZone = @OpportunityZone'); updateRequest.input('OpportunityZone', sql.Bit, dealData.OpportunityZone); }
          if (dealData.ClosingNotes !== undefined) { updateFields.push('ClosingNotes = @ClosingNotes'); updateRequest.input('ClosingNotes', sql.NVarChar(sql.MAX), dealData.ClosingNotes); }
          if (dealData.AsanaTaskGid) { updateFields.push('AsanaTaskGid = @AsanaTaskGid'); updateRequest.input('AsanaTaskGid', sql.NVarChar(100), dealData.AsanaTaskGid); }
          
          if (updateFields.length > 0) {
            updateFields.push('UpdatedAt = SYSDATETIME()');
            await updateRequest.query(`UPDATE pipeline.DealPipeline SET ${updateFields.join(', ')} WHERE DealPipelineId = @DealPipelineId`);
            updated++;
            console.log(`  ✓ Updated: ${dealData.ProjectName}`);
          }
        } else {
          // Create new record
          await pool.request()
            .input('ProjectId', sql.Int, projectId)
            .input('Bank', sql.NVarChar(255), dealData.Bank)
            .input('StartDate', sql.Date, dealData.StartDate)
            .input('UnitCount', sql.Int, dealData.UnitCount)
            .input('PreConManagerId', sql.Int, preConManagerId)
            .input('ConstructionLoanClosingDate', sql.Date, dealData.ConstructionLoanClosingDate)
            .input('Notes', sql.NVarChar(sql.MAX), dealData.Notes)
            .input('Priority', sql.NVarChar(20), dealData.Priority)
            .input('Acreage', sql.Decimal(18, 4), dealData.Acreage)
            .input('LandPrice', sql.Decimal(18, 2), dealData.LandPrice)
            .input('SqFtPrice', sql.Decimal(18, 2), sqFtPrice)
            .input('ExecutionDate', sql.Date, dealData.ExecutionDate)
            .input('DueDiligenceDate', sql.Date, dealData.DueDiligenceDate)
            .input('ClosingDate', sql.Date, dealData.ClosingDate)
            .input('PurchasingEntity', sql.NVarChar(255), dealData.PurchasingEntity)
            .input('Cash', sql.Bit, dealData.Cash)
            .input('OpportunityZone', sql.Bit, dealData.OpportunityZone)
            .input('ClosingNotes', sql.NVarChar(sql.MAX), dealData.ClosingNotes)
            .input('AsanaTaskGid', sql.NVarChar(100), dealData.AsanaTaskGid)
            .input('AsanaProjectGid', sql.NVarChar(100), ASANA_PROJECT_GID)
            .query(`
              INSERT INTO pipeline.DealPipeline (
                ProjectId, Bank, StartDate, UnitCount, PreConManagerId,
                ConstructionLoanClosingDate, Notes, Priority, Acreage, LandPrice,
                SqFtPrice, ExecutionDate, DueDiligenceDate, ClosingDate,
                PurchasingEntity, Cash, OpportunityZone, ClosingNotes,
                AsanaTaskGid, AsanaProjectGid
              )
              VALUES (
                @ProjectId, @Bank, @StartDate, @UnitCount, @PreConManagerId,
                @ConstructionLoanClosingDate, @Notes, @Priority, @Acreage, @LandPrice,
                @SqFtPrice, @ExecutionDate, @DueDiligenceDate, @ClosingDate,
                @PurchasingEntity, @Cash, @OpportunityZone, @ClosingNotes,
                @AsanaTaskGid, @AsanaProjectGid
              )
            `);
          created++;
          console.log(`  ✓ Created: ${dealData.ProjectName}`);
        }
      } catch (error: any) {
        errors++;
        console.error(`  ❌ Error processing "${task.name}": ${error.message}`);
      }
    }
    
    console.log('');
    console.log('✅ Import completed!');
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Errors: ${errors}`);
    
  } catch (error: any) {
    console.error('❌ Import failed:', error.message);
    throw error;
  } finally {
    await pool.close();
  }
}

// Run import
if (require.main === module) {
  importDealPipeline()
    .then(() => {
      console.log('');
      console.log('🎉 Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

export { importDealPipeline };
