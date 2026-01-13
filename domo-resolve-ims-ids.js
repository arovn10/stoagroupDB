/**
 * Domo Custom Script: Resolve IMS Investor IDs to Names
 * 
 * Copy this entire script into your Domo Custom Script to resolve
 * IMS Investor Profile IDs (like "2660619") to actual investor names.
 * 
 * USAGE:
 * 1. Copy this entire file into Domo Custom Script
 * 2. Replace 'Investor' with your actual column name containing investor values
 * 3. The script will automatically detect IDs and resolve them
 */

const API_BASE_URL = 'https://stoagroupdb.onrender.com';

// Make API request
async function apiRequest(endpoint, method = 'GET', data = null) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
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

// Get investor name from IMS ID
async function getInvestorNameFromIMSId(imsId) {
  if (!imsId || typeof imsId !== 'string') return null;
  try {
    const result = await apiRequest(`/api/core/equity-partners/ims/${imsId}`, 'GET');
    return result.success && result.data ? result.data.PartnerName : null;
  } catch (error) {
    console.error(`Error looking up IMS ID ${imsId}:`, error);
    return null;
  }
}

// Check if value is an IMS ID (all digits, 6+ characters)
function isIMSId(value) {
  if (!value) return false;
  const str = String(value).trim();
  return /^\d{6,}$/.test(str);
}

// Resolve investor name - handles both IDs and names
async function resolveInvestorName(investorValue) {
  if (!investorValue) return null;
  const str = String(investorValue).trim();
  
  // If it's an IMS ID, look it up
  if (isIMSId(str)) {
    const name = await getInvestorNameFromIMSId(str);
    return name || str; // Return ID if name not found
  }
  
  // Otherwise return as-is (it's already a name)
  return str;
}

// Bulk resolve with caching for performance
async function bulkResolveInvestorNames(investorValues) {
  const mapping = {};
  const uniqueValues = [...new Set(investorValues.filter(Boolean))];
  
  // Process in parallel batches to avoid overwhelming the API
  const batchSize = 10;
  for (let i = 0; i < uniqueValues.length; i += batchSize) {
    const batch = uniqueValues.slice(i, i + batchSize);
    const promises = batch.map(async (value) => {
      const resolved = await resolveInvestorName(value);
      mapping[value] = resolved;
    });
    await Promise.all(promises);
  }
  
  return mapping;
}

// ============================================================
// MAIN SCRIPT - Modify column name as needed
// ============================================================

// CONFIGURATION: Change this to match your column name
const INVESTOR_COLUMN = 'Investor'; // Change to 'Partner', 'InvestorName', etc.

// Transform dataset
async function transformData(data) {
  if (!Array.isArray(data) || data.length === 0) return data;
  
  // Get all unique investor values
  const investorValues = data
    .map(row => row[INVESTOR_COLUMN])
    .filter(Boolean);
  
  // Bulk resolve all unique values
  const nameMapping = await bulkResolveInvestorNames(investorValues);
  
  // Apply mapping to dataset
  return data.map(row => {
    const originalValue = row[INVESTOR_COLUMN];
    const resolvedName = nameMapping[originalValue] || originalValue;
    
    return {
      ...row,
      [INVESTOR_COLUMN]: resolvedName,
      InvestorName: resolvedName, // Add resolved name column
      OriginalInvestorValue: originalValue // Keep original for reference
    };
  });
}

// Execute transformation
const resolvedData = await transformData(data);
return resolvedData;
