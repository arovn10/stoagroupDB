/**
 * Complete API Client for STOA Group Database
 * 
 * Full CRUD operations for all data points across all departments
 * Use these functions in Domo Custom Scripts or any JavaScript environment
 * 
 * AUTHENTICATION REQUIRED FOR BANKING DASHBOARD WRITE OPERATIONS:
 * - All POST, PUT, DELETE operations on banking routes require authentication
 * - Use login() to get a token, then pass it to authenticated requests
 * - Store token in localStorage or sessionStorage for persistence
 * 
 * TO CHANGE API URL:
 * - Set window.API_BASE_URL before importing this file, OR
 * - Call setApiBaseUrl('your-api-url') after importing
 */

// API Base URL - can be overridden by setting window.API_BASE_URL or calling setApiBaseUrl()
let API_BASE_URL = (typeof window !== 'undefined' && window.API_BASE_URL) 
  ? window.API_BASE_URL 
  : 'https://stoagroupdb-ddre.onrender.com';

/**
 * Set the API base URL
 * @param {string} url - The base URL for the API (e.g., 'https://your-api.com' or 'http://localhost:3000')
 */
export function setApiBaseUrl(url) {
  API_BASE_URL = url;
  console.log(`API Base URL updated to: ${API_BASE_URL}`);
}

/**
 * Get the current API base URL
 * @returns {string} Current API base URL
 */
export function getApiBaseUrl() {
  return API_BASE_URL;
}

// Store authentication token (can be set via setAuthToken or login)
let authToken = null;

/**
 * Set authentication token for subsequent requests
 * @param {string} token - JWT token from login
 */
export function setAuthToken(token) {
  authToken = token;
}

/**
 * Get current authentication token
 * @returns {string|null} Current auth token or null
 */
export function getAuthToken() {
  return authToken;
}

/**
 * Clear authentication token (logout)
 */
export function clearAuthToken() {
  authToken = null;
}

/**
 * Make an API request
 * @param {string} endpoint - API endpoint path
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {object|null} data - Request body data (for POST/PUT)
 * @param {string|null} token - Optional auth token (if not provided, uses stored token)
 */
