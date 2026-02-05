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
 * FINANCING TYPE SEPARATION:
 * - All banking entities (except Equity Commitments) support FinancingType
 * - FinancingType must be 'Construction' or 'Permanent' to separate financing data
 * - Defaults to 'Construction' if not specified
 * - Always specify FinancingType when creating/updating banking records
 * 
 * TO CHANGE API URL:
 * - Set window.API_BASE_URL before loading this file, OR
 * - Call setApiBaseUrl('your-api-url') after loading
 * 
 * USAGE:
 * - In browser: <script src="api-client.js"></script>
 * - Then use: API.getAllProjects(), API.login(), etc.
 */

(function(global) {
  'use strict';

  // API Base URL - can be overridden by setting window.API_BASE_URL or calling setApiBaseUrl()
  let API_BASE_URL = (typeof window !== 'undefined' && window.API_BASE_URL) 
    ? window.API_BASE_URL 
    : 'https://stoagroupdb-ddre.onrender.com';

  // Store authentication token (can be set via setAuthToken or login)
  let authToken = null;

  // Create API namespace object
  const API = {};

  /**
   * Set the API base URL
   * @param {string} url - The base URL for the API (e.g., 'https://your-api.com' or 'http://localhost:3000')
   */
  function setApiBaseUrl(url) {
    API_BASE_URL = url;
    console.log(`API Base URL updated to: ${API_BASE_URL}`);
  }

  /**
   * Get the current API base URL
   * @returns {string} Current API base URL
   */
  function getApiBaseUrl() {
    return API_BASE_URL;
  }

  /**
   * Set authentication token for subsequent requests
   * @param {string} token - JWT token from login
   */
  function setAuthToken(token) {
    authToken = token;
  }

  /**
   * Get current authentication token
   * @returns {string|null} Current auth token or null
   */
  function getAuthToken() {
    return authToken;
  }

  /**
   * Clear authentication token (logout)
   */
  function clearAuthToken() {
    authToken = null;
  }

  // Expose these functions
  API.setApiBaseUrl = setApiBaseUrl;
  API.getApiBaseUrl = getApiBaseUrl;
  API.setAuthToken = setAuthToken;
  API.getAuthToken = getAuthToken;
  API.clearAuthToken = clearAuthToken;

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
  async function login(username, password) {
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
  async function verifyAuth(token = null) {
  return apiRequest('/api/auth/verify', 'GET', null, token);
}

/**
 * Get current authenticated user info
 * @param {string|null} token - Optional token (uses stored token if not provided)
 * @returns {Promise<object>} { success: true, data: { userId, username, email, ... } }
 */
  async function getCurrentUser(token = null) {
  return apiRequest('/api/auth/me', 'GET', null, token);
}

/**
 * Logout - clears stored token
 * Note: This only clears the local token. The JWT token itself remains valid until expiration.
 */
  function logout() {
  clearAuthToken();
}

/**
 * Domo SSO login – sign in using Domo user email (no password).
 * Backend looks up auth.[User] by email and returns same JWT as /api/auth/login.
 * @param {{ email: string, name?: string, userId?: string }} domoUser - From getDomoCurrentUser()
 * @returns {Promise<object>} { success: true, data: { token, user: {...} } } same shape as login
 */
  async function loginWithDomo(domoUser) {
  if (!domoUser || !domoUser.email || !String(domoUser.email).trim()) {
    return { success: false, error: { message: 'Email is required for Domo SSO' } };
  }
  const body = {
    email: String(domoUser.email).trim(),
    name: domoUser.name ? String(domoUser.name).trim() : undefined,
    userId: domoUser.userId ? String(domoUser.userId).trim() : undefined
  };
  const result = await apiRequest('/api/auth/domo', 'POST', body);
  if (result.success && result.data && result.data.token) {
    authToken = result.data.token;
  }
  return result;
}

// ============================================================
// CORE SCHEMA - Projects, Banks, Persons, Equity Partners
// ============================================================

// PROJECTS
  async function getAllProjects() {
  return apiRequest('/api/core/projects');
}

  async function getProjectById(id) {
  return apiRequest(`/api/core/projects/${id}`);
}

  async function createProject(data) {
  return apiRequest('/api/core/projects', 'POST', data);
}

  async function updateProject(id, data) {
  return apiRequest(`/api/core/projects/${id}`, 'PUT', data);
}

  async function deleteProject(id) {
  return apiRequest(`/api/core/projects/${id}`, 'DELETE');
}

// BANKS
  async function getAllBanks() {
  return apiRequest('/api/core/banks');
}

  async function getBankById(id) {
  return apiRequest(`/api/core/banks/${id}`);
}

  async function createBank(data) {
  return apiRequest('/api/core/banks', 'POST', data);
}

  async function updateBank(id, data) {
  return apiRequest(`/api/core/banks/${id}`, 'PUT', data);
}

  async function deleteBank(id) {
  return apiRequest(`/api/core/banks/${id}`, 'DELETE');
}

// PERSONS
  /**
   * Unified contact book: each individual appears once (not once as individual investor and again as investor rep).
   * Returns Persons plus Individual equity partners with no linked Person. Each row has PersonId and/or EquityPartnerId, FullName, Email, Phone, Title, Notes, IsInvestorRep, IsIndividualInvestor.
   * @returns {Promise<object>} { success: true, data: Array<{ PersonId?, EquityPartnerId?, FullName, Email?, Phone?, Title?, Notes?, IsInvestorRep, IsIndividualInvestor }> }
   */
  async function getContactBook() {
  return apiRequest('/api/core/contacts');
}

  async function getAllPersons() {
  return apiRequest('/api/core/persons');
}

  async function getPersonById(id) {
  return apiRequest(`/api/core/persons/${id}`);
}

  async function createPerson(data) {
  return apiRequest('/api/core/persons', 'POST', data);
}

  async function updatePerson(id, data) {
  return apiRequest(`/api/core/persons/${id}`, 'PUT', data);
}

  async function deletePerson(id) {
  return apiRequest(`/api/core/persons/${id}`, 'DELETE');
}

// PRE-CON MANAGERS
/**
 * Get all Pre-Con Managers
 * @returns {Promise<object>} { success: true, data: [{ PreConManagerId, FullName, Email, Phone, CreatedAt, UpdatedAt }] }
 */
  async function getAllPreConManagers() {
  return apiRequest('/api/core/precon-managers');
}

/**
 * Get Pre-Con Manager by ID
 * @param {number} id - Pre-Con Manager ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getPreConManagerById(id) {
  return apiRequest(`/api/core/precon-managers/${id}`);
}

/**
 * Create a new Pre-Con Manager (REQUIRES AUTHENTICATION)
 * @param {object} data - { FullName, Email?, Phone? }
 * @returns {Promise<object>} { success: true, data: { PreConManagerId, FullName, Email, Phone, CreatedAt, UpdatedAt } }
 */
  async function createPreConManager(data) {
  return apiRequest('/api/core/precon-managers', 'POST', data);
}

/**
 * Update a Pre-Con Manager (REQUIRES AUTHENTICATION)
 * @param {number} id - Pre-Con Manager ID
 * @param {object} data - { FullName?, Email?, Phone? }
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function updatePreConManager(id, data) {
  return apiRequest(`/api/core/precon-managers/${id}`, 'PUT', data);
}

/**
 * Delete a Pre-Con Manager (REQUIRES AUTHENTICATION)
 * @param {number} id - Pre-Con Manager ID
 * @returns {Promise<object>} { success: true, message: 'Pre-Con Manager deleted successfully' }
 * @note Will fail if Pre-Con Manager is referenced by any DealPipeline records
 */
  async function deletePreConManager(id) {
  return apiRequest(`/api/core/precon-managers/${id}`, 'DELETE');
}

// EQUITY PARTNERS
/**
 * Get all equity partners
 * @returns {Promise<object>} { success: true, data: [{ EquityPartnerId, PartnerName, InvestorRepId, InvestorRepName, InvestorRepEmail, InvestorRepPhone, IMSInvestorProfileId, Notes, ... }] }
 * @note InvestorRepName, InvestorRepEmail, InvestorRepPhone are populated from core.Person via InvestorRepId
 */
  async function getAllEquityPartners() {
  return apiRequest('/api/core/equity-partners');
}

/**
 * Get equity partner by ID
 * @param {number} id - Equity Partner ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getEquityPartnerById(id) {
  return apiRequest(`/api/core/equity-partners/${id}`);
}

/**
 * Get equity partner by IMS Investor Profile ID
 * @param {string} imsId - IMS Investor Profile ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getEquityPartnerByIMSId(imsId) {
  return apiRequest(`/api/core/equity-partners/ims/${imsId}`);
}

/**
 * Create a new equity partner (REQUIRES AUTHENTICATION)
 * @param {object} data - { PartnerName, PartnerType?, InvestorRepId?, IMSInvestorProfileId?, Notes? }
 * @param {string} [data.PartnerType] - 'Entity' or 'Individual' (e.g., 'Entity' for LLC/Corp, 'Individual' for person)
 * @param {number} [data.InvestorRepId] - PersonId from core.Person table (investor representative contact)
 * @returns {Promise<object>} { success: true, data: { EquityPartnerId, PartnerName, InvestorRepId, InvestorRepName, InvestorRepEmail, InvestorRepPhone, ... } }
 * @note InvestorRepName, InvestorRepEmail, InvestorRepPhone are populated from core.Person via InvestorRepId
 * @example
 * // Create an entity (company/LLC) with investor rep
 * await createEquityPartner({
 *   PartnerName: 'ABC Capital LLC',
 *   PartnerType: 'Entity',
 *   InvestorRepId: 5  // PersonId from core.Person table
 * });
 * 
 * // Create an individual without investor rep
 * await createEquityPartner({
 *   PartnerName: 'Jane Smith',
 *   PartnerType: 'Individual'
 * });
 */
  async function createEquityPartner(data) {
  return apiRequest('/api/core/equity-partners', 'POST', data);
}

/**
 * Update an equity partner (REQUIRES AUTHENTICATION)
 * @param {number} id - Equity Partner ID
 * @param {object} data - Fields to update { PartnerName?, PartnerType?, InvestorRepId?, IMSInvestorProfileId?, Notes? }
 * @param {string} [data.PartnerType] - 'Entity' or 'Individual'
 * @param {number} [data.InvestorRepId] - PersonId from core.Person table (investor representative contact)
 * @returns {Promise<object>} { success: true, data: { EquityPartnerId, PartnerName, InvestorRepId, InvestorRepName, InvestorRepEmail, InvestorRepPhone, ... } }
 * @note InvestorRepName, InvestorRepEmail, InvestorRepPhone are populated from core.Person via InvestorRepId
 * @example
 * await updateEquityPartner(123, {
 *   PartnerType: 'Entity',
 *   InvestorRepId: 7  // PersonId from core.Person table
 * });
 */
  async function updateEquityPartner(id, data) {
  return apiRequest(`/api/core/equity-partners/${id}`, 'PUT', data);
}

/**
 * Delete an equity partner (REQUIRES AUTHENTICATION)
 * @param {number} id - Equity Partner ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteEquityPartner(id) {
  return apiRequest(`/api/core/equity-partners/${id}`, 'DELETE');
}

// PRODUCT TYPES (CORE Reference Table)
/**
 * Get all active product types (for dropdowns)
 * @returns {Promise<object>} { success: true, data: [{ ProductTypeId, ProductTypeName, DisplayOrder, ... }] }
 */
  async function getAllProductTypes() {
  return apiRequest('/api/core/product-types');
}

/**
 * Get product type by ID
 * @param {number} id - Product Type ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getProductTypeById(id) {
  return apiRequest(`/api/core/product-types/${id}`);
}

/**
 * Create a new product type
 * @param {object} data - { ProductTypeName, DisplayOrder?, IsActive?, Notes? }
 * @returns {Promise<object>} { success: true, data: {...} }
 * @example
 * await createProductType({ ProductTypeName: 'Custom Type', DisplayOrder: 5 });
 */
  async function createProductType(data) {
  return apiRequest('/api/core/product-types', 'POST', data);
}

/**
 * Update a product type
 * @param {number} id - Product Type ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function updateProductType(id, data) {
  return apiRequest(`/api/core/product-types/${id}`, 'PUT', data);
}

/**
 * Delete (deactivate) a product type
 * Note: This performs a soft delete (sets IsActive = 0)
 * @param {number} id - Product Type ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteProductType(id) {
  return apiRequest(`/api/core/product-types/${id}`, 'DELETE');
}

// REGIONS (CORE Reference Table)
/**
 * Get all active regions (for dropdowns)
 * @returns {Promise<object>} { success: true, data: [{ RegionId, RegionName, DisplayOrder, ... }] }
 */
  async function getAllRegions() {
  return apiRequest('/api/core/regions');
}

/**
 * Get region by ID
 * @param {number} id - Region ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getRegionById(id) {
  return apiRequest(`/api/core/regions/${id}`);
}

/**
 * Create a new region
 * @param {object} data - { RegionName, DisplayOrder?, IsActive?, Notes? }
 * @returns {Promise<object>} { success: true, data: {...} }
 * @example
 * await createRegion({ RegionName: 'Southeast', DisplayOrder: 3 });
 */
  async function createRegion(data) {
  return apiRequest('/api/core/regions', 'POST', data);
}

/**
 * Update a region
 * @param {number} id - Region ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function updateRegion(id, data) {
  return apiRequest(`/api/core/regions/${id}`, 'PUT', data);
}

/**
 * Delete (deactivate) a region
 * Note: This performs a soft delete (sets IsActive = 0)
 * @param {number} id - Region ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteRegion(id) {
  return apiRequest(`/api/core/regions/${id}`, 'DELETE');
}

// ============================================================
// BANKING SCHEMA
// ============================================================
// NOTE: All WRITE operations (POST, PUT, DELETE) require authentication
// Call login() first and store the token, or use setAuthToken()
// GET operations are public and don't require authentication

// LOANS
  async function getAllLoans() {
  return apiRequest('/api/banking/loans');
}

  async function getLoanById(id) {
  return apiRequest(`/api/banking/loans/${id}`);
}

  async function getLoansByProject(projectId) {
  return apiRequest(`/api/banking/loans/project/${projectId}`);
}

/**
 * Get participation total vs loan amount for a loan (for mismatch flag)
 * @param {number} id - Loan ID
 * @returns {Promise<object>} { success: true, data: { loanId, loanAmount, participationTotal, participationActiveTotal, mismatch } }
 */
  async function getLoanParticipationSummary(id) {
  return apiRequest(`/api/banking/loans/${id}/participation-summary`);
}

/**
 * Create a new loan (REQUIRES AUTHENTICATION)
 * @param {object} data - Loan data
 * @param {number} data.ProjectId - Required: Project ID
 * @param {string} data.LoanPhase - Required: 'Construction', 'Permanent', 'MiniPerm', 'Land', or 'Other'
 * @param {string} [data.FixedOrFloating] - Selection: 'Fixed' or 'Floating' (NULL allowed)
 * @param {string} [data.IndexName] - For Construction loans: 'Prime' or 'SOFR' (NULL allowed for Fixed rates)
 * @param {string} [data.Spread] - Spread value (e.g., "2.75%", "0.50%")
 * @param {string} [data.InterestRate] - Interest rate (for fixed rates or complex expressions)
 * @param {string} [data.InterestRateFloor] - I/O rate floor (e.g. "0%")
 * @param {string} [data.InterestRateCeiling] - I/O rate ceiling (e.g. "12%")
 * @param {string} [data.ConversionDate] - I/O to P&I conversion date (YYYY-MM-DD)
 * @param {number} [data.LoanAmount] - Loan amount
 * @param {string} [data.LoanClosingDate] - Loan closing date (YYYY-MM-DD)
 * @param {string} [data.MaturityDate] - Maturity date (YYYY-MM-DD)
 * @param {number} [data.LenderId] - Bank/Lender ID (FK to core.Bank)
 * @param {string} [data.LoanType] - Loan type (e.g., "LOC - Construction", "RLOC - Land")
 * @param {string} [data.Borrower] - Borrower name
 * @param {string} [data.FinancingStage] - Financing stage
 * @param {number} [data.BirthOrder] - Birth order from Banking Dashboard
 * @param {string} [data.ConstructionCompletionDate] - Target completion date (text: "May-23", "Dec-25")
 * @param {string} [data.ConstructionCompletionSource] - Source of completion date (e.g. "Procore", "Manual") for UI label
 * @param {string} [data.LeaseUpCompletedDate] - Target lease-up date (text: "Apr-25")
 * @param {string} [data.IOMaturityDate] - I/O maturity date (YYYY-MM-DD)
 * @param {string} [data.MiniPermMaturity] - Mini-perm maturity date (YYYY-MM-DD)
 * @param {string} [data.MiniPermInterestRate] - Mini-perm interest rate
 * @param {string} [data.MiniPermFixedOrFloating] - Mini-perm: 'Fixed' or 'Floating'
 * @param {string} [data.MiniPermIndex] - Mini-perm index (e.g. "SOFR", "Prime")
 * @param {string} [data.MiniPermSpread] - Mini-perm spread (e.g. "2.50%")
 * @param {string} [data.MiniPermRateFloor] - Mini-perm rate floor
 * @param {string} [data.MiniPermRateCeiling] - Mini-perm rate ceiling
 * @param {boolean} [data.IsActive] - Loan is active (default true)
 * @param {boolean} [data.IsPrimary] - Loan is primary for project (default false)
 * @param {string} [data.PermPhaseMaturity] - Perm-phase maturity date (YYYY-MM-DD)
 * @param {string} [data.PermPhaseInterestRate] - Perm-phase interest rate
 * @param {string} [data.PermanentCloseDate] - Permanent close date (YYYY-MM-DD)
 * @param {number} [data.PermanentLoanAmount] - Permanent loan amount
 * @param {number} [data.LoanTypeId] - FK to banking.LoanType (wizard: HUD, Conventional, etc.)
 * @param {string} [data.LoanCategory] - 'Refinance' | 'Restructure' | 'Completely New'
 * @param {string} [data.Notes] - Notes
 * @returns {Promise<object>} { success: true, data: { LoanId, LoanTypeName, ... } }
 * @example
 * // First login and store token
 * await login('arovner@stoagroup.com', 'CapitalMarkets26');
 * // Then create loan
 * await createLoan({ 
 *   ProjectId: 1, 
 *   LoanPhase: 'Construction',
 *   FixedOrFloating: 'Floating',
 *   IndexName: 'SOFR',
 *   Spread: '2.75%',
 *   LoanAmount: 5000000
 * });
 */
  async function createLoan(data) {
  return apiRequest('/api/banking/loans', 'POST', data);
}

/**
 * Update a loan (REQUIRES AUTHENTICATION)
 * @param {number} id - Loan ID
 * @param {object} data - Updated loan data (only include fields to update)
 * @param {string} [data.FixedOrFloating] - Selection: 'Fixed' or 'Floating' (NULL allowed)
 * @param {string} [data.IndexName] - For Construction loans: 'Prime' or 'SOFR' (NULL allowed for Fixed rates)
 * @param {string} [data.Spread] - Spread value (e.g., "2.75%", "0.50%")
 * @param {string} [data.InterestRate] - Interest rate
 * @param {string} [data.InterestRateFloor] - I/O rate floor
 * @param {string} [data.InterestRateCeiling] - I/O rate ceiling
 * @param {string} [data.ConversionDate] - I/O to P&I conversion date (YYYY-MM-DD)
 * @param {number} [data.LoanAmount] - Loan amount
 * @param {string} [data.LoanClosingDate] - Loan closing date (YYYY-MM-DD)
 * @param {string} [data.MaturityDate] - Maturity date (YYYY-MM-DD)
 * @param {number} [data.LenderId] - Bank/Lender ID
 * @param {string} [data.LoanPhase] - Loan phase
 * @param {string} [data.LoanType] - Loan type
 * @param {string} [data.Borrower] - Borrower name
 * @param {string} [data.FinancingStage] - Financing stage
 * @param {number} [data.BirthOrder] - Birth order
 * @param {string} [data.ConstructionCompletionDate] - Target completion date
 * @param {string} [data.ConstructionCompletionSource] - Source of completion date (e.g. "Procore", "Manual")
 * @param {string} [data.LeaseUpCompletedDate] - Target lease-up date
 * @param {string} [data.IOMaturityDate] - I/O maturity date
 * @param {string} [data.MiniPermMaturity] - Mini-perm maturity date
 * @param {string} [data.MiniPermInterestRate] - Mini-perm interest rate
 * @param {string} [data.MiniPermFixedOrFloating] - Mini-perm: 'Fixed' or 'Floating'
 * @param {string} [data.MiniPermIndex] - Mini-perm index
 * @param {string} [data.MiniPermSpread] - Mini-perm spread
 * @param {string} [data.MiniPermRateFloor] - Mini-perm rate floor
 * @param {string} [data.MiniPermRateCeiling] - Mini-perm rate ceiling
 * @param {string} [data.PermPhaseMaturity] - Perm-phase maturity date
 * @param {string} [data.PermPhaseInterestRate] - Perm-phase interest rate
 * @param {string} [data.PermanentCloseDate] - Permanent close date
 * @param {number} [data.PermanentLoanAmount] - Permanent loan amount
 * @param {boolean} [data.IsActive] - Loan is active (if true, other loans on project set inactive)
 * @param {boolean} [data.IsPrimary] - Loan is primary for project
 * @param {number} [data.LoanTypeId] - FK to banking.LoanType
 * @param {string} [data.LoanCategory] - 'Refinance' | 'Restructure' | 'Completely New'
 * @param {string} [data.Notes] - Notes
 * @returns {Promise<object>} { success: true, data: { LoanId, LoanTypeName, ... } }
 * @example
 * await updateLoan(1, { 
 *   FixedOrFloating: 'Floating',
 *   IndexName: 'Prime',
 *   Spread: '2.50%'
 * });
 */
  async function updateLoan(id, data) {
  return apiRequest(`/api/banking/loans/${id}`, 'PUT', data);
}

/**
 * Update loan by ProjectId (REQUIRES AUTHENTICATION)
 * Finds and updates the loan for a project based on LoanPhase (Construction or Permanent)
 * IMPORTANT: Always specify LoanPhase to ensure you're updating the correct loan!
 * @param {number} projectId - Project ID
 * @param {object} data - Updated loan data (only include fields to update)
 * @param {string} [data.LoanPhase] - 'Construction' or 'Permanent' (defaults to 'Construction' if not provided)
 * @param {number} [data.LenderId] - Bank/Lender ID (FK to core.Bank)
 * @param {number} [data.LoanAmount] - Loan amount
 * @param {string} [data.FixedOrFloating] - Selection: 'Fixed' or 'Floating' (NULL allowed)
 * @param {string} [data.IndexName] - For Construction loans: 'Prime' or 'SOFR' (NULL allowed for Fixed rates)
 * @param {string} [data.Spread] - Spread value
 * @returns {Promise<object>} { success: true, data: { LoanId, LoanPhase, ... } }
 * @example
 * // Update construction loan bank and amount
 * await updateLoanByProject(1, { 
 *   LoanPhase: 'Construction',
 *   LenderId: 5,
 *   LoanAmount: 5000000
 * });
 * 
 * // Update permanent loan bank and amount
 * await updateLoanByProject(1, { 
 *   LoanPhase: 'Permanent',
 *   LenderId: 7,
 *   LoanAmount: 4500000
 * });
 */
  async function updateLoanByProject(projectId, data) {
  return apiRequest(`/api/banking/loans/project/${projectId}`, 'PUT', data);
}

/**
 * Delete a loan (REQUIRES AUTHENTICATION)
 * @param {number} id - Loan ID
 */
  async function deleteLoan(id) {
  return apiRequest(`/api/banking/loans/${id}`, 'DELETE');
}

/**
 * Copy covenants, guarantees, and/or equity commitments from one loan to another (Loan Creation Wizard).
 * Target and source must be different and on the same project. REQUIRES AUTHENTICATION.
 * @param {number} targetLoanId - New loan ID (destination)
 * @param {number} sourceLoanId - Existing loan ID (source)
 * @param {object} options - { copyCovenants: boolean, copyGuarantees: boolean, copyEquityCommitments: boolean }
 * @returns {Promise<object>} { success: true, data: { copyCovenants: number, copyGuarantees: number, copyEquityCommitments: number } }
 */
  async function copyLoanAttributes(targetLoanId, sourceLoanId, options) {
  return apiRequest(`/api/banking/loans/${targetLoanId}/copy-from/${sourceLoanId}`, 'POST', options || {});
}

/**
 * Set a loan as active; other loans on the same project are set inactive. REQUIRES AUTHENTICATION.
 * @param {number} loanId - Loan ID to set active
 * @returns {Promise<object>} { success: true, data: loan }
 */
  async function setLoanActive(loanId) {
  return apiRequest(`/api/banking/loans/${loanId}`, 'PUT', { IsActive: true });
}

// LOAN TYPES (Loan Creation Wizard – reference table)
/**
 * Get all active loan types (e.g. HUD, Conventional), optionally filtered by search.
 * @param {string} [query] - Optional search string (e.g. "HUD") to filter by name
 * @returns {Promise<object>} { success: true, data: [{ LoanTypeId, LoanTypeName, Notes, DisplayOrder }, ...] }
 */
  async function getLoanTypes(query) {
  const qs = query != null && query !== '' ? `?q=${encodeURIComponent(query)}` : '';
  return apiRequest(`/api/banking/loan-types${qs}`);
}
  async function getLoanTypeById(id) {
  return apiRequest(`/api/banking/loan-types/${id}`);
}
/**
 * Create a loan type (REQUIRES AUTHENTICATION)
 * @param {object} payload - { LoanTypeName (required), Notes?, DisplayOrder? }
 * @returns {Promise<object>} { success: true, data: { LoanTypeId, LoanTypeName, ... } }
 */
  async function createLoanType(payload) {
  return apiRequest('/api/banking/loan-types', 'POST', payload);
}
/**
 * Update a loan type (REQUIRES AUTHENTICATION)
 * @param {number} id - LoanTypeId
 * @param {object} payload - { LoanTypeName?, Notes?, DisplayOrder?, IsActive? }
 */
  async function updateLoanType(id, payload) {
  return apiRequest(`/api/banking/loan-types/${id}`, 'PUT', payload);
}
/**
 * Soft-delete a loan type (REQUIRES AUTHENTICATION). Sets IsActive = 0.
 * @param {number} id - LoanTypeId
 */
  async function deleteLoanType(id) {
  return apiRequest(`/api/banking/loan-types/${id}`, 'DELETE');
}

/**
 * Check that all Loan Creation Wizard methods are present on window.API.
 * Call before opening the wizard; if ready is false, show a message to update api-client or backend.
 * @returns {{ ready: boolean, missing: string[] }} ready true if all methods exist; missing lists absent method names
 * @example
 * const cap = API.checkLoanWizardReady();
 * if (!cap.ready) {
 *   console.warn('Loan wizard unavailable:', cap.missing);
 *   return;
 * }
 */
  function checkLoanWizardReady() {
  const required = [
    'getLoanTypes',
    'createLoanType',
    'copyLoanAttributes',
    'setLoanActive',
    'createLoan',
    'getLoansByProject',
    'updateLoan'
  ];
  const missing = required.filter(function (name) { return typeof API[name] !== 'function'; });
  return { ready: missing.length === 0, missing: missing };
}

// LOAN MODIFICATIONS (permanent debt, extensions, restructures)
  async function getAllLoanModifications() {
  return apiRequest('/api/banking/loan-modifications');
}
  async function getLoanModificationById(id) {
  return apiRequest(`/api/banking/loan-modifications/${id}`);
}
  async function getLoanModificationsByProject(projectId) {
  return apiRequest(`/api/banking/loan-modifications/project/${projectId}`);
}
/**
 * Create a loan modification (REQUIRES AUTHENTICATION)
 * @param {object} data - { ProjectId (required), LoanId (optional), Type (required, e.g. "Restructure", "Modification", "Extension"), Description, EffectiveDate (YYYY-MM-DD), Notes }
 * @returns {Promise<object>} { success: true, data: { LoanModificationId, ... } }
 */
  async function createLoanModification(data) {
  return apiRequest('/api/banking/loan-modifications', 'POST', data);
}
/**
 * Update a loan modification (REQUIRES AUTHENTICATION)
 * @param {number} id - LoanModificationId
 * @param {object} data - Fields to update (ProjectId, LoanId, Type, Description, EffectiveDate, Notes)
 */
  async function updateLoanModification(id, data) {
  return apiRequest(`/api/banking/loan-modifications/${id}`, 'PUT', data);
}
  async function deleteLoanModification(id) {
  return apiRequest(`/api/banking/loan-modifications/${id}`, 'DELETE');
}

// DSCR TESTS
/**
 * Get all DSCR tests
 * @returns {Promise<object>} { success: true, data: [{...}] }
 * @note All banking entities (except Equity Commitments) now support FinancingType ('Construction' or 'Permanent')
 *       to separate Construction vs Permanent financing data
 */
  async function getAllDSCRTests() {
  return apiRequest('/api/banking/dscr-tests');
}

/**
 * Get DSCR test by ID
 * @param {number} id - DSCR Test ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getDSCRTestById(id) {
  return apiRequest(`/api/banking/dscr-tests/${id}`);
}

/**
 * Get DSCR tests by Project ID
 * @param {number} projectId - Project ID
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getDSCRTestsByProject(projectId) {
  return apiRequest(`/api/banking/dscr-tests/project/${projectId}`);
}

/**
 * Create a new DSCR test (REQUIRES AUTHENTICATION)
 * @param {object} data - DSCR test data
 * @param {number} data.ProjectId - Required: Project ID
 * @param {number} data.TestNumber - Required: Test number (1, 2, or 3)
 * @param {string} [data.FinancingType] - 'Construction' or 'Permanent' (defaults to 'Construction' if not provided)
 * @param {number} [data.LoanId] - Optional: Loan ID
 * @param {string} [data.TestDate] - Test date (YYYY-MM-DD)
 * @param {string} [data.ProjectedInterestRate] - Projected interest rate
 * @param {number} [data.Requirement] - DSCR requirement (e.g., 1.25)
 * @param {string} [data.ProjectedValue] - Projected DSCR value
 * @returns {Promise<object>} { success: true, data: {...} }
 * @note FinancingType separates Construction vs Permanent financing data
 */
  async function createDSCRTest(data) {
  return apiRequest('/api/banking/dscr-tests', 'POST', data);
}

/**
 * Update a DSCR test (REQUIRES AUTHENTICATION)
 * @param {number} id - DSCR Test ID
 * @param {object} data - Updated DSCR test data
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function updateDSCRTest(id, data) {
  return apiRequest(`/api/banking/dscr-tests/${id}`, 'PUT', data);
}

/**
 * Delete a DSCR test (REQUIRES AUTHENTICATION)
 * @param {number} id - DSCR Test ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteDSCRTest(id) {
  return apiRequest(`/api/banking/dscr-tests/${id}`, 'DELETE');
}

// PARTICIPATIONS
/**
 * Get all participations
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getAllParticipations() {
  return apiRequest('/api/banking/participations');
}

/**
 * Get participation by ID
 * @param {number} id - Participation ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getParticipationById(id) {
  return apiRequest(`/api/banking/participations/${id}`);
}

/**
 * Get participations by Project ID
 * @param {number} projectId - Project ID
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getParticipationsByProject(projectId) {
  return apiRequest(`/api/banking/participations/project/${projectId}`);
}

/**
 * Create a new participation (REQUIRES AUTHENTICATION)
 * @param {object} data - { ProjectId, BankId, FinancingType?, LoanId?, ParticipationPercent?, ExposureAmount?, PaidOff?, Notes? }
 * @param {string} [data.FinancingType] - 'Construction' or 'Permanent' (defaults to 'Construction' if not provided)
 * @returns {Promise<object>} { success: true, data: {...} }
 * @example
 * // Create a construction participation
 * await createParticipation({
 *   ProjectId: 1,
 *   BankId: 5,
 *   FinancingType: 'Construction',
 *   ParticipationPercent: '50%',
 *   ExposureAmount: 1000000
 * });
 * 
 * // Create a permanent participation
 * await createParticipation({
 *   ProjectId: 1,
 *   BankId: 5,
 *   FinancingType: 'Permanent',
 *   ParticipationPercent: '30%'
 * });
 */
  async function createParticipation(data) {
  return apiRequest('/api/banking/participations', 'POST', data);
}

/**
 * Create participation by Project ID (REQUIRES AUTHENTICATION)
 * Automatically finds the loan for the project based on FinancingType
 * @param {number} projectId - Project ID
 * @param {object} data - { BankId, FinancingType?, ParticipationPercent?, ExposureAmount?, PaidOff?, Notes? }
 * @param {string} [data.FinancingType] - 'Construction' or 'Permanent' (defaults to 'Construction' if not provided)
 * @returns {Promise<object>} { success: true, data: {...} }
 * @example
 * // Create a construction participation (default)
 * await createParticipationByProject(1, {
 *   BankId: 5,
 *   ParticipationPercent: '50%'
 * });
 * 
 * // Create a permanent participation
 * await createParticipationByProject(1, {
 *   BankId: 5,
 *   FinancingType: 'Permanent',
 *   ParticipationPercent: '30%'
 * });
 */
  async function createParticipationByProject(projectId, data) {
  return apiRequest(`/api/banking/participations/project/${projectId}`, 'POST', data);
}

/**
 * Update a participation (REQUIRES AUTHENTICATION)
 * @param {number} id - Participation ID
 * @param {object} data - Updated participation data
 * @param {string} [data.FinancingType] - 'Construction' or 'Permanent'
 * @returns {Promise<object>} { success: true, data: {...} }
 * @example
 * // Update financing type
 * await updateParticipation(123, {
 *   FinancingType: 'Permanent',
 *   ParticipationPercent: '40%'
 * });
 */
  async function updateParticipation(id, data) {
  return apiRequest(`/api/banking/participations/${id}`, 'PUT', data);
}

/**
 * Delete a participation (REQUIRES AUTHENTICATION)
 * @param {number} id - Participation ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteParticipation(id) {
  return apiRequest(`/api/banking/participations/${id}`, 'DELETE');
}

// GUARANTEES
/**
 * Get all guarantees
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getAllGuarantees() {
  return apiRequest('/api/banking/guarantees');
}

/**
 * Get guarantee by ID
 * @param {number} id - Guarantee ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getGuaranteeById(id) {
  return apiRequest(`/api/banking/guarantees/${id}`);
}

/**
 * Get guarantees by Project ID
 * @param {number} projectId - Project ID
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getGuaranteesByProject(projectId) {
  return apiRequest(`/api/banking/guarantees/project/${projectId}`);
}

/**
 * Create a new guarantee (REQUIRES AUTHENTICATION)
 * @param {object} data - Guarantee data
 * @param {number} data.ProjectId - Required: Project ID
 * @param {number} data.PersonId - Required: Person ID (guarantor)
 * @param {string} [data.FinancingType] - 'Construction' or 'Permanent' (defaults to 'Construction' if not provided)
 * @param {number} [data.LoanId] - Optional: Loan ID
 * @param {number} [data.GuaranteePercent] - Guarantee percentage
 * @param {number} [data.GuaranteeAmount] - Guarantee amount
 * @param {string} [data.Notes] - Notes
 * @returns {Promise<object>} { success: true, data: {...} }
 * @note FinancingType separates Construction vs Permanent financing data
 */
  async function createGuarantee(data) {
  return apiRequest('/api/banking/guarantees', 'POST', data);
}

/**
 * Create guarantee by Project ID (REQUIRES AUTHENTICATION)
 * Automatically finds the construction loan for the project
 * @param {number} projectId - Project ID
 * @param {object} data - { PersonId, GuaranteePercent?, GuaranteeAmount?, Notes? }
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function createGuaranteeByProject(projectId, data) {
  return apiRequest(`/api/banking/guarantees/project/${projectId}`, 'POST', data);
}

/**
 * Update a guarantee (REQUIRES AUTHENTICATION)
 * @param {number} id - Guarantee ID
 * @param {object} data - Updated guarantee data
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function updateGuarantee(id, data) {
  return apiRequest(`/api/banking/guarantees/${id}`, 'PUT', data);
}

/**
 * Delete a guarantee (REQUIRES AUTHENTICATION)
 * @param {number} id - Guarantee ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteGuarantee(id) {
  return apiRequest(`/api/banking/guarantees/${id}`, 'DELETE');
}

// COVENANTS
/**
 * Get all covenants
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getAllCovenants() {
  return apiRequest('/api/banking/covenants');
}

/**
 * Get covenant by ID
 * @param {number} id - Covenant ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getCovenantById(id) {
  return apiRequest(`/api/banking/covenants/${id}`);
}

/**
 * Get covenants by Project ID
 * @param {number} projectId - Project ID
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getCovenantsByProject(projectId) {
  return apiRequest(`/api/banking/covenants/project/${projectId}`);
}

/**
 * Create a new covenant (REQUIRES AUTHENTICATION)
 * 
 * CovenantType options: 'DSCR', 'Occupancy', 'Liquidity Requirement', 'Other'
 * 
 * Fields vary by CovenantType:
 * - DSCR: DSCRTestDate (Date), ProjectedInterestRate (string), DSCRRequirement (string), ProjectedDSCR (string)
 * - Occupancy: OccupancyCovenantDate (Date), OccupancyRequirement (string), ProjectedOccupancy (string, e.g., "76.5%")
 * - Liquidity Requirement: LiquidityRequirementLendingBank (number/decimal)
 * - Other: CovenantDate (Date), Requirement (string), ProjectedValue (string)
 * 
 * @param {object} data - { 
 *   ProjectId (required), 
 *   CovenantType (required: 'DSCR' | 'Occupancy' | 'Liquidity Requirement' | 'Other'),
 *   FinancingType? ('Construction' | 'Permanent', defaults to 'Construction'),
 *   LoanId?,
 *   // DSCR fields:
 *   DSCRTestDate?, ProjectedInterestRate?, DSCRRequirement?, ProjectedDSCR?,
 *   // Occupancy fields:
 *   OccupancyCovenantDate?, OccupancyRequirement?, ProjectedOccupancy?,
 *   // Liquidity Requirement fields:
 *   LiquidityRequirementLendingBank?,
 *   // Other fields:
 *   CovenantDate?, Requirement?, ProjectedValue?,
 *   Notes?,
 *   ReminderEmails? (string[]), ReminderDaysBefore? (number[], e.g. [7, 14, 30])
 * }
 * @returns {Promise<object>} { success: true, data: {...} } — data includes ReminderEmails, ReminderDaysBefore arrays
 * @note FinancingType separates Construction vs Permanent financing data
 * 
 * @example
 * // Create a DSCR covenant
 * await createCovenant({
 *   ProjectId: 1,
 *   CovenantType: 'DSCR',
 *   DSCRTestDate: '2027-03-31',
 *   ProjectedInterestRate: '5.25%',
 *   DSCRRequirement: '1.25',
 *   ProjectedDSCR: '1.35'
 * });
 * 
 * @example
 * // Create an Occupancy covenant
 * await createCovenant({
 *   ProjectId: 1,
 *   CovenantType: 'Occupancy',
 *   OccupancyCovenantDate: '2027-03-31',
 *   OccupancyRequirement: '50%',
 *   ProjectedOccupancy: '76.5%'
 * });
 * 
 * @example
 * // Create a Liquidity Requirement covenant
 * await createCovenant({
 *   ProjectId: 1,
 *   CovenantType: 'Liquidity Requirement',
 *   LiquidityRequirementLendingBank: 5000000
 * });
 */
  async function createCovenant(data) {
  return apiRequest('/api/banking/covenants', 'POST', data);
}

/**
 * Create covenant by Project ID (REQUIRES AUTHENTICATION)
 * Automatically finds the construction loan for the project
 * 
 * CovenantType options: 'DSCR', 'Occupancy', 'Liquidity Requirement', 'Other'
 * 
 * Fields vary by CovenantType:
 * - DSCR: DSCRTestDate (Date), ProjectedInterestRate (string), DSCRRequirement (string), ProjectedDSCR (string)
 * - Occupancy: OccupancyCovenantDate (Date), OccupancyRequirement (string), ProjectedOccupancy (string, e.g., "76.5%")
 * - Liquidity Requirement: LiquidityRequirementLendingBank (number/decimal)
 * - Other: CovenantDate (Date), Requirement (string), ProjectedValue (string)
 * 
 * @param {number} projectId - Project ID
 * @param {object} data - { 
 *   CovenantType (required: 'DSCR' | 'Occupancy' | 'Liquidity Requirement' | 'Other'),
 *   // DSCR fields:
 *   DSCRTestDate?, ProjectedInterestRate?, DSCRRequirement?, ProjectedDSCR?,
 *   // Occupancy fields:
 *   OccupancyCovenantDate?, OccupancyRequirement?, ProjectedOccupancy?,
 *   // Liquidity Requirement fields:
 *   LiquidityRequirementLendingBank?,
 *   // Other fields:
 *   CovenantDate?, Requirement?, ProjectedValue?,
 *   Notes?,
 *   ReminderEmails? (string[]), ReminderDaysBefore? (number[])
 * }
 * @returns {Promise<object>} { success: true, data: {...} }
 * 
 * @example
 * // Create a DSCR covenant for a project
 * await createCovenantByProject(1, {
 *   CovenantType: 'DSCR',
 *   DSCRTestDate: '2027-03-31',
 *   ProjectedInterestRate: '5.25%',
 *   DSCRRequirement: '1.25',
 *   ProjectedDSCR: '1.35'
 * });
 */
  async function createCovenantByProject(projectId, data) {
  return apiRequest(`/api/banking/covenants/project/${projectId}`, 'POST', data);
}

/**
 * Update a covenant (REQUIRES AUTHENTICATION). Can include ReminderEmails (string[]), ReminderDaysBefore (number[]).
 * @param {number} id - Covenant ID
 * @param {object} data - Updated covenant data
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function updateCovenant(id, data) {
  return apiRequest(`/api/banking/covenants/${id}`, 'PUT', data);
}

/**
 * Delete a covenant (REQUIRES AUTHENTICATION)
 * @param {number} id - Covenant ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteCovenant(id) {
  return apiRequest(`/api/banking/covenants/${id}`, 'DELETE');
}

/**
 * Get banking email templates (e.g. CovenantReminder). GET /api/banking/email-templates
 * @returns {Promise<object>} { success: true, data: [{ TemplateId, Name, Description, SubjectTemplate, BodyTemplateHtml }] }
 */
  async function getBankingEmailTemplates() {
  return apiRequest('/api/banking/email-templates');
}

/**
 * Send covenant reminder email now. POST /api/banking/covenants/:id/send-reminder (REQUIRES AUTHENTICATION)
 * @param {number} covenantId - Covenant ID
 * @param {object} payload - { ToEmails: string[], TemplateId?: string }
 * @returns {Promise<object>} { success: true, message: 'Reminder sent' } or 400/404/503
 */
  async function sendCovenantReminderNow(covenantId, payload) {
  return apiRequest(`/api/banking/covenants/${covenantId}/send-reminder`, 'POST', payload);
}

/**
 * Get upcoming dates reminder settings. GET /api/banking/settings/upcoming-dates-reminders
 * BACKEND-GUIDE-UPCOMING-DATES-REMINDERS: global Key dates & covenants reminder config.
 * @returns {Promise<object>} { success: true, data: { recipientEmails: string[], additionalEmails: string, daysBefore: number[] } }
 */
  async function getUpcomingDatesReminderSettings() {
  return apiRequest('/api/banking/settings/upcoming-dates-reminders');
}

/**
 * Save upcoming dates reminder settings. PUT /api/banking/settings/upcoming-dates-reminders (REQUIRES AUTHENTICATION)
 * @param {object} settings - { recipientEmails: string[], additionalEmails?: string, daysBefore: number[] }
 * @returns {Promise<object>} { success: true, data: settings }
 */
  async function saveUpcomingDatesReminderSettings(settings) {
  return apiRequest('/api/banking/settings/upcoming-dates-reminders', 'PUT', settings);
}

// LIQUIDITY REQUIREMENTS
/**
 * Get all liquidity requirements
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getAllLiquidityRequirements() {
  return apiRequest('/api/banking/liquidity-requirements');
}

/**
 * Get liquidity requirement by ID
 * @param {number} id - Liquidity Requirement ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getLiquidityRequirementById(id) {
  return apiRequest(`/api/banking/liquidity-requirements/${id}`);
}

/**
 * Get liquidity requirements by Project ID
 * @param {number} projectId - Project ID
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getLiquidityRequirementsByProject(projectId) {
  return apiRequest(`/api/banking/liquidity-requirements/project/${projectId}`);
}

/**
 * Create a new liquidity requirement (REQUIRES AUTHENTICATION)
 * @param {object} data - Liquidity requirement data
 * @param {number} data.ProjectId - Required: Project ID
 * @param {string} [data.FinancingType] - 'Construction' or 'Permanent' (defaults to 'Construction' if not provided)
 * @param {number} [data.LoanId] - Optional: Loan ID
 * @param {number} [data.TotalAmount] - Total amount
 * @param {number} [data.LendingBankAmount] - Lending bank amount
 * @param {string} [data.Notes] - Notes
 * @returns {Promise<object>} { success: true, data: {...} }
 * @note FinancingType separates Construction vs Permanent financing data
 */
  async function createLiquidityRequirement(data) {
  return apiRequest('/api/banking/liquidity-requirements', 'POST', data);
}

/**
 * Update a liquidity requirement (REQUIRES AUTHENTICATION)
 * @param {number} id - Liquidity Requirement ID
 * @param {object} data - Updated liquidity requirement data
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function updateLiquidityRequirement(id, data) {
  return apiRequest(`/api/banking/liquidity-requirements/${id}`, 'PUT', data);
}

/**
 * Delete a liquidity requirement (REQUIRES AUTHENTICATION)
 * @param {number} id - Liquidity Requirement ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteLiquidityRequirement(id) {
  return apiRequest(`/api/banking/liquidity-requirements/${id}`, 'DELETE');
}

// BANK TARGETS
/**
 * Get all bank targets
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getAllBankTargets() {
  return apiRequest('/api/banking/bank-targets');
}

/**
 * Get bank target by ID
 * @param {number} id - Bank Target ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getBankTargetById(id) {
  return apiRequest(`/api/banking/bank-targets/${id}`);
}

/**
 * Create a new bank target (REQUIRES AUTHENTICATION)
 * @param {object} data - { BankId, AssetsText?, City?, State?, ExposureWithStoa?, ContactText?, Comments? }
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function createBankTarget(data) {
  return apiRequest('/api/banking/bank-targets', 'POST', data);
}

/**
 * Update a bank target (REQUIRES AUTHENTICATION)
 * @param {number} id - Bank Target ID
 * @param {object} data - Updated bank target data
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function updateBankTarget(id, data) {
  return apiRequest(`/api/banking/bank-targets/${id}`, 'PUT', data);
}

/**
 * Delete a bank target (REQUIRES AUTHENTICATION)
 * @param {number} id - Bank Target ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteBankTarget(id) {
  return apiRequest(`/api/banking/bank-targets/${id}`, 'DELETE');
}

// EQUITY COMMITMENTS
/**
 * Get all equity commitments
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
/**
 * Get all equity commitments
 * @returns {Promise<object>} { success: true, data: [{ EquityCommitmentId, ProjectId, EquityPartnerId, RelatedParties: [...], ... }] }
 * @example
 * const commitments = await getAllEquityCommitments();
 * // Each commitment includes RelatedParties array with related investor info
 */
  async function getAllEquityCommitments() {
  return apiRequest('/api/banking/equity-commitments');
}

/**
 * Get equity commitment by ID
 * @param {number} id - Equity Commitment ID
 * @returns {Promise<object>} { success: true, data: { EquityCommitmentId, ProjectId, EquityPartnerId, RelatedParties: [...], ... } }
 */
  async function getEquityCommitmentById(id) {
  return apiRequest(`/api/banking/equity-commitments/${id}`);
}

/**
 * Get equity commitments by Project ID
 * @param {number} projectId - Project ID
 * @returns {Promise<object>} { success: true, data: [{ EquityCommitmentId, ProjectId, EquityPartnerId, RelatedParties: [...], ... }] }
 */
  async function getEquityCommitmentsByProject(projectId) {
  return apiRequest(`/api/banking/equity-commitments/project/${projectId}`);
}

/**
 * Create a new equity commitment (REQUIRES AUTHENTICATION)
 * @param {object} data - { ProjectId, EquityPartnerId?, EquityType?, LeadPrefGroup?, FundingDate?, Amount?, InterestRate?, AnnualMonthly?, BackEndKicker?, LastDollar?, Notes?, RelatedPartyIds?: number[] }
 * @param {string} [data.EquityType] - Type of equity: 'Preferred Equity', 'Common Equity', 'Profits Interest', or 'Stoa Loan'
 * @param {number[]} [data.RelatedPartyIds] - Array of EquityPartnerIds for related parties (investors involved but not the lead)
 * @returns {Promise<object>} { success: true, data: { EquityCommitmentId, RelatedParties: [...], ... } }
 * @note Related parties are only allowed for Entity partners. Individual partners cannot have related parties.
 * @example
 * await createEquityCommitment({
 *   ProjectId: 1,
 *   EquityPartnerId: 5,  // Lead investor (must be Entity type, not Individual)
 *   EquityType: 'Preferred Equity',  // or 'Common Equity', 'Profits Interest', or 'Stoa Loan'
 *   Amount: 1000000,
 *   RelatedPartyIds: [6, 7]  // Other investors also involved (only if lead is Entity type)
 * });
 */
  async function createEquityCommitment(data) {
  return apiRequest('/api/banking/equity-commitments', 'POST', data);
}

/**
 * Update an equity commitment (REQUIRES AUTHENTICATION)
 * @param {number} id - Equity Commitment ID
 * @param {object} data - Updated equity commitment data { ProjectId?, EquityPartnerId?, EquityType?, LeadPrefGroup?, FundingDate?, Amount?, InterestRate?, AnnualMonthly?, BackEndKicker?, LastDollar?, Notes?, RelatedPartyIds?: number[] }
 * @param {string} [data.EquityType] - Type of equity: 'Preferred Equity', 'Common Equity', 'Profits Interest', or 'Stoa Loan'
 * @param {number[]} [data.RelatedPartyIds] - Array of EquityPartnerIds for related parties (pass empty array to clear all)
 * @returns {Promise<object>} { success: true, data: { EquityCommitmentId, RelatedParties: [...], ... } }
 * @note Related parties are only allowed for Entity partners. Individual partners cannot have related parties.
 * @example
 * await updateEquityCommitment(123, {
 *   EquityType: 'Profits Interest',
 *   Amount: 1500000,
 *   RelatedPartyIds: [6, 7, 8]  // Update related parties (only if lead is Entity type)
 * });
 */
  async function updateEquityCommitment(id, data) {
  return apiRequest(`/api/banking/equity-commitments/${id}`, 'PUT', data);
}

/**
 * Delete an equity commitment (REQUIRES AUTHENTICATION)
 * @param {number} id - Equity Commitment ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteEquityCommitment(id) {
  return apiRequest(`/api/banking/equity-commitments/${id}`, 'DELETE');
}

/**
 * Get related parties for an equity commitment
 * @param {number} commitmentId - Equity Commitment ID
 * @returns {Promise<object>} { success: true, data: [{ EquityCommitmentRelatedPartyId, EquityCommitmentId, EquityPartnerId, PartnerName, InvestorRepId, InvestorRepName, InvestorRepEmail, InvestorRepPhone, ... }] }
 * @note InvestorRepName, InvestorRepEmail, InvestorRepPhone are populated from core.Person via InvestorRepId
 */
  async function getRelatedPartiesByCommitment(commitmentId) {
  return apiRequest(`/api/banking/equity-commitments/${commitmentId}/related-parties`);
}

/**
 * Add a related party to an equity commitment (REQUIRES AUTHENTICATION)
 * @param {number} commitmentId - Equity Commitment ID
 * @param {object} data - { RelatedPartyId }
 * @returns {Promise<object>} { success: true, data: {...} }
 * @example
 * await addRelatedParty(123, { RelatedPartyId: 6 });
 */
  async function addRelatedParty(commitmentId, data) {
  return apiRequest(`/api/banking/equity-commitments/${commitmentId}/related-parties`, 'POST', data);
}

/**
 * Remove a related party from an equity commitment (REQUIRES AUTHENTICATION)
 * @param {number} commitmentId - Equity Commitment ID
 * @param {number} relatedPartyId - Related Party (EquityPartner) ID
 * @returns {Promise<object>} { success: true, message: '...' }
 * @example
 * await removeRelatedParty(123, 6);
 */
  async function removeRelatedParty(commitmentId, relatedPartyId) {
  return apiRequest(`/api/banking/equity-commitments/${commitmentId}/related-parties/${relatedPartyId}`, 'DELETE');
}

// LOAN PROCEEDS (Additional Draws/Disbursements)
/**
 * Get all loan proceeds
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getAllLoanProceeds() {
  return apiRequest('/api/banking/loan-proceeds');
}

/**
 * Get loan proceeds by ID
 * @param {number} id - Loan Proceeds ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getLoanProceedsById(id) {
  return apiRequest(`/api/banking/loan-proceeds/${id}`);
}

/**
 * Get loan proceeds by Project ID
 * @param {number} projectId - Project ID
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getLoanProceedsByProject(projectId) {
  return apiRequest(`/api/banking/loan-proceeds/project/${projectId}`);
}

/**
 * Get loan proceeds by Loan ID
 * @param {number} loanId - Loan ID
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getLoanProceedsByLoan(loanId) {
  return apiRequest(`/api/banking/loan-proceeds/loan/${loanId}`);
}

/**
 * Create loan proceeds (additional draw/disbursement) (REQUIRES AUTHENTICATION)
 * @param {object} data - Loan proceeds data
 * @param {number} data.ProjectId - Required: Project ID
 * @param {string} data.ProceedsDate - Required: Date of draw (YYYY-MM-DD)
 * @param {number} data.ProceedsAmount - Required: Amount drawn
 * @param {string} [data.FinancingType] - 'Construction' or 'Permanent' (defaults to 'Construction' if not provided)
 * @param {number} [data.LoanId] - Optional: Loan ID
 * @param {number} [data.CumulativeAmount] - Cumulative total drawn
 * @param {number} [data.DrawNumber] - Draw number (1st, 2nd, etc.)
 * @param {string} [data.DrawDescription] - Description of draw
 * @param {string} [data.Notes] - Notes
 * @returns {Promise<object>} { success: true, data: {...} }
 * @note FinancingType separates Construction vs Permanent financing data
 * 
 * @example
 * await createLoanProceeds({
 *   ProjectId: 1,
 *   FinancingType: 'Construction',
 *   LoanId: 5,
 *   ProceedsDate: '2024-01-15',
 *   ProceedsAmount: 500000,
 *   DrawNumber: 1,
 *   DrawDescription: 'First draw - site work'
 * });
 */
  async function createLoanProceeds(data) {
  return apiRequest('/api/banking/loan-proceeds', 'POST', data);
}

/**
 * Update loan proceeds (REQUIRES AUTHENTICATION)
 * @param {number} id - Loan Proceeds ID
 * @param {object} data - Updated loan proceeds data
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function updateLoanProceeds(id, data) {
  return apiRequest(`/api/banking/loan-proceeds/${id}`, 'PUT', data);
}

/**
 * Delete loan proceeds (REQUIRES AUTHENTICATION)
 * @param {number} id - Loan Proceeds ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteLoanProceeds(id) {
  return apiRequest(`/api/banking/loan-proceeds/${id}`, 'DELETE');
}

// GUARANTEE BURNDOWNS
/**
 * Get all guarantee burndowns
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getAllGuaranteeBurndowns() {
  return apiRequest('/api/banking/guarantee-burndowns');
}

/**
 * Get guarantee burndown by ID
 * @param {number} id - Guarantee Burndown ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getGuaranteeBurndownById(id) {
  return apiRequest(`/api/banking/guarantee-burndowns/${id}`);
}

/**
 * Get guarantee burndowns by Project ID
 * @param {number} projectId - Project ID
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getGuaranteeBurndownsByProject(projectId) {
  return apiRequest(`/api/banking/guarantee-burndowns/project/${projectId}`);
}

/**
 * Get guarantee burndowns by Person ID (guarantor)
 * @param {number} personId - Person ID (1=Toby, 2=Ryan, 3=Saun)
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getGuaranteeBurndownsByPerson(personId) {
  return apiRequest(`/api/banking/guarantee-burndowns/person/${personId}`);
}

/**
 * Create guarantee burndown (guarantee reduction) (REQUIRES AUTHENTICATION)
 * @param {object} data - Guarantee burndown data
 * @param {number} data.ProjectId - Required: Project ID
 * @param {number} data.PersonId - Required: Person ID (guarantor)
 * @param {string} data.BurndownDate - Required: Date of burndown (YYYY-MM-DD)
 * @param {number} data.NewAmount - Required: New guarantee amount after reduction
 * @param {string} [data.FinancingType] - 'Construction' or 'Permanent' (defaults to 'Construction' if not provided)
 * @param {number} [data.LoanId] - Optional: Loan ID
 * @param {number} [data.PreviousAmount] - Previous guarantee amount
 * @param {number} [data.ReductionAmount] - Amount reduced (auto-calculated if not provided)
 * @param {number} [data.PreviousPercent] - Previous guarantee percentage
 * @param {number} [data.NewPercent] - New guarantee percentage
 * @param {string} [data.BurndownReason] - Reason for reduction
 * @param {string} [data.TriggeredBy] - What triggered the burndown
 * @param {string} [data.Notes] - Notes
 * @returns {Promise<object>} { success: true, data: {...} }
 * @note FinancingType separates Construction vs Permanent financing data
 * 
 * @example
 * await createGuaranteeBurndown({
 *   ProjectId: 1,
 *   FinancingType: 'Construction',
 *   PersonId: 1, // Toby
 *   BurndownDate: '2027-03-31',
 *   PreviousAmount: 1000000,
 *   NewAmount: 500000,
 *   ReductionAmount: 500000,
 *   BurndownReason: 'DSCR reached 1.25x',
 *   TriggeredBy: 'DSCR Test 1'
 * });
 */
  async function createGuaranteeBurndown(data) {
  return apiRequest('/api/banking/guarantee-burndowns', 'POST', data);
}

/**
 * Update guarantee burndown (REQUIRES AUTHENTICATION)
 * @param {number} id - Guarantee Burndown ID
 * @param {object} data - Updated guarantee burndown data
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function updateGuaranteeBurndown(id, data) {
  return apiRequest(`/api/banking/guarantee-burndowns/${id}`, 'PUT', data);
}

/**
 * Delete guarantee burndown (REQUIRES AUTHENTICATION)
 * @param {number} id - Guarantee Burndown ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteGuaranteeBurndown(id) {
  return apiRequest(`/api/banking/guarantee-burndowns/${id}`, 'DELETE');
}

// ============================================================
// PIPELINE SCHEMA
// ============================================================

// UNDER CONTRACTS
// ============================================================
// LAND DEVELOPMENT - UNDER CONTRACT (Stoa Properties Tracker)
// ============================================================
/**
 * Get all under contract deals with CORE and Land Development data
 * Returns: ProjectName, City, State, Region (from CORE), Units (from CORE),
 *          plus Land Development specific: Acreage, LandPrice, SqFtPrice, etc.
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getAllUnderContracts() {
  return apiRequest('/api/pipeline/under-contracts');
}

/**
 * Get under contract deal by ID
 * @param {number} id - Under Contract ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getUnderContractById(id) {
  return apiRequest(`/api/pipeline/under-contracts/${id}`);
}

/**
 * Get under contract deal by Project ID
 * @param {number} projectId - Project ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getUnderContractByProjectId(projectId) {
  return apiRequest(`/api/pipeline/under-contracts/project/${projectId}`);
}

/**
 * Create a new under contract deal (Land Development)
 * 
 * CORE attributes (pulled from core.Project, can be updated):
 * - ProjectName, City, State, Region, Units (from CORE)
 * 
 * Land Development specific attributes (stored in pipeline.UnderContract):
 * @param {object} data - {
 *   ProjectId: number (required),
 *   Units?: number (updates CORE.Project.Units),
 *   Acreage?: number,
 *   LandPrice?: number,
 *   ExecutionDate?: string (YYYY-MM-DD),
 *   DueDiligenceDate?: string (YYYY-MM-DD),
 *   ClosingDate?: string (YYYY-MM-DD),
 *   PurchasingEntity?: string,
 *   Cash?: boolean,
 *   OpportunityZone?: boolean,
 *   ClosingNotes?: string
 * }
 * @returns {Promise<object>} { success: true, data: {...} }
 * 
 * Note: SqFtPrice is automatically calculated as LandPrice / (Acreage * 43560)
 * @example
 * await createUnderContract({
 *   ProjectId: 1,
 *   Units: 200,
 *   Acreage: 10.5,
 *   LandPrice: 5000000,
 *   ExecutionDate: '2024-01-15',
 *   Cash: true,
 *   OpportunityZone: false
 * });
 */
  async function createUnderContract(data) {
  return apiRequest('/api/pipeline/under-contracts', 'POST', data);
}

/**
 * Update an under contract deal (Land Development)
 * 
 * Can update:
 * - Units (updates CORE.Project.Units)
 * - Any Land Development specific fields
 * 
 * SqFtPrice is automatically recalculated if LandPrice or Acreage changes
 * @param {number} id - Under Contract ID
 * @param {object} data - Fields to update (same as createUnderContract)
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function updateUnderContract(id, data) {
  return apiRequest(`/api/pipeline/under-contracts/${id}`, 'PUT', data);
}

/**
 * Delete an under contract deal
 * @param {number} id - Under Contract ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteUnderContract(id) {
  return apiRequest(`/api/pipeline/under-contracts/${id}`, 'DELETE');
}

// ============================================================
// LAND DEVELOPMENT - COMMERCIAL LISTED (Stoa Properties Tracker)
// ============================================================
/**
 * Get all commercial listed deals with CORE and Land Development data
 * Returns: ProjectName, City, State (from CORE),
 *          plus Land Development specific: ListedDate, Acreage, LandPrice, ListingStatus, etc.
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getAllCommercialListed() {
  return apiRequest('/api/pipeline/commercial-listed');
}

/**
 * Get commercial listed deal by ID
 * @param {number} id - Commercial Listed ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getCommercialListedById(id) {
  return apiRequest(`/api/pipeline/commercial-listed/${id}`);
}

/**
 * Get commercial listed deal by Project ID
 * @param {number} projectId - Project ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getCommercialListedByProjectId(projectId) {
  return apiRequest(`/api/pipeline/commercial-listed/project/${projectId}`);
}

/**
 * Create a new commercial listed deal (Land Development)
 * 
 * CORE attributes (pulled from core.Project):
 * - ProjectName, City, State (from CORE)
 * 
 * Land Development specific attributes (stored in pipeline.CommercialListed):
 * @param {object} data - {
 *   ProjectId: number (required),
 *   ListedDate?: string (YYYY-MM-DD),
 *   Acreage?: number,
 *   LandPrice?: number,
 *   ListingStatus?: string ('Available', 'Under Contract', 'Sold'),
 *   DueDiligenceDate?: string (YYYY-MM-DD),
 *   ClosingDate?: string (YYYY-MM-DD),
 *   Owner?: string,
 *   PurchasingEntity?: string,
 *   Broker?: string,
 *   Notes?: string
 * }
 * @returns {Promise<object>} { success: true, data: {...} }
 * @example
 * await createCommercialListed({
 *   ProjectId: 1,
 *   ListedDate: '2024-01-15',
 *   Acreage: 15.5,
 *   LandPrice: 7500000,
 *   ListingStatus: 'Available',
 *   Owner: 'ABC Land Company'
 * });
 */
  async function createCommercialListed(data) {
  return apiRequest('/api/pipeline/commercial-listed', 'POST', data);
}

/**
 * Update a commercial listed deal (Land Development)
 * @param {number} id - Commercial Listed ID
 * @param {object} data - Fields to update (same as createCommercialListed)
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function updateCommercialListed(id, data) {
  return apiRequest(`/api/pipeline/commercial-listed/${id}`, 'PUT', data);
}

/**
 * Delete a commercial listed deal
 * @param {number} id - Commercial Listed ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteCommercialListed(id) {
  return apiRequest(`/api/pipeline/commercial-listed/${id}`, 'DELETE');
}

// ============================================================
// LAND DEVELOPMENT - COMMERCIAL ACREAGE (Land We Own)
// ============================================================
/**
 * Get all commercial acreage records with CORE and Land Development data
 * Returns: ProjectName, City, State (from CORE),
 *          plus Land Development specific: Acreage, SquareFootage, BuildingFootprintSF
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getAllCommercialAcreage() {
  return apiRequest('/api/pipeline/commercial-acreage');
}

/**
 * Get commercial acreage record by ID
 * @param {number} id - Commercial Acreage ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getCommercialAcreageById(id) {
  return apiRequest(`/api/pipeline/commercial-acreage/${id}`);
}

/**
 * Get commercial acreage record by Project ID
 * @param {number} projectId - Project ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getCommercialAcreageByProjectId(projectId) {
  return apiRequest(`/api/pipeline/commercial-acreage/project/${projectId}`);
}

/**
 * Create a new commercial acreage record (Land Development - Land We Own)
 * 
 * CORE attributes (pulled from core.Project):
 * - ProjectName, City, State (from CORE)
 * 
 * Land Development specific attributes (stored in pipeline.CommercialAcreage):
 * @param {object} data - {
 *   ProjectId: number (required),
 *   Acreage?: number,
 *   SquareFootage?: number,
 *   BuildingFootprintSF?: number
 * }
 * @returns {Promise<object>} { success: true, data: {...} }
 * @example
 * await createCommercialAcreage({
 *   ProjectId: 1,
 *   Acreage: 25.5,
 *   SquareFootage: 1110780,
 *   BuildingFootprintSF: 50000
 * });
 */
  async function createCommercialAcreage(data) {
  return apiRequest('/api/pipeline/commercial-acreage', 'POST', data);
}

/**
 * Update a commercial acreage record (Land Development)
 * @param {number} id - Commercial Acreage ID
 * @param {object} data - Fields to update (same as createCommercialAcreage)
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function updateCommercialAcreage(id, data) {
  return apiRequest(`/api/pipeline/commercial-acreage/${id}`, 'PUT', data);
}

/**
 * Delete a commercial acreage record
 * @param {number} id - Commercial Acreage ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteCommercialAcreage(id) {
  return apiRequest(`/api/pipeline/commercial-acreage/${id}`, 'DELETE');
}

// ============================================================
// PIPELINE - CLOSED PROPERTIES (Land Acquisition Status: Closed)
// ============================================================
/**
 * Get all closed properties with CORE and Closed Property data
 * Returns: ProjectName, City, State, Address (from CORE),
 *          plus Closed Property specific: Status, ClosingDate (from LandClosingDate), Acreage, Units, Price, PricePerSF, ActOfSale, DueDiligenceDate, PurchasingEntity, CashFlag
 * @returns {Promise<object>} { success: true, data: [{...}] }
 */
  async function getAllClosedProperties() {
  return apiRequest('/api/pipeline/closed-properties');
}

/**
 * Get closed property by ID
 * @param {number} id - Closed Property ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getClosedPropertyById(id) {
  return apiRequest(`/api/pipeline/closed-properties/${id}`);
}

/**
 * Create a new closed property (Land Acquisition Status: Closed)
 * 
 * CORE attributes (pulled from core.Project, can be updated):
 * - ProjectName, City, State, Address (from CORE)
 * 
 * Closed Property specific attributes (stored in pipeline.ClosedProperty):
 * @param {object} data - {
 *   ProjectId: number (required),
 *   City?: string (updates CORE.Project.City),
 *   State?: string (updates CORE.Project.State),
 *   Address?: string (updates CORE.Project.Address),
 *   Status?: string (e.g., 'Multifamily', 'Commercial'),
 *   ClosingDate?: string (YYYY-MM-DD) - stored as LandClosingDate in pipeline,
 *   Acreage?: number,
 *   Units?: number,
 *   Price?: number,
 *   PricePerSF?: number,
 *   ActOfSale?: string,
 *   DueDiligenceDate?: string (YYYY-MM-DD),
 *   PurchasingEntity?: string,
 *   CashFlag?: boolean
 * }
 * @returns {Promise<object>} { success: true, data: {...} }
 * @example
 * await createClosedProperty({
 *   ProjectId: 1,
 *   City: 'Baton Rouge',
 *   State: 'LA',
 *   Address: '123 Main St, Baton Rouge, LA 70801',
 *   Status: 'Multifamily',
 *   ClosingDate: '2024-01-15',
 *   Acreage: 10.5,
 *   Units: 200,
 *   Price: 5000000,
 *   PricePerSF: 45.50,
 *   CashFlag: true
 * });
 */
  async function createClosedProperty(data) {
  return apiRequest('/api/pipeline/closed-properties', 'POST', data);
}

/**
 * Update a closed property (Land Acquisition Status: Closed)
 * 
 * Can update:
 * - City, State, Address (updates CORE.Project)
 * - Any Closed Property specific fields
 * 
 * Note: ClosingDate is stored as LandClosingDate in the database
 * 
 * @param {number} id - Closed Property ID
 * @param {object} data - Fields to update (same as createClosedProperty)
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function updateClosedProperty(id, data) {
  return apiRequest(`/api/pipeline/closed-properties/${id}`, 'PUT', data);
}

/**
 * Delete a closed property
 * @param {number} id - Closed Property ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteClosedProperty(id) {
  return apiRequest(`/api/pipeline/closed-properties/${id}`, 'DELETE');
}

// ============================================================
// PIPELINE: BROKER/REFERRAL CONTACTS (Land Development Pipeline)
// ============================================================

/**
 * Get all broker/referral contacts, optionally filtered by name search
 * @param {string} [q] - Optional search query; partial case-insensitive match on Name
 * @returns {Promise<object>} { success: true, data: [{ BrokerReferralContactId, Name, Email, Phone, CreatedAt, ModifiedAt }, ...] }
 */
  async function getAllBrokerReferralContacts(q) {
  const query = q != null && q !== '' ? `?q=${encodeURIComponent(q)}` : '';
  return apiRequest(`/api/pipeline/broker-referral-contacts${query}`);
}

/**
 * Get a broker/referral contact by ID
 * @param {number} id - BrokerReferralContactId
 * @returns {Promise<object>} { success: true, data: { BrokerReferralContactId, Name, Email, Phone, CreatedAt, ModifiedAt } }
 */
  async function getBrokerReferralContactById(id) {
  return apiRequest(`/api/pipeline/broker-referral-contacts/${id}`);
}

/**
 * Create a broker/referral contact
 * @param {object} data - { Name (required), Email?, Phone? }
 * @returns {Promise<object>} { success: true, data: { BrokerReferralContactId, Name, Email, Phone, CreatedAt, ModifiedAt } }
 */
  async function createBrokerReferralContact(data) {
  return apiRequest('/api/pipeline/broker-referral-contacts', 'POST', data);
}

/**
 * Update a broker/referral contact
 * @param {number} id - BrokerReferralContactId
 * @param {object} data - { Name?, Email?, Phone? } (only send fields to update)
 * @returns {Promise<object>} { success: true, data: { ... } }
 */
  async function updateBrokerReferralContact(id, data) {
  return apiRequest(`/api/pipeline/broker-referral-contacts/${id}`, 'PUT', data);
}

/**
 * Delete a broker/referral contact. Fails with 409 if any deal references this contact.
 * @param {number} id - BrokerReferralContactId
 * @returns {Promise<object>} { success: true, message: 'Contact deleted' }
 */
  async function deleteBrokerReferralContact(id) {
  return apiRequest(`/api/pipeline/broker-referral-contacts/${id}`, 'DELETE');
}

// ============================================================
// LAND DEVELOPMENT CONTACTS (contact book + follow-up reminders)
// Individuals only (core.Person). ContactId = PersonId. List returns all individuals
// with optional land-dev extension fields; delete removes extension only.
// ============================================================

/**
 * List land development contacts with optional filters. GET /api/land-development/contacts
 * @param {object} [params] - Query (all optional): type ('Land Owner'|'Developer'|'Broker'), city, state, q (search Name, Email, Notes), upcomingOnly (boolean)
 * @returns {Promise<{ success: boolean, data?: Array<Contact>, error?: { message: string } }>} data = contacts with ContactId, Name, Email, PhoneNumber, OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays, NextFollowUpDate, UpcomingFollowUp, etc.
 */
  async function getLandDevelopmentContacts(params) {
  const sp = params && typeof params === 'object' ? params : {};
  const qs = new URLSearchParams();
  if (sp.type) qs.set('type', sp.type);
  if (sp.city) qs.set('city', sp.city);
  if (sp.state) qs.set('state', sp.state);
  if (sp.upcomingOnly) qs.set('upcomingOnly', sp.upcomingOnly === true || sp.upcomingOnly === 'true' ? 'true' : '');
  if (sp.q) qs.set('q', sp.q);
  const query = qs.toString() ? '?' + qs.toString() : '';
  return apiRequest(`/api/land-development/contacts${query}`);
}

/**
 * Get one land development contact by ContactId. GET /api/land-development/contacts/:id
 * @param {number} id - ContactId (core.contacts.Id / PersonId)
 * @returns {Promise<{ success: boolean, data?: Contact, error?: { message: string } }>}
 */
  async function getLandDevelopmentContact(id) {
  return apiRequest(`/api/land-development/contacts/${id}`);
}

/**
 * Create a land development contact. POST /api/land-development/contacts (REQUIRES AUTHENTICATION)
 * @param {object} data - Name (required); Email, PhoneNumber, OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays (optional)
 * @returns {Promise<{ success: boolean, data?: Contact, error?: { message: string } }>} data = merged contact (core + land-dev) including ContactId
 */
  async function createLandDevelopmentContact(data) {
  return apiRequest('/api/land-development/contacts', 'POST', data);
}

/**
 * Update a land development contact. PUT /api/land-development/contacts/:id (REQUIRES AUTHENTICATION)
 * @param {number} id - ContactId (core.contacts.Id)
 * @param {object} data - Same field set as create; only include fields to update
 * @returns {Promise<{ success: boolean, data?: Contact, error?: { message: string } }>}
 */
  async function updateLandDevelopmentContact(id, data) {
  return apiRequest(`/api/land-development/contacts/${id}`, 'PUT', data);
}

/**
 * Remove land-dev extension for contact (core contact remains). DELETE /api/land-development/contacts/:id (REQUIRES AUTHENTICATION)
 * @param {number} id - ContactId
 * @returns {Promise<{ success: boolean, message?: string, error?: { message: string } }>}
 */
  async function deleteLandDevelopmentContact(id) {
  return apiRequest(`/api/land-development/contacts/${id}`, 'DELETE');
}

/**
 * Send follow-up reminder email. POST /api/land-development/contacts/send-reminder (REQUIRES AUTHENTICATION)
 * Single: { contactId?, email?, message? } → { success: true, message: 'Reminder sent' }
 * Batch:  { contactIds: number[], email?, message? } → { success: true, sent: number, failed: Array<{ contactId?, email?, error }> }
 * @param {object} payload - contactId (number), or email (string), or contactIds (number[]); optional message (string). At least one recipient required.
 * @returns {Promise<{ success: boolean, message?: string, sent?: number, failed?: array, error?: { message: string } }>}
 */
  async function sendLandDevelopmentContactReminder(payload) {
  return apiRequest('/api/land-development/contacts/send-reminder', 'POST', payload);
}

// ============================================================
// PIPELINE: DEAL PIPELINE (Land Development Deal Tracker)
// ============================================================

/**
 * Get all deal pipeline records
 * 
 * Returns all deals with CORE attributes joined:
 * - ProjectName, City, State, Region, Units, ProductType, Stage (from core.Project)
 * - All Deal Pipeline specific fields (Bank, StartDate, UnitCount, PreConManager, etc.)
 * - BrokerReferralContactId, PriceRaw, ListingStatus, Zoning, County, CoordinateSource
 * - BrokerReferralContactName, BrokerReferralContactEmail, BrokerReferralContactPhone (joined)
 * 
 * @returns {Promise<object>} { success: true, data: [...] }
 * @example
 * const result = await getAllDealPipelines();
 * console.log('Deals:', result.data);
 */
  async function getAllDealPipelines() {
  return apiRequest('/api/pipeline/deal-pipeline');
}

/**
 * Get a deal pipeline record by ID
 * @param {number} id - Deal Pipeline ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getDealPipelineById(id) {
  return apiRequest(`/api/pipeline/deal-pipeline/${id}`);
}

/**
 * Get deal pipeline record by Project ID
 * @param {number} projectId - Project ID
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function getDealPipelineByProjectId(projectId) {
  return apiRequest(`/api/pipeline/deal-pipeline/project/${projectId}`);
}

/**
 * Create a new deal pipeline record
 * 
 * Creates/updates Project in core.Project and creates DealPipeline record.
 * 
 * CORE attributes (updates core.Project if provided):
 * - ProjectName, City, State, Region, Units, ProductType, Stage, EstimatedConstructionStartDate
 * 
 * Deal Pipeline specific attributes:
 * - ProjectId: number (optional - if not provided, will create project from ProjectName)
 * - Bank: string (bank name)
 * - StartDate: string (YYYY-MM-DD)
 * - UnitCount: number (updates core.Project.Units if Units not provided)
 * - PreConManagerId: number (FK to core.PreConManager)
 * - ConstructionLoanClosingDate: string (YYYY-MM-DD)
 * - Notes: string
 * - Priority: 'High' | 'Medium' | 'Low'
 * - Acreage: number
 * - LandPrice: number (price)
 * - ExecutionDate: string (YYYY-MM-DD)
 * - DueDiligenceDate: string (YYYY-MM-DD)
 * - ClosingDate: string (YYYY-MM-DD)
 * - PurchasingEntity: string
 * - Cash: boolean
 * - OpportunityZone: boolean
 * - ClosingNotes: string
 * - AsanaTaskGid: string (for sync tracking)
 * - AsanaProjectGid: string (for sync tracking)
 * - County: string (Site Tracking)
 * - ZipCode: string (Site Tracking)
 * - MFAcreage: number (MF Acreage, Site Tracking)
 * - Zoning: string (Site Tracking)
 * - Zoned: string (Yes/No/Partially, Site Tracking)
 * - ListingStatus: string (Listed/Unlisted, Site Tracking)
 * - BrokerReferralContactId: number | null (FK to Broker/Referral Contact)
 * - PriceRaw: string (e.g. "-", "$1.2M", "TBD")
 * - BrokerReferralSource: string (Site Tracking)
 * - RejectedReason: string (Site Tracking)
 * - Latitude: number (optional; also populated from KMZ attachments)
 * - Longitude: number (optional; also populated from KMZ attachments)
 * - CoordinateSource: string | null - 'KMZ' | 'Manual' | 'Procore' (set 'KMZ' when coords from uploaded KMZ/KML so frontend does not overwrite with Procore)
 * 
 * Note: SqFtPrice is automatically calculated as LandPrice / (Acreage * 43560)
 * 
 * @param {object} data - Deal pipeline data
 * @returns {Promise<object>} { success: true, data: {...} }
 * @example
 * // With existing ProjectId
 * await createDealPipeline({
 *   ProjectId: 1,
 *   ProjectName: 'The Heights at Picardy',
 *   ...
 * });
 * 
 * // Without ProjectId (will auto-create project)
 * await createDealPipeline({
 *   ProjectName: 'New Deal Name',
 *   City: 'Baton Rouge',
 *   State: 'LA',
 *   Region: 'Gulf Coast',
 *   Stage: 'Prospective',
 *   Bank: 'B1Bank',
 *   StartDate: '2024-01-15',
 *   UnitCount: 232,
 *   Priority: 'High',
 *   Acreage: 10.5,
 *   LandPrice: 5000000,
 *   Cash: true
 * });
 */
  async function createDealPipeline(data) {
  return apiRequest('/api/pipeline/deal-pipeline', 'POST', data);
}

/**
 * Update a deal pipeline record
 * 
 * Can update:
 * - CORE attributes (ProjectName, City, State, Region, Units, ProductType, Stage, EstimatedConstructionStartDate)
 * - Any Deal Pipeline specific fields (Bank, StartDate, County, Zoning, ListingStatus, PriceRaw, BrokerReferralContactId, Latitude, Longitude, CoordinateSource, etc.)
 * 
 * Note: SqFtPrice is automatically recalculated if LandPrice or Acreage changes. Set CoordinateSource: 'KMZ' when updating with coords from KMZ/KML upload.
 * 
 * @param {number} id - Deal Pipeline ID
 * @param {object} data - Fields to update (same as createDealPipeline)
 * @returns {Promise<object>} { success: true, data: {...} }
 */
  async function updateDealPipeline(id, data) {
  return apiRequest(`/api/pipeline/deal-pipeline/${id}`, 'PUT', data);
}

/**
 * Delete a deal pipeline record
 * @param {number} id - Deal Pipeline ID
 * @returns {Promise<object>} { success: true, message: '...' }
 */
  async function deleteDealPipeline(id) {
  return apiRequest(`/api/pipeline/deal-pipeline/${id}`, 'DELETE');
}

// ============================================================
// PIPELINE: DEAL PIPELINE ATTACHMENTS (file uploads per deal)
// ============================================================

/**
 * List all file attachments for a deal pipeline record
 * @param {number} dealPipelineId - Deal Pipeline ID
 * @returns {Promise<object>} { success: true, data: [{ DealPipelineAttachmentId, DealPipelineId, FileName, ContentType, FileSizeBytes, CreatedAt }, ...] }
 */
  async function listDealPipelineAttachments(dealPipelineId) {
  return apiRequest(`/api/pipeline/deal-pipeline/${dealPipelineId}/attachments`);
}

/**
 * Upload a file attachment for a deal pipeline record
 * Uses multipart/form-data; field name must be "file". Max file size 200MB.
 * @param {number} dealPipelineId - Deal Pipeline ID
 * @param {File|Blob} file - File or Blob to upload (e.g. from <input type="file">)
 * @returns {Promise<object>} { success: true, data: { DealPipelineAttachmentId, DealPipelineId, FileName, ContentType, FileSizeBytes, CreatedAt } }
 */
  async function uploadDealPipelineAttachment(dealPipelineId, file) {
  const formData = new FormData();
  formData.append('file', file);
  const options = {
    method: 'POST',
    headers: {},
    body: formData,
  };
  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }
  const response = await fetch(`${API_BASE_URL}/api/pipeline/deal-pipeline/${dealPipelineId}/attachments`, options);
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || `API Error: ${response.status}`);
  }
  return result;
}

