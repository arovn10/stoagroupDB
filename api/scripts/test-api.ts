#!/usr/bin/env ts-node
/**
 * Test API Endpoints
 * 
 * Tests all API endpoints to verify they're working
 * 
 * Usage: npm run db:test-api
 */

const API_BASE_URL = 'https://stoagroupdb-ddre.onrender.com';

async function testAPI() {
  console.log('🧪 Testing API Endpoints...\n');
  
  try {
    // Test 1: Health Check
    console.log('1️⃣  Testing Health Check...');
    const health = await fetch(`${API_BASE_URL}/health`);
    const healthData = await health.json();
    console.log(`   ✅ Health: ${healthData.success ? 'OK' : 'FAILED'}`);
    console.log(`   Message: ${healthData.message}\n`);
    
    // Test 2: Get Projects
    console.log('2️⃣  Testing GET /api/core/projects...');
    const projects = await fetch(`${API_BASE_URL}/api/core/projects`);
    const projectsData = await projects.json();
    if (projects.ok && projectsData.success) {
      console.log(`   ✅ Projects: ${projectsData.data.length} found\n`);
    } else {
      console.log(`   ❌ Projects: ${projectsData.error?.message || `HTTP ${projects.status}: ${projects.statusText}`}\n`);
    }
    
    // Test 3: Get Banks
    console.log('3️⃣  Testing GET /api/core/banks...');
    const banks = await fetch(`${API_BASE_URL}/api/core/banks`);
    const banksData = await banks.json();
    if (banksData.success) {
      console.log(`   ✅ Banks: ${banksData.data.length} found\n`);
    } else {
      console.log(`   ❌ Banks: ${banksData.error?.message}\n`);
    }
    
    // Test 4: Get Loans
    console.log('4️⃣  Testing GET /api/banking/loans...');
    const loans = await fetch(`${API_BASE_URL}/api/banking/loans`);
    const loansData = await loans.json();
    if (loansData.success) {
      console.log(`   ✅ Loans: ${loansData.data.length} found\n`);
    } else {
      console.log(`   ❌ Loans: ${loansData.error?.message}\n`);
    }
    
    // Test 5: Get Participations
    console.log('5️⃣  Testing GET /api/banking/participations...');
    const participations = await fetch(`${API_BASE_URL}/api/banking/participations`);
    const participationsData = await participations.json();
    if (participationsData.success) {
      console.log(`   ✅ Participations: ${participationsData.data.length} found\n`);
    } else {
      console.log(`   ❌ Participations: ${participationsData.error?.message}\n`);
    }
    
    // Test 6: Get Guarantees
    console.log('6️⃣  Testing GET /api/banking/guarantees...');
    const guarantees = await fetch(`${API_BASE_URL}/api/banking/guarantees`);
    const guaranteesData = await guarantees.json();
    if (guaranteesData.success) {
      console.log(`   ✅ Guarantees: ${guaranteesData.data.length} found\n`);
    } else {
      console.log(`   ❌ Guarantees: ${guaranteesData.error?.message}\n`);
    }
    
    // Test 7: Get DSCR Tests
    console.log('7️⃣  Testing GET /api/banking/dscr-tests...');
    const dscrTests = await fetch(`${API_BASE_URL}/api/banking/dscr-tests`);
    const dscrTestsData = await dscrTests.json();
    if (dscrTestsData.success) {
      console.log(`   ✅ DSCR Tests: ${dscrTestsData.data.length} found\n`);
    } else {
      console.log(`   ❌ DSCR Tests: ${dscrTestsData.error?.message}\n`);
    }
    
    // Test 8: Get Covenants
    console.log('8️⃣  Testing GET /api/banking/covenants...');
    const covenants = await fetch(`${API_BASE_URL}/api/banking/covenants`);
    const covenantsData = await covenants.json();
    if (covenantsData.success) {
      console.log(`   ✅ Covenants: ${covenantsData.data.length} found\n`);
    } else {
      console.log(`   ❌ Covenants: ${covenantsData.error?.message}\n`);
    }
    
    // Test 9: Get Liquidity Requirements
    console.log('9️⃣  Testing GET /api/banking/liquidity-requirements...');
    const liquidity = await fetch(`${API_BASE_URL}/api/banking/liquidity-requirements`);
    const liquidityData = await liquidity.json();
    if (liquidityData.success) {
      console.log(`   ✅ Liquidity Requirements: ${liquidityData.data.length} found\n`);
    } else {
      console.log(`   ❌ Liquidity Requirements: ${liquidityData.error?.message}\n`);
    }
    
    // Test 10: Get Bank Targets
    console.log('🔟 Testing GET /api/banking/bank-targets...');
    const bankTargets = await fetch(`${API_BASE_URL}/api/banking/bank-targets`);
    const bankTargetsData = await bankTargets.json();
    if (bankTargetsData.success) {
      console.log(`   ✅ Bank Targets: ${bankTargetsData.data.length} found\n`);
    } else {
      console.log(`   ❌ Bank Targets: ${bankTargetsData.error?.message}\n`);
    }
    
    console.log('✅ API Testing Complete!\n');
    console.log('📊 Summary:');
    console.log(`   Projects: ${projectsData.success ? projectsData.data.length : 0}`);
    console.log(`   Banks: ${banksData.success ? banksData.data.length : 0}`);
    console.log(`   Loans: ${loansData.success ? loansData.data.length : 0}`);
    console.log(`   Participations: ${participationsData.success ? participationsData.data.length : 0}`);
    console.log(`   Guarantees: ${guaranteesData.success ? guaranteesData.data.length : 0}`);
    console.log(`   DSCR Tests: ${dscrTestsData.success ? dscrTestsData.data.length : 0}`);
    console.log(`   Covenants: ${covenantsData.success ? covenantsData.data.length : 0}`);
    console.log(`   Liquidity Requirements: ${liquidityData.success ? liquidityData.data.length : 0}`);
    console.log(`   Bank Targets: ${bankTargetsData.success ? bankTargetsData.data.length : 0}`);
    
  } catch (error: any) {
    console.error('\n❌ API Test Failed:', error.message);
    throw error;
  }
}

if (require.main === module) {
  testAPI().catch(console.error);
}