async function apiRequest(endpoint, method = 'GET', data = null, token = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // Add authorization header if token is provided or stored
    const authTokenToUse = token || authToken;
    if (authTokenToUse) {
      options.headers['Authorization'] = `Bearer ${authTokenToUse}`;
    }

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
// AUTHENTICATION - Capital Markets Users
// ============================================================

/**
 * Login with username and password
 * Returns JWT token for authenticated requests
 * 
 * @param {string} username - User email/username (e.g., 'arovner@stoagroup.com')
 * @param {string} password - User password
 * @returns {Promise<object>} { success: true, data: { token, user: {...} } }
 * 
 * @example
 * const result = await login('arovner@stoagroup.com', 'CapitalMarkets26');
 * setAuthToken(result.data.token); // Store token for future requests
 */
export async function login(username, password) {
  const result = await apiRequest('/api/auth/login', 'POST', { username, password });
  // Automatically store token if login successful
  if (result.success && result.data.token) {
    authToken = result.data.token;
  }
  return result;
}

/**
 * Verify current authentication token
 * @param {string|null} token - Optional token to verify (uses stored token if not provided)
 * @returns {Promise<object>} { success: true, data: { user: {...} } }
 */
export async function verifyAuth(token = null) {
  return apiRequest('/api/auth/verify', 'GET', null, token);
}

/**
 * Get current authenticated user info
 * @param {string|null} token - Optional token (uses stored token if not provided)
 * @returns {Promise<object>} { success: true, data: { userId, username, email, ... } }
 */
export async function getCurrentUser(token = null) {
  return apiRequest('/api/auth/me', 'GET', null, token);
}

/**
 * Logout - clears stored token
 * Note: This only clears the local token. The JWT token itself remains valid until expiration.
 */
export function logout() {
  clearAuthToken();
}

// ============================================================
// CORE SCHEMA - Projects, Banks, Persons, Equity Partners
// ============================================================

// PROJECTS
export async function getAllProjects() {
  return apiRequest('/api/core/projects');
}

export async function getProjectById(id) {
  return apiRequest(`/api/core/projects/${id}`);
}

export async function createProject(data) {
  return apiRequest('/api/core/projects', 'POST', data);
}

export async function updateProject(id, data) {
  return apiRequest(`/api/core/projects/${id}`, 'PUT', data);
}

export async function deleteProject(id) {
  return apiRequest(`/api/core/projects/${id}`, 'DELETE');
}

// BANKS
export async function getAllBanks() {
  return apiRequest('/api/core/banks');
}

export async function getBankById(id) {
  return apiRequest(`/api/core/banks/${id}`);
}

export async function createBank(data) {
  return apiRequest('/api/core/banks', 'POST', data);
}

export async function updateBank(id, data) {
  return apiRequest(`/api/core/banks/${id}`, 'PUT', data);
}

export async function deleteBank(id) {
  return apiRequest(`/api/core/banks/${id}`, 'DELETE');
}

// PERSONS
export async function getAllPersons() {
  return apiRequest('/api/core/persons');
}

export async function getPersonById(id) {
  return apiRequest(`/api/core/persons/${id}`);
}

export async function createPerson(data) {
  return apiRequest('/api/core/persons', 'POST', data);
}

export async function updatePerson(id, data) {
  return apiRequest(`/api/core/persons/${id}`, 'PUT', data);
}

export async function deletePerson(id) {
  return apiRequest(`/api/core/persons/${id}`, 'DELETE');
}

// EQUITY PARTNERS
export async function getAllEquityPartners() {
  return apiRequest('/api/core/equity-partners');
}

export async function getEquityPartnerById(id) {
  return apiRequest(`/api/core/equity-partners/${id}`);
}

export async function getEquityPartnerByIMSId(imsId) {
  return apiRequest(`/api/core/equity-partners/ims/${imsId}`);
}

export async function createEquityPartner(data) {
  return apiRequest('/api/core/equity-partners', 'POST', data);
}

export async function updateEquityPartner(id, data) {
  return apiRequest(`/api/core/equity-partners/${id}`, 'PUT', data);
}

export async function deleteEquityPartner(id) {
  return apiRequest(`/api/core/equity-partners/${id}`, 'DELETE');
}

// ============================================================
// BANKING SCHEMA
// ============================================================
// NOTE: All WRITE operations (POST, PUT, DELETE) require authentication
// Call login() first and store the token, or use setAuthToken()
// GET operations are public and don't require authentication

// LOANS
export async function getAllLoans() {
  return apiRequest('/api/banking/loans');
}

export async function getLoanById(id) {
  return apiRequest(`/api/banking/loans/${id}`);
}

export async function getLoansByProject(projectId) {
  return apiRequest(`/api/banking/loans/project/${projectId}`);
}

/**
 * Create a new loan (REQUIRES AUTHENTICATION)
 * @param {object} data - Loan data
 * @example
 * // First login and store token
 * await login('arovner@stoagroup.com', 'CapitalMarkets26');
 * // Then create loan
 * await createLoan({ ProjectId: 1, LoanPhase: 'Construction', ... });
 */
export async function createLoan(data) {
  return apiRequest('/api/banking/loans', 'POST', data);
}

/**
 * Update a loan (REQUIRES AUTHENTICATION)
 * @param {number} id - Loan ID
 * @param {object} data - Updated loan data
 */
export async function updateLoan(id, data) {
  return apiRequest(`/api/banking/loans/${id}`, 'PUT', data);
}

/**
 * Update loan by ProjectId (REQUIRES AUTHENTICATION)
 * @param {number} projectId - Project ID
 * @param {object} data - Updated loan data
 */
export async function updateLoanByProject(projectId, data) {
  return apiRequest(`/api/banking/loans/project/${projectId}`, 'PUT', data);
}

/**
 * Delete a loan (REQUIRES AUTHENTICATION)
 * @param {number} id - Loan ID
 */
export async function deleteLoan(id) {
  return apiRequest(`/api/banking/loans/${id}`, 'DELETE');
}

// DSCR TESTS
export async function getAllDSCRTests() {
  return apiRequest('/api/banking/dscr-tests');
}

export async function getDSCRTestById(id) {
  return apiRequest(`/api/banking/dscr-tests/${id}`);
}

export async function getDSCRTestsByProject(projectId) {
  return apiRequest(`/api/banking/dscr-tests/project/${projectId}`);
}

export async function createDSCRTest(data) {
  return apiRequest('/api/banking/dscr-tests', 'POST', data);
}

export async function updateDSCRTest(id, data) {
  return apiRequest(`/api/banking/dscr-tests/${id}`, 'PUT', data);
}

export async function deleteDSCRTest(id) {
  return apiRequest(`/api/banking/dscr-tests/${id}`, 'DELETE');
}

// PARTICIPATIONS
export async function getAllParticipations() {
  return apiRequest('/api/banking/participations');
}

export async function getParticipationById(id) {
  return apiRequest(`/api/banking/participations/${id}`);
}

export async function getParticipationsByProject(projectId) {
  return apiRequest(`/api/banking/participations/project/${projectId}`);
}

export async function createParticipation(data) {
  return apiRequest('/api/banking/participations', 'POST', data);
}

export async function createParticipationByProject(projectId, data) {
  return apiRequest(`/api/banking/participations/project/${projectId}`, 'POST', data);
}

export async function updateParticipation(id, data) {
  return apiRequest(`/api/banking/participations/${id}`, 'PUT', data);
}

export async function deleteParticipation(id) {
  return apiRequest(`/api/banking/participations/${id}`, 'DELETE');
}

// GUARANTEES
export async function getAllGuarantees() {
  return apiRequest('/api/banking/guarantees');
}

export async function getGuaranteeById(id) {
  return apiRequest(`/api/banking/guarantees/${id}`);
}

export async function getGuaranteesByProject(projectId) {
  return apiRequest(`/api/banking/guarantees/project/${projectId}`);
}

export async function createGuarantee(data) {
  return apiRequest('/api/banking/guarantees', 'POST', data);
}

export async function createGuaranteeByProject(projectId, data) {
  return apiRequest(`/api/banking/guarantees/project/${projectId}`, 'POST', data);
}

export async function updateGuarantee(id, data) {
  return apiRequest(`/api/banking/guarantees/${id}`, 'PUT', data);
}

export async function deleteGuarantee(id) {
  return apiRequest(`/api/banking/guarantees/${id}`, 'DELETE');
}

// COVENANTS
export async function getAllCovenants() {
  return apiRequest('/api/banking/covenants');
}

export async function getCovenantById(id) {
  return apiRequest(`/api/banking/covenants/${id}`);
}

export async function getCovenantsByProject(projectId) {
  return apiRequest(`/api/banking/covenants/project/${projectId}`);
}

export async function createCovenant(data) {
  return apiRequest('/api/banking/covenants', 'POST', data);
}

export async function createCovenantByProject(projectId, data) {
  return apiRequest(`/api/banking/covenants/project/${projectId}`, 'POST', data);
}

export async function updateCovenant(id, data) {
  return apiRequest(`/api/banking/covenants/${id}`, 'PUT', data);
}

export async function deleteCovenant(id) {
  return apiRequest(`/api/banking/covenants/${id}`, 'DELETE');
}

// LIQUIDITY REQUIREMENTS
export async function getAllLiquidityRequirements() {
  return apiRequest('/api/banking/liquidity-requirements');
}

export async function getLiquidityRequirementById(id) {
  return apiRequest(`/api/banking/liquidity-requirements/${id}`);
}

export async function getLiquidityRequirementsByProject(projectId) {
  return apiRequest(`/api/banking/liquidity-requirements/project/${projectId}`);
}

export async function createLiquidityRequirement(data) {
  return apiRequest('/api/banking/liquidity-requirements', 'POST', data);
}

export async function updateLiquidityRequirement(id, data) {
  return apiRequest(`/api/banking/liquidity-requirements/${id}`, 'PUT', data);
}

export async function deleteLiquidityRequirement(id) {
  return apiRequest(`/api/banking/liquidity-requirements/${id}`, 'DELETE');
}

// BANK TARGETS
export async function getAllBankTargets() {
  return apiRequest('/api/banking/bank-targets');
}

export async function getBankTargetById(id) {
  return apiRequest(`/api/banking/bank-targets/${id}`);
}

export async function createBankTarget(data) {
  return apiRequest('/api/banking/bank-targets', 'POST', data);
}

export async function updateBankTarget(id, data) {
  return apiRequest(`/api/banking/bank-targets/${id}`, 'PUT', data);
}

export async function deleteBankTarget(id) {
  return apiRequest(`/api/banking/bank-targets/${id}`, 'DELETE');
}

// EQUITY COMMITMENTS
export async function getAllEquityCommitments() {
  return apiRequest('/api/banking/equity-commitments');
}

export async function getEquityCommitmentById(id) {
  return apiRequest(`/api/banking/equity-commitments/${id}`);
}

export async function getEquityCommitmentsByProject(projectId) {
  return apiRequest(`/api/banking/equity-commitments/project/${projectId}`);
}

export async function createEquityCommitment(data) {
  return apiRequest('/api/banking/equity-commitments', 'POST', data);
}

export async function updateEquityCommitment(id, data) {
  return apiRequest(`/api/banking/equity-commitments/${id}`, 'PUT', data);
}

export async function deleteEquityCommitment(id) {
  return apiRequest(`/api/banking/equity-commitments/${id}`, 'DELETE');
}

// ============================================================
// PIPELINE SCHEMA
// ============================================================

// UNDER CONTRACTS
export async function getAllUnderContracts() {
  return apiRequest('/api/pipeline/under-contracts');
}

export async function getUnderContractById(id) {
  return apiRequest(`/api/pipeline/under-contracts/${id}`);
}

export async function createUnderContract(data) {
  return apiRequest('/api/pipeline/under-contracts', 'POST', data);
}

export async function updateUnderContract(id, data) {
  return apiRequest(`/api/pipeline/under-contracts/${id}`, 'PUT', data);
}

export async function deleteUnderContract(id) {
  return apiRequest(`/api/pipeline/under-contracts/${id}`, 'DELETE');
}

// COMMERCIAL LISTED
export async function getAllCommercialListed() {
  return apiRequest('/api/pipeline/commercial-listed');
}

export async function getCommercialListedById(id) {
  return apiRequest(`/api/pipeline/commercial-listed/${id}`);
}

export async function createCommercialListed(data) {
  return apiRequest('/api/pipeline/commercial-listed', 'POST', data);
}

export async function updateCommercialListed(id, data) {
  return apiRequest(`/api/pipeline/commercial-listed/${id}`, 'PUT', data);
}

export async function deleteCommercialListed(id) {
  return apiRequest(`/api/pipeline/commercial-listed/${id}`, 'DELETE');
}

// COMMERCIAL ACREAGE
export async function getAllCommercialAcreage() {
  return apiRequest('/api/pipeline/commercial-acreage');
}

export async function getCommercialAcreageById(id) {
  return apiRequest(`/api/pipeline/commercial-acreage/${id}`);
}

export async function createCommercialAcreage(data) {
  return apiRequest('/api/pipeline/commercial-acreage', 'POST', data);
}

export async function updateCommercialAcreage(id, data) {
  return apiRequest(`/api/pipeline/commercial-acreage/${id}`, 'PUT', data);
}

export async function deleteCommercialAcreage(id) {
  return apiRequest(`/api/pipeline/commercial-acreage/${id}`, 'DELETE');
}

// CLOSED PROPERTIES
export async function getAllClosedProperties() {
  return apiRequest('/api/pipeline/closed-properties');
}

export async function getClosedPropertyById(id) {
  return apiRequest(`/api/pipeline/closed-properties/${id}`);
}

export async function createClosedProperty(data) {
  return apiRequest('/api/pipeline/closed-properties', 'POST', data);
}

export async function updateClosedProperty(id, data) {
  return apiRequest(`/api/pipeline/closed-properties/${id}`, 'PUT', data);
}

export async function deleteClosedProperty(id) {
  return apiRequest(`/api/pipeline/closed-properties/${id}`, 'DELETE');
}

// ============================================================
// IMS INVESTOR HELPER FUNCTIONS (Legacy - kept for compatibility)
// ============================================================

/**
 * Get investor name from IMS Investor Profile ID
 */
export async function getInvestorNameFromIMSId(imsId) {
  if (!imsId || typeof imsId !== 'string') return null;
  
  try {
    const result = await getEquityPartnerByIMSId(imsId);
    if (result.success && result.data) {
      return result.data.PartnerName;
    }
    return null;
  } catch (error) {
    console.error(`Error looking up IMS ID ${imsId}:`, error);
    return null;
  }
}

/**
 * Resolve investor name - handles both IMS IDs and actual names
 */
export async function resolveInvestorName(investorValue) {
  if (!investorValue) return null;
  
  const str = String(investorValue).trim();
  
  // If it's all digits and at least 6 characters, treat as IMS ID
  if (/^\d{6,}$/.test(str)) {
    const name = await getInvestorNameFromIMSId(str);
    return name || str; // Return ID if name not found
  }
  
  // Otherwise, return as-is (it's already a name)
  return str;
}

/**
 * Bulk resolve investor names from an array of values
 */
export async function bulkResolveInvestorNames(investorValues) {
  const mapping = {};
  const uniqueValues = [...new Set(investorValues)];
  
  // Process in parallel for better performance
  const promises = uniqueValues.map(async (value) => {
    const resolved = await resolveInvestorName(value);
    mapping[value] = resolved;
  });
  
  await Promise.all(promises);
  return mapping;
}

/**
 * Transform a dataset row to resolve investor names
 */
export async function resolveRowInvestorName(row, investorColumn = 'Investor') {
  const investorValue = row[investorColumn];
  const resolvedName = await resolveInvestorName(investorValue);
  
  return {
    ...row,
    [investorColumn]: resolvedName,
    InvestorName: resolvedName,
    OriginalInvestorValue: investorValue
  };
}

/**
 * Transform entire dataset to resolve investor names
 */
export async function resolveDatasetInvestorNames(dataset, investorColumn = 'Investor') {
  if (!Array.isArray(dataset) || dataset.length === 0) return dataset;
  
  // Get unique investor values first
  const investorValues = [...new Set(dataset.map(row => row[investorColumn]).filter(Boolean))];
  
  // Bulk resolve all unique values
  const nameMapping = await bulkResolveInvestorNames(investorValues);
  
  // Apply mapping to dataset
  return dataset.map(row => ({
    ...row,
    [investorColumn]: nameMapping[row[investorColumn]] || row[investorColumn],
    InvestorName: nameMapping[row[investorColumn]] || row[investorColumn],
    OriginalInvestorValue: row[investorColumn]
  }));
}

// ============================================================
// USAGE EXAMPLES
// ============================================================

/*
// Example 1: Get all projects
const projects = await getAllProjects();
console.log('Projects:', projects.data);

// Example 2: Create a new project
const newProject = await createProject({
  ProjectName: "The Heights at Picardy",
  City: "Baton Rouge",
  State: "LA",
  Region: "Gulf Coast",
  Units: 232,
  ProductType: "Heights",
  Stage: "Started"
});
console.log('Created:', newProject.data);

// Example 3: Update a project
const updated = await updateProject(1, {
  Units: 240,
  Stage: "Stabilized"
});
console.log('Updated:', updated.data);

// Example 4: Get all loans for a project
const loans = await getLoansByProject(1);
console.log('Loans:', loans.data);

// Example 5: Create an equity commitment
const commitment = await createEquityCommitment({
  ProjectId: 1,
  EquityPartnerId: 5,
  Amount: 1000000,
  FundingDate: "2024-01-15"
});
console.log('Created commitment:', commitment.data);

// Example 6: Delete a record
await deleteEquityCommitment(123);
console.log('Deleted');

// Example 7: Get all data for a deal
const projectId = 1;
const [project, loans, commitments, participations] = await Promise.all([
  getProjectById(projectId),
  getLoansByProject(projectId),
  getEquityCommitmentsByProject(projectId),
  getParticipationsByProject(projectId)
]);
console.log('Deal Data:', {
  project: project.data,
  loans: loans.data,
  commitments: commitments.data,
  participations: participations.data
});

// ============================================================
// AUTHENTICATION EXAMPLES - Capital Markets Users
// ============================================================

// Example 8: Login and authenticate for banking dashboard edits
// Step 1: Login with username and password
const loginResult = await login('arovner@stoagroup.com', 'CapitalMarkets26');
if (loginResult.success) {
  console.log('✅ Logged in as:', loginResult.data.user.username);
  // Token is automatically stored for future requests
  // You can also manually store: setAuthToken(loginResult.data.token);
  
  // Step 2: Now you can make authenticated banking write operations
  const loanData = {
    ProjectId: 1,
    LoanPhase: 'Construction',
    LoanAmount: 5000000,
    LoanClosingDate: '2024-01-15',
    FinancingStage: 'Construction Loan'
  };
  
  const createResult = await createLoan(loanData);
  console.log('✅ Loan created:', createResult.data);
  
  // Step 3: Update operations also work automatically with stored token
  await updateLoan(createResult.data.LoanId, { LoanAmount: 5500000 });
  
  // Step 4: Verify token is still valid
  const verifyResult = await verifyAuth();
  console.log('✅ Current user:', verifyResult.data.user);
  
  // Step 5: Get current user info
  const userInfo = await getCurrentUser();
  console.log('✅ User details:', userInfo.data);
  
  // Step 6: Logout (clears stored token)
  logout();
}

// Example 9: Storing token in browser localStorage (for web apps)
// After login, store token in localStorage for persistence
const loginResult2 = await login('Mmurray@stoagroup.com', 'CapitalMarkets26');
if (loginResult2.success) {
  localStorage.setItem('authToken', loginResult2.data.token);
  setAuthToken(loginResult2.data.token);
}

// On page load, restore token from localStorage
const savedToken = localStorage.getItem('authToken');
if (savedToken) {
  setAuthToken(savedToken);
  // Verify token is still valid
  try {
    await verifyAuth();
    console.log('✅ Token restored and valid');
  } catch (error) {
    // Token expired, clear it
    localStorage.removeItem('authToken');
    clearAuthToken();
    console.log('❌ Token expired, please login again');
  }
}

// NOTE: All banking write operations (POST, PUT, DELETE) require authentication.
// GET operations are public and don't require authentication.
// If you try to make a write operation without being authenticated, you'll get a 401 error.
*/