/**
 * Get the URL to download a deal pipeline attachment (file stream).
 * Use this URL in <a href="..." download> or open in new tab. If the API requires auth,
 * use fetch with Authorization header and response.blob() then createObjectURL(blob).
 * @param {number} attachmentId - DealPipelineAttachmentId
 * @returns {string} Full URL to the download endpoint
 */
  function getDealPipelineAttachmentDownloadUrl(attachmentId) {
  return `${API_BASE_URL}/api/pipeline/deal-pipeline/attachments/${attachmentId}/download`;
}

/**
 * Update a deal pipeline attachment (metadata only: display name and/or content type)
 * @param {number} attachmentId - DealPipelineAttachmentId
 * @param {object} data - { FileName?: string, ContentType?: string }
 * @returns {Promise<object>} { success: true, data: { DealPipelineAttachmentId, DealPipelineId, FileName, ContentType, FileSizeBytes, CreatedAt } }
 */
  async function updateDealPipelineAttachment(attachmentId, data) {
  return apiRequest(`/api/pipeline/deal-pipeline/attachments/${attachmentId}`, 'PUT', data);
}

/**
 * Delete a deal pipeline attachment (and the file on the server)
 * @param {number} attachmentId - DealPipelineAttachmentId
 * @returns {Promise<object>} { success: true, message: 'Attachment deleted' }
 */
  async function deleteDealPipelineAttachment(attachmentId) {
  return apiRequest(`/api/pipeline/deal-pipeline/attachments/${attachmentId}`, 'DELETE');
}

