/**
 * Stoa Group Database API Client
 * 
 * Use this file in Domo Custom Scripts to perform full CRUD operations via the Render API.
 * 
 * API URL: https://stoagroupdb.onrender.com
 * 
 * IMPORTANT: This file provides complete CRUD operations (GET, POST, PUT, DELETE)
 * for all data points in the database. All endpoints use the Render API.
 * 
 * All 16 tables have full CRUD support:
 * - Core: Projects, Banks, Persons, Equity Partners
 * - Banking: Loans, DSCR Tests, Participations, Guarantees, Covenants, 
 *            Liquidity Requirements, Bank Targets, Equity Commitments
 * - Pipeline: Under Contracts, Commercial Listed, Commercial Acreage, Closed Properties
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

async function deleteProject(projectId) {
  return apiRequest(`/api/core/projects/${projectId}`, 'DELETE');
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

async function deleteBank(bankId) {
  return apiRequest(`/api/core/banks/${bankId}`, 'DELETE');
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

async function deletePerson(personId) {
  return apiRequest(`/api/core/persons/${personId}`, 'DELETE');
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

async function deleteEquityPartner(partnerId) {
  return apiRequest(`/api/core/equity-partners/${partnerId}`, 'DELETE');
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

/**
 * Update loan by ProjectId - convenience function for Domo
 * Updates the construction loan (or first loan) for a project
 * Example: updateLoanByProject(4, { Spread: "0.75%" })
 */
async function updateLoanByProject(projectId, updates) {
  return apiRequest(`/api/banking/loans/project/${projectId}`, 'PUT', updates);
}

