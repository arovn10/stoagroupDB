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

// Projects
async function getAllProjects() {
  return apiRequest('/api/core/projects', 'GET');
}

async function getProjectById(projectId) {
  return apiRequest(`/api/core/projects/${projectId}`, 'GET');
}

async function createProject(projectData) {
  return apiRequest('/api/core/projects', 'POST', projectData);
}

async function updateProject(projectId, updates) {
  return apiRequest(`/api/core/projects/${projectId}`, 'PUT', updates);
}

// Banks
async function getAllBanks() {
  return apiRequest('/api/core/banks', 'GET');
}

async function getBankById(bankId) {
  return apiRequest(`/api/core/banks/${bankId}`, 'GET');
}

async function createBank(bankData) {
  return apiRequest('/api/core/banks', 'POST', bankData);
}

async function updateBank(bankId, updates) {
  return apiRequest(`/api/core/banks/${bankId}`, 'PUT', updates);
}

// Persons
async function getAllPersons() {
  return apiRequest('/api/core/persons', 'GET');
}

async function getPersonById(personId) {
  return apiRequest(`/api/core/persons/${personId}`, 'GET');
}

async function createPerson(personData) {
  return apiRequest('/api/core/persons', 'POST', personData);
}

async function updatePerson(personId, updates) {
  return apiRequest(`/api/core/persons/${personId}`, 'PUT', updates);
}

// Equity Partners
async function getAllEquityPartners() {
  return apiRequest('/api/core/equity-partners', 'GET');
}

async function getEquityPartnerById(partnerId) {
  return apiRequest(`/api/core/equity-partners/${partnerId}`, 'GET');
}

async function createEquityPartner(partnerData) {
  return apiRequest('/api/core/equity-partners', 'POST', partnerData);
}

async function updateEquityPartner(partnerId, updates) {
  return apiRequest(`/api/core/equity-partners/${partnerId}`, 'PUT', updates);
}

// ============================================================
// BANKING
// ============================================================

// Loans
async function getAllLoans() {
  return apiRequest('/api/banking/loans', 'GET');
}

async function getLoanById(loanId) {
  return apiRequest(`/api/banking/loans/${loanId}`, 'GET');
}

async function getLoansByProject(projectId) {
  return apiRequest(`/api/banking/loans/project/${projectId}`, 'GET');
}

async function createLoan(loanData) {
  return apiRequest('/api/banking/loans', 'POST', loanData);
}

async function updateLoan(loanId, updates) {
  return apiRequest(`/api/banking/loans/${loanId}`, 'PUT', updates);
}

// Participations
async function getAllParticipations() {
  return apiRequest('/api/banking/participations', 'GET');
}

async function getParticipationById(participationId) {
  return apiRequest(`/api/banking/participations/${participationId}`, 'GET');
}

async function getParticipationsByProject(projectId) {
  return apiRequest(`/api/banking/participations/project/${projectId}`, 'GET');
}

async function createParticipation(participationData) {
  return apiRequest('/api/banking/participations', 'POST', participationData);
}

async function updateParticipation(participationId, updates) {
  return apiRequest(`/api/banking/participations/${participationId}`, 'PUT', updates);
}

// Guarantees
async function getAllGuarantees() {
  return apiRequest('/api/banking/guarantees', 'GET');
}

async function getGuaranteeById(guaranteeId) {
  return apiRequest(`/api/banking/guarantees/${guaranteeId}`, 'GET');
}

async function getGuaranteesByProject(projectId) {
  return apiRequest(`/api/banking/guarantees/project/${projectId}`, 'GET');
}

async function createGuarantee(guaranteeData) {
  return apiRequest('/api/banking/guarantees', 'POST', guaranteeData);
}

async function updateGuarantee(guaranteeId, updates) {
  return apiRequest(`/api/banking/guarantees/${guaranteeId}`, 'PUT', updates);
}

// DSCR Tests
async function getAllDSCRTests() {
  return apiRequest('/api/banking/dscr-tests', 'GET');
}

async function getDSCRTestById(testId) {
  return apiRequest(`/api/banking/dscr-tests/${testId}`, 'GET');
}