// ============================================================
// BANKING FILES (per-project banking documents – separate from Deal Pipeline)
// Backend must implement these endpoints. See BACKEND-GUIDE-BANKING-FILES.md.
// ============================================================

/**
 * List all banking file attachments for a project (Banking Dashboard only; not Deal Pipeline).
 * @param {number} projectId - Project ID (ProjectId / Row)
 * @returns {Promise<object>} { success: true, data: [{ BankingFileId, ProjectId, FileName, ContentType, FileSizeBytes, CreatedAt }, ...] }
 */
  async function listBankingFiles(projectId) {
  return apiRequest(`/api/banking/projects/${projectId}/files`);
}

/**
 * Upload a banking file for a project. Uses multipart/form-data; field name "file". Max size 200MB.
 * @param {number} projectId - Project ID
 * @param {File|Blob} file - File to upload
 * @returns {Promise<object>} { success: true, data: { BankingFileId, ProjectId, FileName, ContentType, FileSizeBytes, CreatedAt } }
 */
  async function uploadBankingFile(projectId, file) {
  const formData = new FormData();
  formData.append('file', file);
  const options = {
    method: 'POST',
    headers: {},
    body: formData,
  };
  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }
  const response = await fetch(`${API_BASE_URL}/api/banking/projects/${projectId}/files`, options);
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || `API Error: ${response.status}`);
  }
  return result;
}