async function deleteLoan(loanId) {
  return apiRequest(`/api/banking/loans/${loanId}`, 'DELETE');
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

/**
 * Create participation by ProjectId - convenience function for Domo
 * Automatically finds the construction loan for the project
 * Example: createParticipationByProject(4, { BankId: 4, ParticipationPercent: "32.0%", ExposureAmount: 15998489 })
 */
async function createParticipationByProject(projectId, participationData) {
  return apiRequest(`/api/banking/participations/project/${projectId}`, 'POST', participationData);
}

async function updateParticipation(participationId, updates) {
  return apiRequest(`/api/banking/participations/${participationId}`, 'PUT', updates);
}

async function deleteParticipation(participationId) {
  return apiRequest(`/api/banking/participations/${participationId}`, 'DELETE');
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

/**
 * Create guarantee by ProjectId - convenience function for Domo
 * Automatically finds the construction loan for the project
 * Example: createGuaranteeByProject(4, { PersonId: 1, GuaranteePercent: 100, GuaranteeAmount: 45698 })
 */
async function createGuaranteeByProject(projectId, guaranteeData) {
  return apiRequest(`/api/banking/guarantees/project/${projectId}`, 'POST', guaranteeData);
}

async function updateGuarantee(guaranteeId, updates) {
  return apiRequest(`/api/banking/guarantees/${guaranteeId}`, 'PUT', updates);
}

async function deleteGuarantee(guaranteeId) {
  return apiRequest(`/api/banking/guarantees/${guaranteeId}`, 'DELETE');
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

async function deleteDSCRTest(testId) {
  return apiRequest(`/api/banking/dscr-tests/${testId}`, 'DELETE');
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

/**
 * Create covenant by ProjectId - convenience function for Domo
 * Automatically finds the construction loan for the project
 * Example: createCovenantByProject(4, { CovenantType: "Occupancy", Requirement: "50%", ProjectedValue: "76.5%" })
 */
async function createCovenantByProject(projectId, covenantData) {
  return apiRequest(`/api/banking/covenants/project/${projectId}`, 'POST', covenantData);
}

async function updateCovenant(covenantId, updates) {
  return apiRequest(`/api/banking/covenants/${covenantId}`, 'PUT', updates);
}

async function deleteCovenant(covenantId) {
  return apiRequest(`/api/banking/covenants/${covenantId}`, 'DELETE');
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

async function deleteLiquidityRequirement(requirementId) {
  return apiRequest(`/api/banking/liquidity-requirements/${requirementId}`, 'DELETE');
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

async function deleteBankTarget(targetId) {
  return apiRequest(`/api/banking/bank-targets/${targetId}`, 'DELETE');
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

async function deleteEquityCommitment(commitmentId) {
  return apiRequest(`/api/banking/equity-commitments/${commitmentId}`, 'DELETE');
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

async function deleteUnderContract(contractId) {
  return apiRequest(`/api/pipeline/under-contracts/${contractId}`, 'DELETE');
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

async function deleteCommercialListed(listedId) {
  return apiRequest(`/api/pipeline/commercial-listed/${listedId}`, 'DELETE');
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

async function deleteCommercialAcreage(acreageId) {
  return apiRequest(`/api/pipeline/commercial-acreage/${acreageId}`, 'DELETE');
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

async function deleteClosedProperty(propertyId) {
  return apiRequest(`/api/pipeline/closed-properties/${propertyId}`, 'DELETE');
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

// ============================================================
// DOMO INTEGRATION - GET, CREATE, UPDATE, DELETE
// ============================================================
// 
// For Domo Custom Scripts:
// 1. Copy this entire file into your Domo Custom Script
// 2. Use GET functions to pull/read data
// 3. Use CREATE/UPDATE/DELETE functions to modify data
// 4. All functions use the Render API: https://stoagroupdb.onrender.com
//
// 📥 GET DATA (Pull/Read):
//   getAllProjects() - Get all projects
//   getProjectById(projectId) - Get one project
//   getAllBanks() - Get all banks
//   getBankById(bankId) - Get one bank
//   getAllLoans() - Get all loans
//   getLoansByProject(projectId) - Get loans for a deal
//   getParticipationsByProject(projectId) - Get participations for a deal
//   getGuaranteesByProject(projectId) - Get guarantees for a deal
//   getCovenantsByProject(projectId) - Get covenants for a deal
//   getDSCRTestsByProject(projectId) - Get DSCR tests for a deal
//   getLiquidityRequirementsByProject(projectId) - Get liquidity requirements for a deal
//
// ⚡ UPDATE ANY FIELD BY ID - Just send the fields you want to change:
//
//   updateProject(projectId, { Units: 350, Stage: "Stabilized" })
//   updateLoan(loanId, { Spread: "0.75%", InterestRate: "SOFR + 0.75%" })
//   updateParticipation(participationId, { ExposureAmount: 16000000 })
//   updateGuarantee(guaranteeId, { GuaranteePercent: 50 })
//   updateDSCRTest(testId, { ProjectedValue: "1.25" })
//   updateCovenant(covenantId, { ProjectedValue: "80%" })
//   updateLiquidityRequirement(reqId, { TotalAmount: 6000000 })
//   updateBankTarget(targetId, { ExposureWithStoa: 50000000 })
//   updateEquityCommitment(commitmentId, { Amount: 6000000 })
//   updateUnderContract(contractId, { Price: 11000000 })
//   updateCommercialListed(listedId, { Price: 5000000 })
//   updateCommercialAcreage(acreageId, { Price: 2000000 })
//   updateClosedProperty(propertyId, { Price: 12000000 })
//
// Available CREATE functions (POST):
//   - createProject, createBank, createPerson, createEquityPartner
//   - createLoan, createParticipation, createGuarantee, createDSCRTest
//   - createCovenant, createLiquidityRequirement, createBankTarget
//   - createEquityCommitment, createUnderContract, createCommercialListed
//   - createCommercialAcreage, createClosedProperty
//
// Available GET functions (Pull/Read data):
//   - getAllProjects() - Get all projects
//   - getProjectById(projectId) - Get one project
//   - getAllBanks() - Get all banks
//   - getBankById(bankId) - Get one bank
//   - getAllPersons() - Get all persons
//   - getPersonById(personId) - Get one person
//   - getAllEquityPartners() - Get all equity partners
//   - getEquityPartnerById(partnerId) - Get one equity partner
//   - getAllLoans() - Get all loans
//   - getLoanById(loanId) - Get one loan
//   - getLoansByProject(projectId) - Get loans for a deal
//   - getAllParticipations() - Get all participations
//   - getParticipationsByProject(projectId) - Get participations for a deal
//   - getAllGuarantees() - Get all guarantees
//   - getGuaranteesByProject(projectId) - Get guarantees for a deal
//   - getAllDSCRTests() - Get all DSCR tests
//   - getDSCRTestsByProject(projectId) - Get DSCR tests for a deal
//   - getAllCovenants() - Get all covenants
//   - getCovenantsByProject(projectId) - Get covenants for a deal
//   - getAllLiquidityRequirements() - Get all liquidity requirements
//   - getLiquidityRequirementsByProject(projectId) - Get liquidity requirements for a deal
//   - getAllBankTargets() - Get all bank targets
//   - getAllEquityCommitments() - Get all equity commitments
//   - getEquityCommitmentsByProject(projectId) - Get equity commitments for a deal
//
// Available CREATE functions (POST):
//   - createProject, createBank, createPerson, createEquityPartner
//   - createLoan, createParticipation, createGuarantee, createDSCRTest
//   - createCovenant, createLiquidityRequirement, createBankTarget
//   - createEquityCommitment, createUnderContract, createCommercialListed
//   - createCommercialAcreage, createClosedProperty
//   - createParticipationByProject(projectId, data) - Add participation to deal
//   - createGuaranteeByProject(projectId, data) - Add guarantee to deal
//   - createCovenantByProject(projectId, data) - Add covenant to deal
//
// Available UPDATE functions (PUT) - Update ANY field by ID:
//   - updateProject(projectId, {field: value}) - Update any project field
//   - updateBank(bankId, {field: value}) - Update any bank field
//   - updatePerson(personId, {field: value}) - Update any person field
//   - updateEquityPartner(partnerId, {field: value}) - Update any equity partner field
//   - updateLoan(loanId, {field: value}) - Update any loan field
//   - updateLoanByProject(projectId, {field: value}) - Update loan by ProjectId
//   - updateParticipation(participationId, {field: value}) - Update any participation field
//   - updateGuarantee(guaranteeId, {field: value}) - Update any guarantee field
//   - updateDSCRTest(testId, {field: value}) - Update any DSCR test field
//   - updateCovenant(covenantId, {field: value}) - Update any covenant field
//   - updateLiquidityRequirement(reqId, {field: value}) - Update any liquidity requirement field
//   - updateBankTarget(targetId, {field: value}) - Update any bank target field
//   - updateEquityCommitment(commitmentId, {field: value}) - Update any equity commitment field
//   - updateUnderContract(contractId, {field: value}) - Update any under contract field
//   - updateCommercialListed(listedId, {field: value}) - Update any commercial listed field
//   - updateCommercialAcreage(acreageId, {field: value}) - Update any commercial acreage field
//   - updateClosedProperty(propertyId, {field: value}) - Update any closed property field
//
// Available DELETE functions:
//   - deleteProject(projectId) - Delete project
//   - deleteBank(bankId) - Delete bank
//   - deletePerson(personId) - Delete person
//   - deleteEquityPartner(partnerId) - Delete equity partner
//   - deleteLoan(loanId) - Delete loan
//   - deleteDSCRTest(testId) - Delete DSCR test
//   - deleteParticipation(participationId) - Delete participation
//   - deleteGuarantee(guaranteeId) - Delete guarantee
//   - deleteCovenant(covenantId) - Delete covenant
//   - deleteLiquidityRequirement(requirementId) - Delete liquidity requirement
//   - deleteBankTarget(targetId) - Delete bank target
//   - deleteEquityCommitment(commitmentId) - Delete equity commitment
//   - deleteUnderContract(contractId) - Delete under contract record
//   - deleteCommercialListed(listedId) - Delete commercial listed record
//   - deleteCommercialAcreage(acreageId) - Delete commercial acreage record
//   - deleteClosedProperty(propertyId) - Delete closed property record
//
// For Node.js/ES6 modules, uncomment:
// export {
//   // Core - Full CRUD
//   getAllProjects, getProjectById, createProject, updateProject, deleteProject,
//   getAllBanks, getBankById, createBank, updateBank, deleteBank,
//   getAllPersons, getPersonById, createPerson, updatePerson, deletePerson,
//   getAllEquityPartners, getEquityPartnerById, createEquityPartner, updateEquityPartner, deleteEquityPartner,
//   // Banking - Full CRUD
//   getAllLoans, getLoanById, getLoansByProject, createLoan, updateLoan, updateLoanByProject, deleteLoan,
//   getAllDSCRTests, getDSCRTestById, getDSCRTestsByProject, createDSCRTest, updateDSCRTest, deleteDSCRTest,
//   getAllParticipations, getParticipationById, getParticipationsByProject, createParticipation, createParticipationByProject, updateParticipation, deleteParticipation,
//   getAllGuarantees, getGuaranteeById, getGuaranteesByProject, createGuarantee, createGuaranteeByProject, updateGuarantee, deleteGuarantee,
//   getAllCovenants, getCovenantById, getCovenantsByProject, createCovenant, createCovenantByProject, updateCovenant, deleteCovenant,
//   getAllLiquidityRequirements, getLiquidityRequirementById, getLiquidityRequirementsByProject, createLiquidityRequirement, updateLiquidityRequirement, deleteLiquidityRequirement,
//   getAllBankTargets, getBankTargetById, createBankTarget, updateBankTarget, deleteBankTarget,
//   getAllEquityCommitments, getEquityCommitmentById, getEquityCommitmentsByProject, createEquityCommitment, updateEquityCommitment, deleteEquityCommitment,
//   // Pipeline - Full CRUD
//   getAllUnderContracts, getUnderContractById, createUnderContract, updateUnderContract, deleteUnderContract,
//   getAllCommercialListed, getCommercialListedById, createCommercialListed, updateCommercialListed, deleteCommercialListed,
//   getAllCommercialAcreage, getCommercialAcreageById, createCommercialAcreage, updateCommercialAcreage, deleteCommercialAcreage,
//   getAllClosedProperties, getClosedPropertyById, createClosedProperty, updateClosedProperty, deleteClosedProperty,
//   // Utility
//   checkHealth, getAPIDocs
// };

// ============================================================
// DOMO USAGE EXAMPLES - GET, CREATE, UPDATE, DELETE
// ============================================================

/*
// ============================================================
// GET DATA (Pull/Read)
// ============================================================

// Get all projects
const projects = await getAllProjects();
console.log(`Found ${projects.data.length} projects`);

// Get a specific project
const project = await getProjectById(4);
console.log('Project:', project.data.ProjectName);

// Get all banks
const banks = await getAllBanks();
console.log(`Found ${banks.data.length} banks`);

// Get loans for a deal
const loans = await getLoansByProject(4);
console.log(`Found ${loans.data.length} loans for project 4`);

// Get participations for a deal
const participations = await getParticipationsByProject(4);
console.log(`Found ${participations.data.length} participations`);

// Get guarantees for a deal
const guarantees = await getGuaranteesByProject(4);
console.log(`Found ${guarantees.data.length} guarantees`);

// Get covenants for a deal
const covenants = await getCovenantsByProject(4);
console.log(`Found ${covenants.data.length} covenants`);

// Get DSCR tests for a deal
const dscrTests = await getDSCRTestsByProject(4);
console.log(`Found ${dscrTests.data.length} DSCR tests`);

// Get liquidity requirements for a deal
const liquidity = await getLiquidityRequirementsByProject(4);
console.log(`Found ${liquidity.data.length} liquidity requirements`);

// ============================================================
// UPDATE ANY FIELD BY ID - Just send what you want to change
// ============================================================

// Update project - change any field
await updateProject(4, {
  Units: 350,
  Stage: "Stabilized",
  City: "Lafayette"
});

// Update loan interest rate - change any field
await updateLoan(4, {
  Spread: "0.75%",
  InterestRate: "SOFR + 0.75%",
  LoanAmount: 50000000
});

// Update loan by ProjectId (no need to know LoanId)
await updateLoanByProject(4, {
  Spread: "0.75%"
});

// Update participation - change any field
await updateParticipation(11, {
  ExposureAmount: 16000000,
  ParticipationPercent: "32.5%",
  PaidOff: false
});

// Update guarantee - change any field
await updateGuarantee(1, {
  GuaranteePercent: 50,
  GuaranteeAmount: 25000
});

// Update DSCR test - change any field
await updateDSCRTest(1, {
  ProjectedValue: "1.30",
  Requirement: 1.25,
  TestDate: "2025-12-31"
});

// Update covenant - change any field
await updateCovenant(1, {
  ProjectedValue: "80%",
  Requirement: "50%"
});

// Update liquidity requirement - change any field
await updateLiquidityRequirement(1, {
  TotalAmount: 7000000,
  LendingBankAmount: 3000000
});

// Update bank target - change any field
await updateBankTarget(1, {
  ExposureWithStoa: 50000000,
  Comments: "Updated relationship status"
});

// Update equity commitment - change any field
await updateEquityCommitment(1, {
  Amount: 6000000,
  FundingDate: "2024-06-30"
});

// Update under contract - change any field
await updateUnderContract(1, {
  Price: 11000000,
  ClosingDate: "2024-12-31"
});

// ============================================================
// CREATE NEW RECORDS
// ============================================================

// Create a new project
const newProject = await createProject({
  ProjectName: "The Heights at Picardy",
  City: "Baton Rouge",
  State: "LA",
  Units: 232,
  ProductType: "Heights",
  Stage: "Under Construction"
});
console.log('Created project ID:', newProject.data.ProjectId);

// Create a bank
const newBank = await createBank({
  BankName: "First Horizon Bank",
  City: "Memphis",
  State: "TN"
});

// Update a bank
await updateBank(1, {
  Notes: "Updated notes"
});

// ============================================================
// BANKING - CREATE & UPDATE LOANS
// ============================================================

// Create a construction loan
const newLoan = await createLoan({
  ProjectId: 1,
  BirthOrder: 12,
  LoanType: "LOC - Construction",
  Borrower: "The Waters at Settlers Trace",
  LoanPhase: "Construction",
  LenderId: 4, // b1Bank
  LoanAmount: 49996842,
  LoanClosingDate: "2022-08-24",
  IOMaturityDate: "2025-08-24",
  FixedOrFloating: "Floating",
  IndexName: "WSJ Prime",
  Spread: "0.50%",
  PermPhaseMaturity: "2028-08-24",
  PermPhaseInterestRate: "3yr US Treasury + 250 - 25yr am",
  ConstructionCompletionDate: "Feb-10",
  LeaseUpCompletedDate: "Dec-25",
  PermanentCloseDate: "2026-06-30",
  PermanentLoanAmount: 54163986
});
console.log('Created loan ID:', newLoan.data.LoanId);

// Update a loan by LoanId
await updateLoan(1, {
  LoanAmount: 50000000,
  Spread: "0.75%"
});

// Update loan by ProjectId (easier for Domo!)
// Just update the interest rate for a project without needing LoanId
await updateLoanByProject(4, {
  Spread: "0.75%",
  InterestRate: "SOFR + 0.75%"
});

// ============================================================
// BANKING - CREATE & UPDATE PARTICIPATIONS
// ============================================================

// Create a participation
const newParticipation = await createParticipation({
  ProjectId: 4,
  LoanId: 4,
  BankId: 4, // b1Bank
  ParticipationPercent: "32.0%",
  ExposureAmount: 15998489,
  PaidOff: false
});

// Create participation by ProjectId (no LoanId needed!)
await createParticipationByProject(4, {
  BankId: 4, // b1Bank
  ParticipationPercent: "32.0%",
  ExposureAmount: 15998489,
  PaidOff: false
});

// Update a participation
await updateParticipation(1, {
  ExposureAmount: 16000000,
  PaidOff: true
});

// Delete a participation
await deleteParticipation(participationId);

// Delete a loan
await deleteLoan(loanId);

// ============================================================
// BANKING - CREATE & UPDATE GUARANTEES
// ============================================================

// Create a guarantee
const newGuarantee = await createGuarantee({
  ProjectId: 4,
  LoanId: 4,
  PersonId: 1, // Toby Easterly
  GuaranteePercent: 100,
  GuaranteeAmount: 45698
});

// Create guarantee by ProjectId (no LoanId needed!)
await createGuaranteeByProject(4, {
  PersonId: 1, // Toby Easterly
  GuaranteePercent: 100,
  GuaranteeAmount: 45698
});

// Update a guarantee
await updateGuarantee(1, {
  GuaranteePercent: 50,
  GuaranteeAmount: 22849
});

// Delete a guarantee (remove personal guarantee)
await deleteGuarantee(guaranteeId);

// ============================================================
// BANKING - CREATE & UPDATE DSCR TESTS
// ============================================================

// Create a DSCR test
const newDSCRTest = await createDSCRTest({
  ProjectId: 4,
  LoanId: 4,
  TestNumber: 1,
  TestDate: "2025-09-30",
  ProjectedInterestRate: "8.00%",
  Requirement: 1.00,
  ProjectedValue: "0.41"
});

// Update a DSCR test
await updateDSCRTest(1, {
  ProjectedValue: "0.50"
});

// Delete a DSCR test
await deleteDSCRTest(testId);

// ============================================================
// BANKING - CREATE & UPDATE COVENANTS
// ============================================================

// Create a covenant
const newCovenant = await createCovenant({
  ProjectId: 4,
  LoanId: 4,
  CovenantType: "Occupancy",
  CovenantDate: "2027-03-31",
  Requirement: "50%",
  ProjectedValue: "76.5%",
  Notes: "Occupancy covenant"
});

// Create covenant by ProjectId (no LoanId needed!)
await createCovenantByProject(4, {
  CovenantType: "Occupancy",
  CovenantDate: "2027-03-31",
  Requirement: "50%",
  ProjectedValue: "76.5%",
  Notes: "Occupancy covenant"
});

// Update a covenant
await updateCovenant(1, {
  ProjectedValue: "80%"
});

// Delete a covenant
await deleteCovenant(covenantId);

// ============================================================
// BANKING - CREATE & UPDATE LIQUIDITY REQUIREMENTS
// ============================================================

// Create a liquidity requirement
const newLiquidity = await createLiquidityRequirement({
  ProjectId: 4,
  LoanId: 4,
  TotalAmount: 5000000,
  LendingBankAmount: 2000000
});

// Update a liquidity requirement
await updateLiquidityRequirement(1, {
  TotalAmount: 6000000
});

// Delete a liquidity requirement
await deleteLiquidityRequirement(requirementId);

// ============================================================
// BANKING - CREATE & UPDATE BANK TARGETS
// ============================================================

// Create a bank target
const newBankTarget = await createBankTarget({
  BankId: 6, // Wells Fargo
  AssetsText: "$1,743,283,000",
  City: "Sioux Falls",
  State: "SD",
  ExposureWithStoa: 41580000,
  ContactText: "Brady Hutka",
  Comments: "3/16/21: Showed no interest"
});

// Update a bank target
await updateBankTarget(1, {
  ExposureWithStoa: 50000000,
  Comments: "Updated comments"
});

// Delete a bank target
await deleteBankTarget(targetId);

// ============================================================
// BANKING - CREATE & UPDATE EQUITY COMMITMENTS
// ============================================================

// Create an equity commitment
const newEquityCommitment = await createEquityCommitment({
  ProjectId: 1,
  EquityPartnerId: 1,
  EquityType: "Pref",
  Amount: 5000000,
  FundingDate: "2024-01-15"
});

// Update an equity commitment
await updateEquityCommitment(1, {
  Amount: 6000000
});

// Delete an equity commitment
await deleteEquityCommitment(commitmentId);

// ============================================================
// PIPELINE - CREATE & UPDATE
// ============================================================

// Create under contract
const newUnderContract = await createUnderContract({
  ProjectId: 1,
  Location: "Baton Rouge, LA",
  Units: 300,
  Price: 10000000
});

// Update under contract
await updateUnderContract(1, {
  Price: 11000000
});

// Delete under contract
await deleteUnderContract(contractId);

// Update commercial listed
await updateCommercialListed(1, {
  Price: 5000000
});

// Delete commercial listed
await deleteCommercialListed(listedId);

// Update commercial acreage
await updateCommercialAcreage(1, {
  Acreage: 10.5
});

// Delete commercial acreage
await deleteCommercialAcreage(acreageId);

// Update closed property
await updateClosedProperty(1, {
  Price: 12000000
});

// Delete closed property
await deleteClosedProperty(propertyId);

// Delete a project
await deleteProject(projectId);

// Delete a bank
await deleteBank(bankId);

// Delete a person
await deletePerson(personId);

// Delete an equity partner
await deleteEquityPartner(partnerId);

// ============================================================
// UTILITY
// ============================================================

// Check API health
const health = await checkHealth();
console.log('API Status:', health.message);
*/
