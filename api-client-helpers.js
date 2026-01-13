/**
 * Helper Functions for Resolving IMS Investor IDs to Names
 * 
 * Use these functions in Domo Custom Scripts to resolve IMS Investor Profile IDs
 * to actual investor names.
 * 
 * Copy the functions you need into your Domo Custom Script.
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

/**
 * Get investor name from IMS Investor Profile ID
 * 
 * @param {string} imsId - The IMS Investor Profile ID (e.g., '2660619')
 * @returns {Promise<string|null>} Investor name or null if not found
 * 
 * Example:
 *   const name = await getInvestorNameFromIMSId('2660619');
 *   // Returns: "Investor Name" or null
 */
async function getInvestorNameFromIMSId(imsId) {
  if (!imsId || typeof imsId !== 'string') return null;
  
  try {
    const result = await apiRequest(`/api/core/equity-partners/ims/${imsId}`, 'GET');
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
 * 
 * @param {string} investorValue - Could be an IMS ID (all digits) or a name
 * @returns {Promise<string>} Resolved investor name
 * 
 * Example:
 *   const name1 = await resolveInvestorName('2660619'); // Looks up ID
 *   const name2 = await resolveInvestorName('Stoa Holdings, LLC'); // Returns as-is
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
 * 
 * @param {Array<string>} investorValues - Array of investor values (IDs or names)
 * @returns {Promise<Object>} Mapping of original value to resolved name
 * 
 * Example:
 *   const mapping = await bulkResolveInvestorNames(['2660619', '2661230', 'Stoa Holdings, LLC']);
 *   // Returns: { '2660619': 'Investor Name 1', '2661230': 'Investor Name 2', 'Stoa Holdings, LLC': 'Stoa Holdings, LLC' }
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
 * 
 * @param {Object} row - Dataset row
 * @param {string} investorColumn - Column name containing investor value
 * @returns {Promise<Object>} Row with resolved investor name
 * 
 * Example:
 *   const resolvedRow = await resolveRowInvestorName(row, 'Investor');
 *   // Adds or updates 'InvestorName' field with resolved name
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
 * 
 * @param {Array<Object>} dataset - Array of row objects
 * @param {string} investorColumn - Column name containing investor value
 * @returns {Promise<Array<Object>>} Dataset with resolved investor names
 * 
 * Example in Domo:
 *   const resolvedData = await resolveDatasetInvestorNames(data, 'Investor');
 *   return resolvedData;
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
// DOMO USAGE EXAMPLES
// ============================================================

/*
// Example 1: Simple lookup in Domo Custom Script
const imsId = '2660619';
const investorName = await getInvestorNameFromIMSId(imsId);
console.log('Investor Name:', investorName);

// Example 2: Transform a single row
const row = { Investor: '2660619', Amount: 1000000 };
const resolvedRow = await resolveRowInvestorName(row, 'Investor');
console.log('Resolved:', resolvedRow.InvestorName);

// Example 3: Transform entire dataset (most common use case)
// In Domo Custom Script, replace your return statement with:
const resolvedData = await resolveDatasetInvestorNames(data, 'Investor');
return resolvedData;

// Example 4: Handle multiple investor columns
const dataWithResolvedNames = await resolveDatasetInvestorNames(data, 'Investor');
const finalData = await resolveDatasetInvestorNames(dataWithResolvedNames, 'Partner');
return finalData;
*/

// Export for use in Domo (if using modules)
// export { getInvestorNameFromIMSId, resolveInvestorName, bulkResolveInvestorNames, resolveRowInvestorName, resolveDatasetInvestorNames };