/**
 * Get download URL for a banking file.
 * NOTE: Opening this URL in a new tab will NOT send the auth token, so the API will return 401.
 * Use downloadBankingFile(attachmentId) instead to open/view with your current token.
 * @param {number} attachmentId - BankingFileId
 * @returns {string} Full URL to download endpoint
 */
  function getBankingFileDownloadUrl(attachmentId) {
  return `${API_BASE_URL}/api/banking/files/${attachmentId}/download`;
}

/**
 * Download or open a banking file using the current auth token (for use when user clicks the file).
 * Fetches with Bearer token, then opens the file in a new tab (or triggers download with filename).
 * @param {number} attachmentId - BankingFileId
 * @param {{ openInNewTab?: boolean }} options - openInNewTab: true = open in new tab (default); false = trigger download with filename
 * @returns {Promise<void>}
 */
  async function downloadBankingFile(attachmentId, options = {}) {
  const { openInNewTab = true } = options;
  const token = authToken;
  if (!token) {
    throw new Error('Not authenticated. Call login() or setAuthToken() before downloading files.');
  }
  const response = await fetch(`${API_BASE_URL}/api/banking/files/${attachmentId}/download`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Download failed: ${response.status}`);
  }
  const blob = await response.blob();
  const filename = (response.headers.get('Content-Disposition') || '').match(/filename\*?=(?:UTF-8'')?["']?([^"'\s;]+)["']?/i)?.[1]
    || response.headers.get('X-File-Name')
    || `banking-file-${attachmentId}`;
  const blobUrl = URL.createObjectURL(blob);
  if (openInNewTab) {
    const w = window.open(blobUrl, '_blank');
    if (w) setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    else { URL.revokeObjectURL(blobUrl); throw new Error('Popup blocked. Allow popups or use download: false.'); }
  } else {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = decodeURIComponent(filename);
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 500);
  }
}

/**
 * Delete a banking file (and file on server).
 * @param {number} attachmentId - BankingFileId
 * @returns {Promise<object>} { success: true, message: 'File deleted' }
 */
  async function deleteBankingFile(attachmentId) {
  return apiRequest(`/api/banking/files/${attachmentId}`, 'DELETE');
}

/**
 * Report presence (heartbeat) – "I'm viewing the banking dashboard." REQUIRES AUTHENTICATION.
 * Call periodically (e.g. every 45s) while the dashboard is open. Used for "Also viewing: Michael, Jane."
 * @param {object} [payload] - Optional: { userId, userName, email, timestamp }. Server uses JWT user if omitted.
 * @returns {Promise<object>} { success: true }
 */
  async function reportPresence(payload) {
  return apiRequest('/api/banking/presence', 'POST', payload || {});
}

/**
 * Get list of users who have reported presence recently (within ~2 min). REQUIRES AUTHENTICATION.
 * @returns {Promise<object>} { success: true, data: { users: [{ userId, userName, email, lastSeen }, ...] } }
 */
  async function getPresence() {
  return apiRequest('/api/banking/presence');
}

// ============================================================
// IMS INVESTOR HELPER FUNCTIONS (Legacy - kept for compatibility)
// ============================================================

/**
 * Get investor name from IMS Investor Profile ID
 */
  async function getInvestorNameFromIMSId(imsId) {
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
  async function resolveInvestorName(investorValue) {
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
  async function bulkResolveInvestorNames(investorValues) {
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
  async function resolveRowInvestorName(row, investorColumn = 'Investor') {
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
  async function resolveDatasetInvestorNames(dataset, investorColumn = 'Investor') {
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
  // EXPOSE ALL FUNCTIONS TO API OBJECT
  // ============================================================
  
  // Authentication functions
  API.login = login;
  API.loginWithDomo = loginWithDomo;
  API.verifyAuth = verifyAuth;
  API.getCurrentUser = getCurrentUser;
  API.logout = logout;
  
  // Core - Projects
  API.getAllProjects = getAllProjects;
  API.getProjectById = getProjectById;
  API.createProject = createProject;
  API.updateProject = updateProject;
  API.deleteProject = deleteProject;
  
  // Core - Banks
  API.getAllBanks = getAllBanks;
  API.getBankById = getBankById;
  API.createBank = createBank;
  API.updateBank = updateBank;
  API.deleteBank = deleteBank;
  
  // Core - Persons
  API.getContactBook = getContactBook;
  API.getAllPersons = getAllPersons;
  API.getPersonById = getPersonById;
  API.createPerson = createPerson;
  API.updatePerson = updatePerson;
  API.deletePerson = deletePerson;

  API.getAllPreConManagers = getAllPreConManagers;
  API.getPreConManagerById = getPreConManagerById;
  API.createPreConManager = createPreConManager;
  API.updatePreConManager = updatePreConManager;
  API.deletePreConManager = deletePreConManager;
  
  // Core - Equity Partners
  API.getAllEquityPartners = getAllEquityPartners;
  API.getEquityPartnerById = getEquityPartnerById;
  API.getEquityPartnerByIMSId = getEquityPartnerByIMSId;
  API.createEquityPartner = createEquityPartner;
  API.updateEquityPartner = updateEquityPartner;
  API.deleteEquityPartner = deleteEquityPartner;
  
  // Core - Product Types
  API.getAllProductTypes = getAllProductTypes;
  API.getProductTypeById = getProductTypeById;
  API.createProductType = createProductType;
  API.updateProductType = updateProductType;
  API.deleteProductType = deleteProductType;
  
  // Core - Regions
  API.getAllRegions = getAllRegions;
  API.getRegionById = getRegionById;
  API.createRegion = createRegion;
  API.updateRegion = updateRegion;
  API.deleteRegion = deleteRegion;
  
  // Banking - Loans
  API.getAllLoans = getAllLoans;
  API.getLoanById = getLoanById;
  API.getLoansByProject = getLoansByProject;
  API.getLoanParticipationSummary = getLoanParticipationSummary;
  API.createLoan = createLoan;
  API.updateLoan = updateLoan;
  API.updateLoanByProject = updateLoanByProject;
  API.deleteLoan = deleteLoan;
  API.copyLoanAttributes = copyLoanAttributes;
  API.setLoanActive = setLoanActive;
  // Banking - Loan Types (Loan Creation Wizard)
  API.getLoanTypes = getLoanTypes;
  API.getLoanTypeById = getLoanTypeById;
  API.createLoanType = createLoanType;
  API.updateLoanType = updateLoanType;
  API.deleteLoanType = deleteLoanType;
  API.checkLoanWizardReady = checkLoanWizardReady;
  API.getAllLoanModifications = getAllLoanModifications;
  API.getLoanModificationById = getLoanModificationById;
  API.getLoanModificationsByProject = getLoanModificationsByProject;
  API.createLoanModification = createLoanModification;
  API.updateLoanModification = updateLoanModification;
  API.deleteLoanModification = deleteLoanModification;
  
  // Banking - DSCR Tests
  API.getAllDSCRTests = getAllDSCRTests;
  API.getDSCRTestById = getDSCRTestById;
  API.getDSCRTestsByProject = getDSCRTestsByProject;
  API.createDSCRTest = createDSCRTest;
  API.updateDSCRTest = updateDSCRTest;
  API.deleteDSCRTest = deleteDSCRTest;
  
  // Banking - Participations
  API.getAllParticipations = getAllParticipations;
  API.getParticipationById = getParticipationById;
  API.getParticipationsByProject = getParticipationsByProject;
  API.createParticipation = createParticipation;
  API.createParticipationByProject = createParticipationByProject;
  API.updateParticipation = updateParticipation;
  API.deleteParticipation = deleteParticipation;
  
  // Banking - Guarantees
  API.getAllGuarantees = getAllGuarantees;
  API.getGuaranteeById = getGuaranteeById;
  API.getGuaranteesByProject = getGuaranteesByProject;
  API.createGuarantee = createGuarantee;
  API.createGuaranteeByProject = createGuaranteeByProject;
  API.updateGuarantee = updateGuarantee;
  API.deleteGuarantee = deleteGuarantee;
  
  // Banking - Covenants
  API.getAllCovenants = getAllCovenants;
  API.getCovenantById = getCovenantById;
  API.getCovenantsByProject = getCovenantsByProject;
  API.createCovenant = createCovenant;
  API.createCovenantByProject = createCovenantByProject;
  API.updateCovenant = updateCovenant;
  API.deleteCovenant = deleteCovenant;
  API.getBankingEmailTemplates = getBankingEmailTemplates;
  API.sendCovenantReminderNow = sendCovenantReminderNow;
  API.getUpcomingDatesReminderSettings = getUpcomingDatesReminderSettings;
  API.saveUpcomingDatesReminderSettings = saveUpcomingDatesReminderSettings;
  
  // Banking - Liquidity Requirements
  API.getAllLiquidityRequirements = getAllLiquidityRequirements;
  API.getLiquidityRequirementById = getLiquidityRequirementById;
  API.getLiquidityRequirementsByProject = getLiquidityRequirementsByProject;
  API.createLiquidityRequirement = createLiquidityRequirement;
  API.updateLiquidityRequirement = updateLiquidityRequirement;
  API.deleteLiquidityRequirement = deleteLiquidityRequirement;
  
  // Banking - Bank Targets
  API.getAllBankTargets = getAllBankTargets;
  API.getBankTargetById = getBankTargetById;
  API.createBankTarget = createBankTarget;
  API.updateBankTarget = updateBankTarget;
  API.deleteBankTarget = deleteBankTarget;
  
  // Banking - Equity Commitments
  API.getAllEquityCommitments = getAllEquityCommitments;
  API.getEquityCommitmentById = getEquityCommitmentById;
  API.getEquityCommitmentsByProject = getEquityCommitmentsByProject;
  API.createEquityCommitment = createEquityCommitment;
  API.updateEquityCommitment = updateEquityCommitment;
  API.deleteEquityCommitment = deleteEquityCommitment;
  API.getRelatedPartiesByCommitment = getRelatedPartiesByCommitment;
  API.addRelatedParty = addRelatedParty;
  API.removeRelatedParty = removeRelatedParty;
  
  // Banking - Loan Proceeds
  API.getAllLoanProceeds = getAllLoanProceeds;
  API.getLoanProceedsById = getLoanProceedsById;
  API.getLoanProceedsByProject = getLoanProceedsByProject;
  API.getLoanProceedsByLoan = getLoanProceedsByLoan;
  API.createLoanProceeds = createLoanProceeds;
  API.updateLoanProceeds = updateLoanProceeds;
  API.deleteLoanProceeds = deleteLoanProceeds;
  
  // Banking - Guarantee Burndowns
  API.getAllGuaranteeBurndowns = getAllGuaranteeBurndowns;
  API.getGuaranteeBurndownById = getGuaranteeBurndownById;
  API.getGuaranteeBurndownsByProject = getGuaranteeBurndownsByProject;
  API.getGuaranteeBurndownsByPerson = getGuaranteeBurndownsByPerson;
  API.createGuaranteeBurndown = createGuaranteeBurndown;
  API.updateGuaranteeBurndown = updateGuaranteeBurndown;
  API.deleteGuaranteeBurndown = deleteGuaranteeBurndown;
  
  // Pipeline - Under Contract
  API.getAllUnderContracts = getAllUnderContracts;
  API.getUnderContractById = getUnderContractById;
  API.getUnderContractByProjectId = getUnderContractByProjectId;
  API.createUnderContract = createUnderContract;
  API.updateUnderContract = updateUnderContract;
  API.deleteUnderContract = deleteUnderContract;
  
  // Pipeline - Commercial Listed
  API.getAllCommercialListed = getAllCommercialListed;
  API.getCommercialListedById = getCommercialListedById;
  API.getCommercialListedByProjectId = getCommercialListedByProjectId;
  API.createCommercialListed = createCommercialListed;
  API.updateCommercialListed = updateCommercialListed;
  API.deleteCommercialListed = deleteCommercialListed;
  
  // Pipeline - Commercial Acreage
  API.getAllCommercialAcreage = getAllCommercialAcreage;
  API.getCommercialAcreageById = getCommercialAcreageById;
  API.getCommercialAcreageByProjectId = getCommercialAcreageByProjectId;
  API.createCommercialAcreage = createCommercialAcreage;
  API.updateCommercialAcreage = updateCommercialAcreage;
  API.deleteCommercialAcreage = deleteCommercialAcreage;
  
  // Pipeline - Closed Properties
  API.getAllClosedProperties = getAllClosedProperties;
  API.getClosedPropertyById = getClosedPropertyById;
  API.createClosedProperty = createClosedProperty;
  API.updateClosedProperty = updateClosedProperty;
  API.deleteClosedProperty = deleteClosedProperty;
  
  // Pipeline - Broker/Referral Contacts
  API.getAllBrokerReferralContacts = getAllBrokerReferralContacts;
  API.getBrokerReferralContactById = getBrokerReferralContactById;
  API.createBrokerReferralContact = createBrokerReferralContact;
  API.updateBrokerReferralContact = updateBrokerReferralContact;
  API.deleteBrokerReferralContact = deleteBrokerReferralContact;
  
  // Land Development Contacts (spec: getLandDevelopmentContacts, getLandDevelopmentContact, create, update, delete, sendLandDevelopmentContactReminder)
  API.getLandDevelopmentContacts = getLandDevelopmentContacts;
  API.getLandDevelopmentContact = getLandDevelopmentContact;
  API.createLandDevelopmentContact = createLandDevelopmentContact;
  API.updateLandDevelopmentContact = updateLandDevelopmentContact;
  API.deleteLandDevelopmentContact = deleteLandDevelopmentContact;
  API.sendLandDevelopmentContactReminder = sendLandDevelopmentContactReminder;
  // Backward-compat aliases
  API.getAllLandDevelopmentContacts = getLandDevelopmentContacts;
  API.getLandDevelopmentContactById = getLandDevelopmentContact;
  API.sendLandDevelopmentReminder = sendLandDevelopmentContactReminder;
  
  // Pipeline - Deal Pipeline
  API.getAllDealPipelines = getAllDealPipelines;
  API.getDealPipelineById = getDealPipelineById;
  API.getDealPipelineByProjectId = getDealPipelineByProjectId;
  API.createDealPipeline = createDealPipeline;
  API.updateDealPipeline = updateDealPipeline;
  API.deleteDealPipeline = deleteDealPipeline;
  // Deal Pipeline Attachments (file uploads per deal)
  API.listDealPipelineAttachments = listDealPipelineAttachments;
  API.uploadDealPipelineAttachment = uploadDealPipelineAttachment;
  API.updateDealPipelineAttachment = updateDealPipelineAttachment;
  API.getDealPipelineAttachmentDownloadUrl = getDealPipelineAttachmentDownloadUrl;
  API.deleteDealPipelineAttachment = deleteDealPipelineAttachment;
  // Banking Files (per-project; separate from Deal Pipeline)
  API.listBankingFiles = listBankingFiles;
  API.uploadBankingFile = uploadBankingFile;
  API.getBankingFileDownloadUrl = getBankingFileDownloadUrl;
  API.downloadBankingFile = downloadBankingFile;
  API.deleteBankingFile = deleteBankingFile;
  API.reportPresence = reportPresence;
  API.getPresence = getPresence;

  // IMS Investor Resolution
  API.getInvestorNameFromIMSId = getInvestorNameFromIMSId;
  API.resolveInvestorName = resolveInvestorName;
  API.bulkResolveInvestorNames = bulkResolveInvestorNames;
  API.resolveRowInvestorName = resolveRowInvestorName;
  API.resolveDatasetInvestorNames = resolveDatasetInvestorNames;

  // Expose API to global scope
  const globalScope = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : this;
  
  // Expose API object
  globalScope.API = API;
  
  // Also expose functions directly for backward compatibility
  Object.keys(API).forEach(key => {
    globalScope[key] = API[key];
  });

})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : this);

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

// Example 4b: Create a construction loan with FixedOrFloating and IndexName
const constructionLoan = await createLoan({
  ProjectId: 1,
  LoanPhase: 'Construction',
  FixedOrFloating: 'Floating',  // Must be 'Fixed' or 'Floating'
  IndexName: 'SOFR',            // For Construction: 'Prime' or 'SOFR'
  Spread: '2.75%',
  LoanAmount: 5000000,
  LenderId: 5
});
console.log('Created loan:', constructionLoan.data);

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
    FixedOrFloating: 'Floating',  // Selection: 'Fixed' or 'Floating'
    IndexName: 'SOFR',            // For Construction: 'Prime' or 'SOFR'
    Spread: '2.75%',
    LoanAmount: 5000000,
    LoanClosingDate: '2024-01-15',
    FinancingStage: 'Construction Loan'
  };
  
  const createResult = await createLoan(loanData);
  console.log('✅ Loan created:', createResult.data);
  
  // Step 3: Update operations also work automatically with stored token
  await updateLoan(createResult.data.LoanId, { 
    LoanAmount: 5500000,
    FixedOrFloating: 'Floating',
    IndexName: 'Prime'  // Changed from SOFR to Prime
  });
  
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
