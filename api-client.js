/**
 * Stoa Group Database API Client
 * 
 * Copy this file to your Domo dashboard or frontend project
 * to easily interact with the API.
 * 
 * API URL: https://stoagroupdb.onrender.com
 */

const API_BASE_URL = 'https://stoagroupdb.onrender.com';

/**
 * Make an API request
 */
async function apiRequest(endpoint, method = 'GET', data = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error?.message || `API Error: ${response.status}`);
    }

    return result;
  } catch (error) {
    console.error('API Request Error:', error);
    throw error;
  }
}

// ============================================================
// CORE ENTITIES
// ============================================================

/**
 * Create a new project
 */
async function createProject(projectData) {
  return apiRequest('/api/core/projects', 'POST', projectData);
}

/**
 * Update a project
 */
async function updateProject(projectId, updates) {
  return apiRequest(`/api/core/projects/${projectId}`, 'PUT', updates);
}

/**
 * Create a new bank
 */
async function createBank(bankData) {
  return apiRequest('/api/core/banks', 'POST', bankData);
}

/**
 * Update a bank
 */
async function updateBank(bankId, updates) {
  return apiRequest(`/api/core/banks/${bankId}`, 'PUT', updates);
}

/**
 * Create a new person
 */
async function createPerson(personData) {
  return apiRequest('/api/core/persons', 'POST', personData);
}

/**
 * Update a person
 */
async function updatePerson(personId, updates) {
  return apiRequest(`/api/core/persons/${personId}`, 'PUT', updates);
}

/**
 * Create an equity partner
 */
async function createEquityPartner(partnerData) {
  return apiRequest('/api/core/equity-partners', 'POST', partnerData);
}

/**
 * Update an equity partner
 */
async function updateEquityPartner(partnerId, updates) {
  return apiRequest(`/api/core/equity-partners/${partnerId}`, 'PUT', updates);
}

// ============================================================
// BANKING
// ============================================================

/**
 * Create a new loan
 */
async function createLoan(loanData) {
  return apiRequest('/api/banking/loans', 'POST', loanData);
}

/**
 * Update a loan
 */
async function updateLoan(loanId, updates) {
  return apiRequest(`/api/banking/loans/${loanId}`, 'PUT', updates);
}

/**
 * Create a participation
 */
async function createParticipation(participationData) {
  return apiRequest('/api/banking/participations', 'POST', participationData);
}

/**
 * Update a participation
 */
async function updateParticipation(participationId, updates) {
  return apiRequest(`/api/banking/participations/${participationId}`, 'PUT', updates);
}

/**
 * Create a guarantee
 */
async function createGuarantee(guaranteeData) {
  return apiRequest('/api/banking/guarantees', 'POST', guaranteeData);
}

/**
 * Update a guarantee
 */
async function updateGuarantee(guaranteeId, updates) {
  return apiRequest(`/api/banking/guarantees/${guaranteeId}`, 'PUT', updates);
}

/**
 * Create a DSCR test
 */
async function createDSCRTest(testData) {
  return apiRequest('/api/banking/dscr-tests', 'POST', testData);
}

/**
 * Update a DSCR test
 */
async function updateDSCRTest(testId, updates) {
  return apiRequest(`/api/banking/dscr-tests/${testId}`, 'PUT', updates);
}

/**
 * Create a covenant
 */
async function createCovenant(covenantData) {
  return apiRequest('/api/banking/covenants', 'POST', covenantData);
}

/**
 * Update a covenant
 */
async function updateCovenant(covenantId, updates) {
  return apiRequest(`/api/banking/covenants/${covenantId}`, 'PUT', updates);
}

/**
 * Create a liquidity requirement
 */
async function createLiquidityRequirement(requirementData) {
  return apiRequest('/api/banking/liquidity-requirements', 'POST', requirementData);
}

/**
 * Update a liquidity requirement
 */
async function updateLiquidityRequirement(requirementId, updates) {
  return apiRequest(`/api/banking/liquidity-requirements/${requirementId}`, 'PUT', updates);
}