async function getDSCRTestsByProject(projectId) {
  return apiRequest(`/api/banking/dscr-tests/project/${projectId}`, 'GET');
}

async function createDSCRTest(testData) {
  return apiRequest('/api/banking/dscr-tests', 'POST', testData);
}

async function updateDSCRTest(testId, updates) {
  return apiRequest(`/api/banking/dscr-tests/${testId}`, 'PUT', updates);
}

// Covenants
async function getAllCovenants() {
  return apiRequest('/api/banking/covenants', 'GET');
}

async function getCovenantById(covenantId) {
  return apiRequest(`/api/banking/covenants/${covenantId}`, 'GET');
}

async function getCovenantsByProject(projectId) {
  return apiRequest(`/api/banking/covenants/project/${projectId}`, 'GET');
}

async function createCovenant(covenantData) {
  return apiRequest('/api/banking/covenants', 'POST', covenantData);
}

async function updateCovenant(covenantId, updates) {
  return apiRequest(`/api/banking/covenants/${covenantId}`, 'PUT', updates);
}

// Liquidity Requirements
async function getAllLiquidityRequirements() {
  return apiRequest('/api/banking/liquidity-requirements', 'GET');
}

async function getLiquidityRequirementById(requirementId) {
  return apiRequest(`/api/banking/liquidity-requirements/${requirementId}`, 'GET');
}

async function getLiquidityRequirementsByProject(projectId) {
  return apiRequest(`/api/banking/liquidity-requirements/project/${projectId}`, 'GET');
}

async function createLiquidityRequirement(requirementData) {
  return apiRequest('/api/banking/liquidity-requirements', 'POST', requirementData);
}

async function updateLiquidityRequirement(requirementId, updates) {
  return apiRequest(`/api/banking/liquidity-requirements/${requirementId}`, 'PUT', updates);
}

// Bank Targets
async function getAllBankTargets() {
  return apiRequest('/api/banking/bank-targets', 'GET');
}

async function getBankTargetById(targetId) {
  return apiRequest(`/api/banking/bank-targets/${targetId}`, 'GET');
}

async function createBankTarget(targetData) {
  return apiRequest('/api/banking/bank-targets', 'POST', targetData);
}

async function updateBankTarget(targetId, updates) {
  return apiRequest(`/api/banking/bank-targets/${targetId}`, 'PUT', updates);
}

// Equity Commitments
async function getAllEquityCommitments() {
  return apiRequest('/api/banking/equity-commitments', 'GET');
}

async function getEquityCommitmentById(commitmentId) {
  return apiRequest(`/api/banking/equity-commitments/${commitmentId}`, 'GET');
}

async function getEquityCommitmentsByProject(projectId) {
  return apiRequest(`/api/banking/equity-commitments/project/${projectId}`, 'GET');
}

async function createEquityCommitment(commitmentData) {
  return apiRequest('/api/banking/equity-commitments', 'POST', commitmentData);
}

async function updateEquityCommitment(commitmentId, updates) {
  return apiRequest(`/api/banking/equity-commitments/${commitmentId}`, 'PUT', updates);
}

// ============================================================
// PIPELINE
// ============================================================

// Under Contracts
async function getAllUnderContracts() {
  return apiRequest('/api/pipeline/under-contracts', 'GET');
}

async function getUnderContractById(contractId) {
  return apiRequest(`/api/pipeline/under-contracts/${contractId}`, 'GET');
}

async function createUnderContract(contractData) {
  return apiRequest('/api/pipeline/under-contracts', 'POST', contractData);
}

async function updateUnderContract(contractId, updates) {
  return apiRequest(`/api/pipeline/under-contracts/${contractId}`, 'PUT', updates);
}

// Commercial Listed
async function getAllCommercialListed() {
  return apiRequest('/api/pipeline/commercial-listed', 'GET');
}

async function getCommercialListedById(listedId) {
  return apiRequest(`/api/pipeline/commercial-listed/${listedId}`, 'GET');
}

async function createCommercialListed(listedData) {
  return apiRequest('/api/pipeline/commercial-listed', 'POST', listedData);
}

