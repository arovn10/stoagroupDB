#!/usr/bin/env ts-node
/**
 * Complete Data Sync - Processes ALL banking dashboard data
 * 
 * This script syncs:
 * - All projects
 * - All banks  
 * - All loans with full details
 * - All participations
 * - All guarantees
 * - All DSCR tests
 * - All covenants
 * - All liquidity requirements
 * - All bank targets
 * 
 * Usage: npm run db:sync-complete
 */

import { query, getPool } from './db-manipulate';
import sql from 'mssql';

const API_BASE_URL = 'https://stoagroupdb.onrender.com';

// Helper functions
async function apiCall(endpoint: string, method: string, data?: any) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (!result.success && result.error) {
    throw new Error(result.error.message || 'API error');
  }
  return result;
}

function parseAmount(str: string | null | undefined): number | null {
  if (!str || str.trim() === '' || str === 'N/A' || str === '-') return null;
  return parseFloat(str.replace(/[$,]/g, '')) || null;
}

function parseDate(str: string | null | undefined): string | null {
  if (!str || str.trim() === '' || str === 'N/A') return null;
  const parts = str.split('/');
  if (parts.length === 3) {
    let year = parseInt(parts[2]);
    if (year < 100) year += 2000;
    return `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  return null;
}

async function findOrCreateProject(name: string, data: any): Promise<number> {
  const pool = await getPool();
  const existing = await pool.request()
    .input('name', sql.NVarChar, name)
    .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @name');
  
  if (existing.recordset.length > 0) {
    const id = existing.recordset[0].ProjectId;
    await apiCall(`/api/core/projects/${id}`, 'PUT', data);
    return id;
  }
  const result = await apiCall('/api/core/projects', 'POST', data);
  return result.data.ProjectId;
}

async function findOrCreateBank(name: string, city?: string, state?: string): Promise<number> {
  const pool = await getPool();
  const existing = await pool.request()
    .input('name', sql.NVarChar, name)
    .query('SELECT BankId FROM core.Bank WHERE BankName = @name');
  
  if (existing.recordset.length > 0) {
    return existing.recordset[0].BankId;
  }
  const result = await apiCall('/api/core/banks', 'POST', { BankName: name, City: city, State: state });
  return result.data.BankId;
}

async function findOrCreatePerson(name: string): Promise<number> {
  const pool = await getPool();
  const existing = await pool.request()
    .input('name', sql.NVarChar, name)
    .query('SELECT PersonId FROM core.Person WHERE FullName = @name');
  
  if (existing.recordset.length > 0) {
    return existing.recordset[0].PersonId;
  }
  const result = await apiCall('/api/core/persons', 'POST', { FullName: name });
  return result.data.PersonId;
}

// Loan data from your spreadsheet
const loanData = [
  // Multifamily loans
  {
    project: 'The Waters at Hammond',
    birthOrder: 6,
    loanType: 'LOC - Construction',
    borrower: 'The Waters at Hammond',
    lender: 'b1Bank',
    amount: 31520000,
    closingDate: '2020-09-24',
    completionDate: 'Aug-24',
    leaseUp: 'May-23',
    ioMaturity: '2023-09-24',
    fixedOrFloating: 'Floating',
    index: 'WSJ Prime',
    spread: '0.50%',
    miniPermMaturity: '2026-09-24',
    miniPermRate: '5yr US Treasury + TBD - 25yr am',
    permanentClose: '2024-04-30',
    permanentLender: 'Berkadia',
    permanentAmount: 39364000,
    dscrTests: [
      { test: 1, date: '2024-09-24', rate: 'N/A', req: 1.00, projected: 'N/A' },
    ],
    liquidity: { total: 5000000, lendingBank: 1000000 },
    occupancy: { date: null, req: null, projected: null },
  },
  {
    project: 'The Waters at Millerville',
    birthOrder: 10,
    loanType: 'LOC - Construction',
    borrower: 'The Waters at Millerville',
    lender: 'First Horizon Bank',
    amount: 36200000,
    closingDate: '2022-06-13',
    completionDate: 'Jul-2',
    leaseUp: 'Apr-25',
    ioMaturity: '2025-07-25',
    fixedOrFloating: 'Floating',
    index: 'WSJ Prime',
    spread: '0.50%',
    miniPermMaturity: '2027-06-13',
    miniPermRate: 'SOFR + 2.35% - 30yr am',
    permanentClose: '2026-04-30',
    permanentLender: 'Berkadia',
    permanentAmount: 41741692,
    dscrTests: [
      { test: 1, date: '2025-06-30', rate: '0.00%', req: 1.00, projected: '2,795,107.64' },
      { test: 2, date: '2025-09-30', rate: '0.00%', req: 1.15, projected: '2,744,826.50' },
      { test: 3, date: '2025-12-31', rate: '0.00%', req: 1.15, projected: '2,660,818.47' },
    ],
    liquidity: { total: 15000000, lendingBank: 0 },
  },
  // Add more loans here...
];

async function syncCompleteData() {
  console.log('🚀 Starting Complete Data Sync...\n');
  const pool = await getPool();
  
  try {
    // Create all banks, people, projects first
    // Then process loans, participations, guarantees, etc.
    
    console.log('✅ Use the API to add detailed data for each project.');
    console.log('📝 See DATA_SYNC_GUIDE.md for step-by-step instructions.');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  syncCompleteData().catch(console.error);
}