/**
 * Create a bank target
 */
async function createBankTarget(targetData) {
  return apiRequest('/api/banking/bank-targets', 'POST', targetData);
}

/**
 * Update a bank target
 */
async function updateBankTarget(targetId, updates) {
  return apiRequest(`/api/banking/bank-targets/${targetId}`, 'PUT', updates);
}

/**
 * Create an equity commitment
 */
async function createEquityCommitment(commitmentData) {
  return apiRequest('/api/banking/equity-commitments', 'POST', commitmentData);
}

/**
 * Update an equity commitment
 */
async function updateEquityCommitment(commitmentId, updates) {
  return apiRequest(`/api/banking/equity-commitments/${commitmentId}`, 'PUT', updates);
}

// ============================================================
// PIPELINE
// ============================================================

/**
 * Create an under contract record
 */
async function createUnderContract(contractData) {
  return apiRequest('/api/pipeline/under-contracts', 'POST', contractData);
}

/**
 * Update an under contract record
 */
async function updateUnderContract(contractId, updates) {
  return apiRequest(`/api/pipeline/under-contracts/${contractId}`, 'PUT', updates);
}

/**
 * Create a commercial listed record
 */
async function createCommercialListed(listedData) {
  return apiRequest('/api/pipeline/commercial-listed', 'POST', listedData);
}

/**
 * Update a commercial listed record
 */
async function updateCommercialListed(listedId, updates) {
  return apiRequest(`/api/pipeline/commercial-listed/${listedId}`, 'PUT', updates);
}

/**
 * Create a commercial acreage record
 */
async function createCommercialAcreage(acreageData) {
  return apiRequest('/api/pipeline/commercial-acreage', 'POST', acreageData);
}

/**
 * Update a commercial acreage record
 */
async function updateCommercialAcreage(acreageId, updates) {
  return apiRequest(`/api/pipeline/commercial-acreage/${acreageId}`, 'PUT', updates);
}

/**
 * Create a closed property record
 */
async function createClosedProperty(propertyData) {
  return apiRequest('/api/pipeline/closed-properties', 'POST', propertyData);
}

/**
 * Update a closed property record
 */
async function updateClosedProperty(propertyId, updates) {
  return apiRequest(`/api/pipeline/closed-properties/${propertyId}`, 'PUT', updates);
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Check API health
 */
async function checkHealth() {
  return apiRequest('/health');
}

/**
 * Get API documentation
 */
async function getAPIDocs() {
  return apiRequest('/api');
}

// ============================================================
// EXPORT FOR USE IN DOMO OR OTHER ENVIRONMENTS
// ============================================================

// For Domo Custom Scripts - functions are available globally
// For Node.js/ES6 modules, uncomment:
// export {
//   createProject, updateProject,
//   createLoan, updateLoan,
//   createUnderContract, updateUnderContract,
//   // ... etc
// };

// ============================================================
// USAGE EXAMPLES
// ============================================================

/*
// Example 1: Create a project
const newProject = await createProject({
  ProjectName: "The Heights at Picardy",
  City: "Baton Rouge",
  State: "LA",
  Region: "Gulf Coast",
  Location: "Baton Rouge, LA",
  Units: 232,
  ProductType: "Heights",
  Stage: "Started"
});
console.log('Created project:', newProject.data);

// Example 2: Update project units
const updated = await updateProject(1, {
  Units: 250,
  Stage: "Stabilized"
});
console.log('Updated project:', updated.data);

// Example 3: Create a loan
const newLoan = await createLoan({
  ProjectId: 1,
  LoanPhase: "Construction",
  LoanType: "LOC - Construction",
  LenderId: 5,
  LoanAmount: 15000000,
  LoanClosingDate: "2024-01-15",
  MaturityDate: "2025-12-31"
});
console.log('Created loan:', newLoan.data);

// Example 4: Check API health
const health = await checkHealth();
console.log('API Status:', health.message);
*/