async function updateCommercialListed(listedId, updates) {
  return apiRequest(`/api/pipeline/commercial-listed/${listedId}`, 'PUT', updates);
}

// Commercial Acreage
async function getAllCommercialAcreage() {
  return apiRequest('/api/pipeline/commercial-acreage', 'GET');
}

async function getCommercialAcreageById(acreageId) {
  return apiRequest(`/api/pipeline/commercial-acreage/${acreageId}`, 'GET');
}

async function createCommercialAcreage(acreageData) {
  return apiRequest('/api/pipeline/commercial-acreage', 'POST', acreageData);
}

async function updateCommercialAcreage(acreageId, updates) {
  return apiRequest(`/api/pipeline/commercial-acreage/${acreageId}`, 'PUT', updates);
}

// Closed Properties
async function getAllClosedProperties() {
  return apiRequest('/api/pipeline/closed-properties', 'GET');
}

async function getClosedPropertyById(propertyId) {
  return apiRequest(`/api/pipeline/closed-properties/${propertyId}`, 'GET');
}

async function createClosedProperty(propertyData) {
  return apiRequest('/api/pipeline/closed-properties', 'POST', propertyData);
}

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
//   // Core
//   getAllProjects, getProjectById, createProject, updateProject,
//   getAllBanks, getBankById, createBank, updateBank,
//   getAllPersons, getPersonById, createPerson, updatePerson,
//   getAllEquityPartners, getEquityPartnerById, createEquityPartner, updateEquityPartner,
//   // Banking
//   getAllLoans, getLoanById, getLoansByProject, createLoan, updateLoan,
//   getAllParticipations, getParticipationById, getParticipationsByProject, createParticipation, updateParticipation,
//   getAllGuarantees, getGuaranteeById, getGuaranteesByProject, createGuarantee, updateGuarantee,
//   getAllDSCRTests, getDSCRTestById, getDSCRTestsByProject, createDSCRTest, updateDSCRTest,
//   getAllCovenants, getCovenantById, getCovenantsByProject, createCovenant, updateCovenant,
//   getAllLiquidityRequirements, getLiquidityRequirementById, getLiquidityRequirementsByProject, createLiquidityRequirement, updateLiquidityRequirement,
//   getAllBankTargets, getBankTargetById, createBankTarget, updateBankTarget,
//   getAllEquityCommitments, getEquityCommitmentById, getEquityCommitmentsByProject, createEquityCommitment, updateEquityCommitment,
//   // Pipeline
//   getAllUnderContracts, getUnderContractById, createUnderContract, updateUnderContract,
//   getAllCommercialListed, getCommercialListedById, createCommercialListed, updateCommercialListed,
//   getAllCommercialAcreage, getCommercialAcreageById, createCommercialAcreage, updateCommercialAcreage,
//   getAllClosedProperties, getClosedPropertyById, createClosedProperty, updateClosedProperty,
//   // Utility
//   checkHealth, getAPIDocs
// };

// ============================================================
// USAGE EXAMPLES
// ============================================================

/*
// Example 1: Get all projects
const projects = await getAllProjects();
console.log('All projects:', projects.data);

// Example 2: Get a specific project
const project = await getProjectById(1);
console.log('Project:', project.data);

// Example 3: Create a project
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

// Example 4: Update project units
const updated = await updateProject(1, {
  Units: 250,
  Stage: "Stabilized"
});
console.log('Updated project:', updated.data);

// Example 5: Get all loans for a project
const loans = await getLoansByProject(1);
console.log('Project loans:', loans.data);

// Example 6: Get all participations for a project
const participations = await getParticipationsByProject(1);
console.log('Project participations:', participations.data);

// Example 7: Get all guarantees for a project
const guarantees = await getGuaranteesByProject(1);
console.log('Project guarantees:', guarantees.data);

// Example 8: Create a loan
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

// Example 9: Get all banks
const banks = await getAllBanks();
console.log('All banks:', banks.data);

// Example 10: Check API health
const health = await checkHealth();
console.log('API Status:', health.message);
*/
