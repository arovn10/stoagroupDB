/*
 * Deal Pipeline Tracker
 * Interactive dashboard for tracking construction deals
 */

// Stage configuration with colors
const STAGE_CONFIG = {
    'Prospective': { class: 'prospective', color: '#8b5cf6' },
    'Under Contract': { class: 'under-contract', color: '#2563eb' },
    'Started': { class: 'started', color: '#ef4444' },
    'Stabilized': { class: 'stabilized', color: '#f59e0b' },
    'Closed': { class: 'closed', color: '#10b981' },
    'START': { class: 'start', color: '#f97316' }
};

// Global state
let allDeals = [];
let procoreProjectMap = {}; // Map of project name -> { actualstartdate, ... }
let currentView = 'overview';
let currentFilters = {
    stage: '',
    location: '',
    bank: '',
    product: '',
    state: '', // State filter (extracted from location)
    search: '', // Search/filter text
    year: '', // Year filter (replaces exact date ranges)
    timelineStartDate: null, // For timeline date range filter (kept for timeline view)
    timelineEndDate: null    // null means no end date (unlimited)
};
let currentSort = { by: 'date', order: 'asc' }; // Default to ascending (oldest first)
let blockSort = { by: 'date', order: 'asc' }; // Sort within blocks (year/quarter groups)
let listViewMode = 'timeline'; // 'timeline' or 'stage' - timeline shows by quarter/year, stage shows by stage
let mapInstance = null;
let mapMarkers = []; // Store markers with deal data
let visibleDealsForMap = []; // Deals currently visible on map
let allMapMarkers = []; // Store all markers (for city view toggle)
let isCityView = false; // Track if we're in city view mode
let currentCityView = null; // Store current city view data

// Normalize stage name for consistent grouping
function normalizeStage(stage) {
    if (!stage) return 'Unknown';
    const stageStr = String(stage);
    const stageLower = stageStr.toLowerCase().trim();
    
    // Map variations to standard stages
    if (stageLower === 'start') return 'START';
    if (stageLower.includes('prospect')) return 'Prospective';
    if (stageLower.includes('contract')) return 'Under Contract';
    if (stageLower.includes('stabiliz')) return 'Stabilized';
    if (stageLower.includes('close')) return 'Closed';
    if (stageLower.includes('started')) return 'Started';
    if (stageLower.includes('start') && !stageLower.includes('started')) return 'START';
    
    return stage;
}

// Normalize bank name for fuzzy matching (remove spaces, hyphens, common suffixes, lowercase, etc.)
function normalizeBankName(bank) {
    if (!bank || bank === 'Unknown') return 'Unknown';
    // Normalize: trim, convert to lowercase
    let normalized = String(bank).trim().toLowerCase();
    
    // First, remove all spaces and hyphens
    // This handles: "B1 Bank" = "b1bank", "Pen - Air" = "penair", etc.
    normalized = normalized.replace(/[\s\-]+/g, '');
    
    // Then remove common bank suffixes (bank, banks, etc.) - but only if the remaining part is meaningful
    // This handles: "Renasant Bank" = "renasant", "RenasantBank" = "renasant"
    // But keeps: "B1Bank" = "b1bank" (since "b1" is too short/not meaningful)
    const bankSuffixes = ['bank', 'banks', 'bancorp', 'bancshares', 'financial', 'group'];
    for (const suffix of bankSuffixes) {
        if (normalized.endsWith(suffix)) {
            const withoutSuffix = normalized.slice(0, -suffix.length);
            // Only remove suffix if what remains is at least 3 characters (meaningful name)
            // OR if the original had a space before the suffix (like "Renasant Bank")
            if (withoutSuffix.length >= 3) {
                normalized = withoutSuffix;
                break; // Only remove one suffix
            }
        }
    }
    
    return normalized;
}

// Map of normalized bank names to canonical display names
let bankNameMap = {};

// Build bank name mapping from all deals
function buildBankNameMap(deals) {
    const bankCounts = {};
    const normalizedToCanonical = {};
    
    // First pass: count occurrences of each bank name variant
    deals.forEach(deal => {
        const bank = deal.Bank || deal.bank;
        if (bank && bank !== 'Unknown') {
            const normalized = normalizeBankName(bank);
            if (!bankCounts[normalized]) {
                bankCounts[normalized] = {};
            }
            const original = bank.trim();
            bankCounts[normalized][original] = (bankCounts[normalized][original] || 0) + 1;
        }
    });
    
    // Second pass: for each normalized name, pick the most common variant as canonical
    Object.keys(bankCounts).forEach(normalized => {
        const variants = bankCounts[normalized];
        let maxCount = 0;
        let canonical = '';
        
        Object.keys(variants).forEach(variant => {
            if (variants[variant] > maxCount) {
                maxCount = variants[variant];
                canonical = variant;
            }
        });
        
        normalizedToCanonical[normalized] = canonical;
    });
    
    bankNameMap = normalizedToCanonical;
    return normalizedToCanonical;
}

// Get canonical bank name for display
function getCanonicalBankName(bank) {
    if (!bank || bank === 'Unknown') return 'Unknown';
    const normalized = normalizeBankName(bank);
    return bankNameMap[normalized] || bank.trim();
}

// Format date for display - always include year
function formatDate(dateString) {
    if (!dateString) return '';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
        });
    } catch (e) {
        return dateString;
    }
}

// Check if date is overdue
function isOverdue(dateString) {
    if (!dateString) return false;
    try {
        const date = new Date(dateString);
        return date < new Date() && date.getTime() !== new Date().setHours(0,0,0,0);
    } catch (e) {
        return false;
    }
}

// Get location from deal (checking all possible field variations)
function getDealLocation(deal) {
    if (!deal) return null;
    const location = deal.Location || deal.location || 
                    deal['Location Custom'] || deal.locationCustom ||
                    deal.customfieldsdisplayvalue || deal.custom_fields_display_value ||
                    deal.customfieldsenumvaluename || deal.custom_fields_enum_value_name ||
                    null;
    // Filter out invalid values
    if (location && location !== 'Unknown' && location !== 'List' && location.trim() !== '') {
        return location.trim();
    }
    return null;
}

// Get product type from deal (checking all possible field variations)
function getDealProductType(deal) {
    if (!deal) return null;
    const productType = deal['Product Type'] || deal.productType || 
                       deal['Product Type Custom'] || deal.productTypeCustom ||
                       null;
    // Filter out invalid values
    if (productType && productType !== 'List' && productType.trim() !== '') {
        return productType.trim();
    }
    return null;
}

// Parse notes field to extract structured information
function parseNotes(notes) {
    if (!notes) return {};
    
    const parsed = {};
    const lines = notes.split('\n').map(l => l.trim()).filter(l => l);
    
    // First, try to find bank in "Lender:" format (bank name is usually on next line)
    const lenderIndex = lines.findIndex(line => line.toLowerCase().startsWith('lender:'));
    if (lenderIndex >= 0) {
        // Check if bank name is on same line
        const lenderLine = lines[lenderIndex];
        const sameLineMatch = lenderLine.match(/lender:\s*(.+)/i);
        if (sameLineMatch && sameLineMatch[1].trim()) {
            const bankName = sameLineMatch[1].trim();
            // Don't accept common product type names as banks
            if (!['prototype', 'heights/flats', 'heights', 'flats'].includes(bankName.toLowerCase())) {
                parsed.bank = bankName;
            }
        } else if (lenderIndex + 1 < lines.length) {
            // Bank name is likely on the next line (indented, like "    B1Bank")
            const nextLine = lines[lenderIndex + 1].trim();
            // Skip if it's another section header (like "Lender Counsel:")
            if (!nextLine.includes(':') && nextLine.length > 0) {
                // Extract bank name - stop at email addresses, lowercase words (likely names), or other indicators
                // Bank names are typically: "B1Bank", "Hancock Whitney", "First National Bank", etc.
                // Pattern: capture bank name, stop before email (@), or before lowercase word that looks like a name
                let bankName = nextLine;
                
                // Remove email addresses
                bankName = bankName.replace(/\s+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}.*$/, '').trim();
                
                // If there's a space followed by a capitalized word (likely a person's name), stop there
                // e.g., "B1Bank Gregory Pogue" -> "B1Bank"
                const nameMatch = bankName.match(/^([A-Za-z0-9\s&\.\-]+?)(?:\s+[A-Z][a-z]+\s+[A-Z])/);
                if (nameMatch) {
                    bankName = nameMatch[1].trim();
                } else {
                    // Otherwise, take the first part before any lowercase word (likely a name)
                    const simpleMatch = bankName.match(/^([A-Za-z0-9\s&\.\-]+?)(?:\s+[a-z])/);
                    if (simpleMatch) {
                        bankName = simpleMatch[1].trim();
                    } else {
                        bankName = bankName.trim();
                    }
                }
                
                // Don't accept common product type names as banks
                if (bankName && !['prototype', 'heights/flats', 'heights', 'flats'].includes(bankName.toLowerCase())) {
                    parsed.bank = bankName;
                }
            }
        }
    }
    
    lines.forEach((line, index) => {
        // Location: [city, state]
        if (line.toLowerCase().startsWith('location:')) {
            parsed.location = line.replace(/^location:\s*/i, '').trim();
        }
        // Units: [number]
        else if (line.toLowerCase().startsWith('units:')) {
            const match = line.match(/units:\s*(\d+)/i);
            if (match) parsed.units = match[1];
        }
        // Bank information (fallback - might be in various formats)
        else if (line.toLowerCase().includes('bank') && !parsed.bank) {
            const match = line.match(/bank[:\s]+([^,\n]+)/i);
            if (match) {
                const bankName = match[1].trim();
                // Don't accept common product type names as banks
                if (!['prototype', 'heights/flats', 'heights', 'flats'].includes(bankName.toLowerCase())) {
                    parsed.bank = bankName;
                }
            }
        }
        // Product Type - look for explicit product type labels
        else if (line.toLowerCase().includes('product') || (line.toLowerCase().includes('type') && !line.toLowerCase().includes('bank'))) {
            const match = line.match(/(?:product|type)[:\s]+([^,\n]+)/i);
            if (match) parsed.productType = match[1].trim();
        }
        // Pre-Con Manager - look for "Pre-Con Manager:" or "Pre-Con:" or "Preconstruction Manager:"
        else if ((line.toLowerCase().includes('pre') && line.toLowerCase().includes('con')) || 
                 line.toLowerCase().includes('preconstruction')) {
            // Look for manager name after "Pre-Con Manager:" or similar
            const managerMatch = line.match(/(?:pre[- ]?con|preconstruction)[\s-]*(?:manager|coordinator)?[:\s]+([A-Za-z\s]+)/i);
            if (managerMatch) {
                parsed.preCon = managerMatch[1].trim();
            } else {
                // Fallback: if line contains pre-con but no manager label, might be the manager name
                const simpleMatch = line.match(/pre[- ]?con[:\s]+([^,\n]+)/i);
                if (simpleMatch && !simpleMatch[1].toLowerCase().includes('manager') && 
                    !simpleMatch[1].toLowerCase().includes('checklist') &&
                    !simpleMatch[1].toLowerCase().includes('insure')) {
                    parsed.preCon = simpleMatch[1].trim();
                }
            }
        }
    });
    
    // Also try regex patterns for units if not found
    if (!parsed.units) {
        const unitMatch = notes.match(/units?[:\s]+(\d+)/i);
        if (unitMatch) parsed.units = unitMatch[1];
    }
    
    // Extract location from first line if it's a city/state format
    if (!parsed.location && lines.length > 0) {
        const firstLine = lines[0];
        // Check if it looks like a location (city, state format)
        if (firstLine.includes(',') && firstLine.length < 100) {
            parsed.location = firstLine;
        }
    }
    
    return parsed;
}

// Determine stage from name and other indicators
function determineStage(name, notes, completed, color) {
    const nameLower = (name || '').toLowerCase();
    const notesLower = (notes || '').toLowerCase();
    const combined = nameLower + ' ' + notesLower;
    
    // Check for START stage (names like "Start 1", "Start 2", etc.)
    if (nameLower.match(/^start\s+\d+/)) {
        return 'START';
    }
    
    // Check if completed
    if (completed === true || completed === 'true') {
        return 'Closed';
    }
    
    // Check notes for stage indicators
    if (combined.includes('closed') || combined.includes('closing')) {
        return 'Closed';
    }
    if (combined.includes('under contract') || combined.includes('contract')) {
        return 'Under Contract';
    }
    if (combined.includes('started') || combined.includes('construction')) {
        return 'Started';
    }
    if (combined.includes('stabilized') || combined.includes('stabiliz')) {
        return 'Stabilized';
    }
    if (combined.includes('prospect')) {
        return 'Prospective';
    }
    
    // Default based on color if available
    if (color) {
        const colorMap = {
            'purple': 'Prospective',
            'blue': 'Under Contract',
            'red': 'Started',
            'yellow': 'Stabilized',
            'green': 'Closed',
            'orange': 'START',
            'yellow-green': 'Prospective' // Default for yellow-green
        };
        return colorMap[color.toLowerCase()] || 'Prospective';
    }
    
    return 'Prospective';
}

// Map Asana data fields to deal structure
function mapAsanaDataToDeal(asanaItem) {
    const name = asanaItem.name || '';
    const notes = asanaItem.notes || '';
    const parsedNotes = parseNotes(notes);
    
    // Determine stage - prioritize Stage custom field if available
    let stage = null;
    // Check for Stage custom field in multiple possible locations
    if (asanaItem.Stage || asanaItem.stage || asanaItem['Stage Custom']) {
        // Use Stage custom field if available
        stage = asanaItem.Stage || asanaItem.stage || asanaItem['Stage Custom'];
        // Normalize the stage value
        stage = normalizeStage(stage);
    } else if (asanaItem.customfieldsname === 'Stage' || asanaItem.custom_fields_name === 'Stage') {
        // Check if this row has Stage custom field data directly
        const stageValue = asanaItem.customfieldsdisplayvalue || asanaItem.custom_fields_display_value ||
                          asanaItem.customfieldsenumvaluename || asanaItem.custom_fields_enum_value_name;
        if (stageValue && stageValue !== 'List' && stageValue.trim() !== '') {
            stage = normalizeStage(stageValue);
        }
    }
    
    // Fall back to determineStage() if no Stage custom field found
    if (!stage) {
        stage = determineStage(name, notes, asanaItem.completed, asanaItem.color);
    }
    
    // CRITICAL: If this is a START deal (in any form), return null to exclude it completely
    // Check for all variations: "START", "S T A R T", "start", etc.
    const stageStr = String(stage || '').trim();
    const stageLower = stageStr.toLowerCase();
    if (stageStr === 'START' || 
        stageLower === 'start' || 
        stageStr === 'S T A R T' ||
        stageLower === 's t a r t' ||
        stageStr.includes('START') ||
        (stageLower.includes('start') && !stageLower.includes('started'))) {
        // Return null to signal this deal should be excluded completely
        return null;
    }
    
    // Extract product type from name if it contains "Heights", "Flats", "Waters"
    let productType = parsedNotes.productType;
    if (!productType) {
        if (name.includes('Heights')) productType = 'Heights/Flats';
        else if (name.includes('Flats')) productType = 'Heights/Flats';
        else if (name.includes('Waters')) productType = 'Prototype';
        else if (name.match(/^Start\s+\d+/)) productType = null; // START items don't have product type
    }
    
    // Ensure bank is not a product type name
    let bank = parsedNotes.bank || null;
    if (bank) {
        const bankLower = bank.toLowerCase();
        if (['prototype', 'heights/flats', 'heights', 'flats'].includes(bankLower)) {
            bank = null; // Don't set bank if it's actually a product type
        }
    }
    
    // Check for Bank custom field from Domo (if it exists in the data)
    if (!bank && (asanaItem.Bank || asanaItem.bank)) {
        bank = asanaItem.Bank || asanaItem.bank;
    }
    
    // Check for Location custom field from Domo (if it exists in the data)
    // Check multiple possible field name variations from the new data format
    let location = parsedNotes.location || null;
    if (!location) {
        location = asanaItem.Location || asanaItem.location || 
                   asanaItem['Location Custom'] || asanaItem.locationCustom ||
                   asanaItem.customfieldsdisplayvalue || asanaItem.custom_fields_display_value ||
                   asanaItem.customfieldsenumvaluename || asanaItem.custom_fields_enum_value_name ||
                   null;
    }
    
    // Check for Pre-Con Manager custom field from Domo (prioritize custom field over parsed notes)
    let preCon = null;
    // First check custom field (this is the primary source)
    if (asanaItem['Pre-Con Manager'] || asanaItem.PreConManager || asanaItem.preConManager) {
        preCon = asanaItem['Pre-Con Manager'] || asanaItem.PreConManager || asanaItem.preConManager;
    }
    // Fall back to parsed notes if custom field not available
    if (!preCon) {
        preCon = parsedNotes.preCon || null;
    }
    
    // Check for Unit Count custom field (prefer custom field over parsed notes)
    if (asanaItem['Unit Count Custom']) {
        parsedNotes.units = asanaItem['Unit Count Custom'];
    }
    
    // Check for Start Date - prioritize Procore actualstartdate, then custom field, then due_on
    let startDate = null;
    let dateSource = 'none';
    const dealName = name || asanaItem.name || '';
    
    // First, check if we have a matching Procore project (exact match or fuzzy match)
    if (dealName) {
        // Try exact match first
        if (procoreProjectMap[dealName] && procoreProjectMap[dealName].actualstartdate) {
            startDate = procoreProjectMap[dealName].actualstartdate;
            dateSource = 'procore';
            console.log(`Using Procore actualstartdate for "${dealName}" (exact match): ${startDate}`);
        } else {
            // Try fuzzy matching - find Procore project that contains the deal name or vice versa
            const dealNameLower = dealName.toLowerCase().trim();
            let matchedProject = null;
            
            for (const [procoreName, procoreData] of Object.entries(procoreProjectMap)) {
                if (!procoreData.actualstartdate) continue;
                
                const procoreNameLower = procoreName.toLowerCase().trim();
                
                // Check if Asana name is contained in Procore name (e.g., "Settlers" in "The Waters at Settlers Trace")
                if (procoreNameLower.includes(dealNameLower)) {
                    matchedProject = { name: procoreName, data: procoreData };
                    break;
                }
                
                // Check if Procore name is contained in Asana name (e.g., "The Waters at Settlers Trace" in "Settlers Trace")
                if (dealNameLower.includes(procoreNameLower)) {
                    matchedProject = { name: procoreName, data: procoreData };
                    break;
                }
                
                // Check for key word matches (e.g., "Settlers" matches "Settlers Trace")
                const dealWords = dealNameLower.split(/\s+/).filter(w => w.length > 3); // Words longer than 3 chars
                const procoreWords = procoreNameLower.split(/\s+/).filter(w => w.length > 3);
                
                // If any significant word from deal name appears in Procore name, it's a match
                if (dealWords.length > 0 && dealWords.some(word => procoreWords.includes(word))) {
                    matchedProject = { name: procoreName, data: procoreData };
                    break;
                }
            }
            
            if (matchedProject) {
                startDate = matchedProject.data.actualstartdate;
                dateSource = 'procore';
                console.log(`Using Procore actualstartdate for "${dealName}" (fuzzy match to "${matchedProject.name}"): ${startDate}`);
            }
        }
    }
    
    // Fall back to Asana custom field
    if (!startDate && asanaItem['Start Date Custom']) {
        startDate = asanaItem['Start Date Custom'];
        dateSource = 'asana_custom';
    }
    
    // Finally, fall back to due_on
    if (!startDate) {
        startDate = asanaItem.dueon || asanaItem.due_on || asanaItem.dueAt || asanaItem.due_at || null;
        if (startDate) {
            dateSource = 'asana_due';
        }
    }
    
    // Log if we couldn't find a date for a deal
    if (!startDate && dealName) {
        console.warn(`No start date found for deal "${dealName}". Available Procore projects:`, Object.keys(procoreProjectMap));
    }
    
    // Check for Product Type custom field (prefer custom field over parsed/name-based)
    if (asanaItem['Product Type Custom']) {
        productType = asanaItem['Product Type Custom'];
    }
    
    // Get Procore coordinates if available
    let latitude = null;
    let longitude = null;
    if (dealName && procoreProjectMap[dealName]) {
        latitude = procoreProjectMap[dealName].latitude;
        longitude = procoreProjectMap[dealName].longitude;
    } else if (dealName) {
        // Try fuzzy match for coordinates too
        const dealNameLower = dealName.toLowerCase().trim();
        for (const [procoreName, procoreData] of Object.entries(procoreProjectMap)) {
            const procoreNameLower = procoreName.toLowerCase().trim();
            if (procoreNameLower.includes(dealNameLower) || dealNameLower.includes(procoreNameLower)) {
                latitude = procoreData.latitude;
                longitude = procoreData.longitude;
                break;
            }
        }
    }
    
    return {
        Name: name || 'Unnamed Deal',
        Stage: stage,
        'Unit Count': parsedNotes.units || null,
        'Start Date': startDate,
        'Start Date Source': dateSource, // Store source for tooltip
        Bank: bank,
        'Product Type': productType || null,
        Location: location,
        'Pre-Con': preCon,
        Notes: notes || null, // Include full notes
        commentsCount: asanaItem.numhearts || null,
        Latitude: latitude, // Store Procore latitude (capitalized for backward compatibility)
        Longitude: longitude, // Store Procore longitude (capitalized for backward compatibility)
        latitude: latitude, // Store Procore latitude (lowercase as user specified)
        longitude: longitude, // Store Procore longitude (lowercase as user specified)
        // Keep original data for reference
        _original: asanaItem
    };
}

// Apply filters to deals
// excludeStart: if true, exclude all START deals (default: true, except for timeline view)
function applyFilters(deals, excludeStart = true) {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    
    return deals.filter(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        const location = getDealLocation(deal) || '';
        const bank = deal.Bank || deal.bank || '';
        const product = getDealProductType(deal) || '';
        
        // Exclude START deals by default (they're placeholders, not real deals)
        // Only include them in timeline view
        if (excludeStart && stage === 'START') {
            return false;
        }
        
        // Stage filter (never allow START to be filtered or shown)
        if (currentFilters.stage === 'START' || stage === 'START') {
            return false; // Always exclude START deals, even if somehow selected
        }
        if (currentFilters.stage && stage !== currentFilters.stage) return false;
        
        // Location filter
        if (currentFilters.location && location !== currentFilters.location) return false;
        
        // State filter (extract state from location, e.g., "Baton Rouge, LA" -> "LA")
        if (currentFilters.state) {
            const stateMatch = location.match(/,\s*([A-Z]{2})$/);
            const dealState = stateMatch ? stateMatch[1] : '';
            if (dealState !== currentFilters.state) return false;
        }
        
        // Bank filter (use normalized names for comparison)
        if (currentFilters.bank) {
            const filterBankNormalized = normalizeBankName(currentFilters.bank);
            const dealBankNormalized = normalizeBankName(bank);
            if (filterBankNormalized !== dealBankNormalized) return false;
        }
        
        // Product filter
        if (currentFilters.product && product !== currentFilters.product) return false;
        
        // Year filter
        if (currentFilters.year) {
            const startDate = deal['Start Date'] || deal.startDate || deal.dueon || deal.due_on;
            if (startDate) {
                try {
                    const date = new Date(startDate);
                    if (!isNaN(date.getTime())) {
                        const dealYear = date.getFullYear().toString();
                        if (dealYear !== currentFilters.year) return false;
                    } else {
                        return false; // No valid date, exclude if year filter is set
                    }
                } catch (e) {
                    return false; // Date parsing failed, exclude if year filter is set
                }
            } else {
                return false; // No date, exclude if year filter is set
            }
        }
        
        // Search filter
        if (currentFilters.search) {
            const searchLower = currentFilters.search.toLowerCase();
            const name = (deal.Name || deal.name || '').toLowerCase();
            const dealLocation = location.toLowerCase();
            const dealBank = bank.toLowerCase();
            const dealProduct = product.toLowerCase();
            const notes = (deal.Notes || deal.notes || '').toLowerCase();
            
            if (!name.includes(searchLower) && 
                !dealLocation.includes(searchLower) && 
                !dealBank.includes(searchLower) && 
                !dealProduct.includes(searchLower) && 
                !notes.includes(searchLower)) {
                return false;
            }
        }
        
        // START deals are automatically excluded in all views except timeline
        // No additional filtering needed
        if (!excludeStart && stage === 'START') {
            const startDate = deal['Start Date'] || deal.startDate || deal.dueon || deal.due_on;
            if (startDate) {
                try {
                    const date = new Date(startDate);
                    if (!isNaN(date.getTime()) && date < sixMonthsAgo) {
                        return false; // Filter out old START items
                    }
                } catch (e) {
                    // If date parsing fails, keep the item
                }
            }
        }
        
        return true;
    });
}

// Helper function to sort a single deal comparison
function sortDeal(a, b, sortConfig) {
    let aVal, bVal;
    
    switch(sortConfig.by) {
        case 'name':
            aVal = (a.Name || a.name || '').toLowerCase();
            bVal = (b.Name || b.name || '').toLowerCase();
            break;
        case 'stage':
            aVal = normalizeStage(a.Stage || a.stage);
            bVal = normalizeStage(b.Stage || b.stage);
            break;
        case 'units':
            aVal = parseInt(a['Unit Count'] || a.unitCount || 0);
            bVal = parseInt(b['Unit Count'] || b.unitCount || 0);
            break;
        case 'date':
            // For date sorting, use Start Date (checking multiple sources like grouping does)
            const dateA = a['Start Date'] || a.startDate || 
                         a['Start Date Custom'] || 
                         a.dueon || a.due_on || 
                         a.dueAt || a.due_at ||
                         a._original?.dueon || a._original?.due_on ||
                         a._original?.dueAt || a._original?.due_at ||
                         null;
            const dateB = b['Start Date'] || b.startDate || 
                         b['Start Date Custom'] || 
                         b.dueon || b.due_on || 
                         b.dueAt || b.due_at ||
                         b._original?.dueon || b._original?.due_on ||
                         b._original?.dueAt || b._original?.due_at ||
                         null;
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1; // Put null dates at the end
            if (!dateB) return -1; // Put null dates at the end
            aVal = new Date(dateA);
            bVal = new Date(dateB);
            break;
        case 'location':
            aVal = (a.Location || a.location || '').toLowerCase();
            bVal = (b.Location || b.location || '').toLowerCase();
            break;
        default:
            return 0;
    }
    
    if (aVal < bVal) return sortConfig.order === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.order === 'asc' ? 1 : -1;
    return 0;
}

// Apply sorting to deals (for non-grouped views)
function applySorting(deals) {
    const sorted = [...deals];
    sorted.sort((a, b) => sortDeal(a, b, currentSort));
    return sorted;
}

// Render a single deal row
function renderDealRow(deal) {
    const stage = normalizeStage(deal.Stage || deal.stage);
    const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
    const dealName = deal.Name || deal.name || 'Unnamed Deal';
    
    return `
        <tr class="deal-row" data-deal-name="${dealName}" style="cursor: pointer;">
            <td class="deal-name" data-label="Name">
                ${deal.commentsCount ? `<span class="comments-count">${deal.commentsCount}</span>` : ''}
                ${deal.Name || deal.name || 'Unnamed Deal'}
            </td>
            <td class="deal-cell" data-label="Stage">
                <span class="stage-badge clickable ${stageConfig.class}" data-stage="${stage}">${stage}</span>
            </td>
            <td class="deal-cell unit-count" data-label="Unit Count">${deal['Unit Count'] || deal.unitCount || deal.units || '-'}</td>
            <td class="deal-cell date-display ${isOverdue(deal['Start Date'] || deal.startDate) ? 'overdue' : ''}" data-label="Start Date" title="${(() => {
                const source = deal['Start Date Source'] || 'unknown';
                const sourceText = source === 'procore' ? 'From Procore' : 
                                  source === 'asana_custom' ? 'From Asana Custom Field' : 
                                  source === 'asana_due' ? 'From Asana Due Date' : 
                                  'Unknown source';
                const startDate = deal['Start Date'] || deal.startDate || deal['Start Date Custom'] || deal.dueon || deal.due_on || deal._original?.dueon || deal._original?.due_on || 'No date';
                const dateStr = typeof startDate === 'string' ? startDate : (startDate ? new Date(startDate).toISOString() : 'No date');
                return `${sourceText}\nRaw date: ${dateStr}`;
            })()}">
                ${formatDate(deal['Start Date'] || deal.startDate) || '-'}
            </td>
            <td class="deal-cell secondary" data-label="Bank">${deal.Bank || deal.bank || '-'}</td>
            <td class="deal-cell secondary" data-label="Product Type">${deal['Product Type'] || deal.productType || '-'}</td>
            <td class="deal-cell" data-label="Location">
                ${(() => {
                    const location = getDealLocation(deal);
                    return location ? 
                        `<span class="location-badge clickable" data-location="${location}">${location}</span>` : 
                        '-';
                })()}
            </td>
            <td class="deal-cell notes-cell clickable" data-label="Notes" title="${(deal.Notes || deal.notes || '').replace(/"/g, '&quot;')}" style="cursor: pointer;">
                ${deal.Notes || deal.notes ? 
                    `<span class="notes-preview">${(deal.Notes || deal.notes).substring(0, 100)}${(deal.Notes || deal.notes).length > 100 ? '...' : ''}</span>` : 
                    '-'
                }
            </td>
        </tr>
    `;
}

// Render a stage group
function renderStageGroup(stage, deals) {
    const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
    const stageClass = stageConfig.class;
    
    const dealsHtml = deals.map(deal => renderDealRow(deal)).join('');
    
    return `
        <div class="stage-group">
            <div class="stage-group-header ${stageClass}">
                <span class="stage-group-toggle">▼</span>
                <span class="clickable" data-stage="${stage}">${stage}</span>
                <span class="stage-group-count">${deals.length}</span>
            </div>
            <div class="stage-group-content">
                <div class="stage-group-table-wrapper">
                    <table class="deal-list-table">
                        <thead>
                            <tr>
                                <th class="col-name">Name</th>
                                <th class="col-stage">Stage</th>
                                <th class="col-units">Unit Count</th>
                                <th class="col-date">Start Date</th>
                                <th class="col-bank">Bank</th>
                                <th class="col-product">Product Type</th>
                                <th class="col-location">Location</th>
                                <th class="col-notes">Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${dealsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// Group deals by stage
function groupDealsByStage(deals) {
    const grouped = {};
    
    deals.forEach(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        if (!grouped[stage]) {
            grouped[stage] = [];
        }
        grouped[stage].push(deal);
    });
    
    // Sort stages in a specific order
    const stageOrder = ['Prospective', 'Under Contract', 'Started', 'Stabilized', 'Closed', 'START'];
    const sorted = {};
    
    stageOrder.forEach(stage => {
        if (grouped[stage]) {
            sorted[stage] = grouped[stage];
        }
    });
    
    // Add any remaining stages
    Object.keys(grouped).forEach(stage => {
        if (!sorted[stage]) {
            sorted[stage] = grouped[stage];
        }
    });
    
    return sorted;
}

// Group deals by year/quarter with reserved slots for START items
function groupDealsByYear(deals) {
    const grouped = {};
    
    deals.forEach(deal => {
        // Try multiple sources for start date
        const startDate = deal['Start Date'] || deal.startDate || 
                         deal['Start Date Custom'] || 
                         deal.dueon || deal.due_on || 
                         deal.dueAt || deal.due_at ||
                         deal._original?.dueon || deal._original?.due_on ||
                         deal._original?.dueAt || deal._original?.due_at ||
                         null;
        let year = 'Unknown';
        let quarter = '';
        
        if (startDate) {
            try {
                const date = new Date(startDate);
                if (!isNaN(date.getTime())) {
                    year = date.getFullYear();
                    quarter = Math.floor(date.getMonth() / 3) + 1;
                } else {
                    // Try parsing as string if Date constructor failed
                    const dateStr = String(startDate);
                    const parsed = new Date(dateStr);
                    if (!isNaN(parsed.getTime())) {
                        year = parsed.getFullYear();
                        quarter = Math.floor(parsed.getMonth() / 3) + 1;
                    }
                }
            } catch (e) {
                // Keep as Unknown - log for debugging
                console.warn(`Could not parse date for deal "${deal.Name || deal.name}":`, startDate, e);
            }
        } else {
            // Log deals without dates for debugging
            console.warn(`Deal "${deal.Name || deal.name}" has no start date. Available fields:`, {
                'Start Date': deal['Start Date'],
                'startDate': deal.startDate,
                'Start Date Custom': deal['Start Date Custom'],
                'dueon': deal.dueon,
                'due_on': deal.due_on,
                '_original.dueon': deal._original?.dueon,
                '_original.due_on': deal._original?.due_on
            });
        }
        
        // Format period key as "Q1 2027" style (like timeline) instead of "2027 Q1"
        const periodKey = quarter ? `Q${quarter} ${year}` : `${year}`;
        if (!grouped[periodKey]) {
            grouped[periodKey] = { start: [], other: [] };
        }
        
        const stage = normalizeStage(deal.Stage || deal.stage);
        if (stage === 'START') {
            grouped[periodKey].start.push(deal);
        } else {
            grouped[periodKey].other.push(deal);
        }
    });
    
    // Sort periods based on current sort order (move entire blocks)
    // Handle both formats: "Q1 2027" (new) and "2027 Q1" (old/fallback)
    // Always put "Unknown" at the end
    const sortedPeriods = Object.keys(grouped).sort((a, b) => {
        // Always put "Unknown" at the end
        if (a === 'Unknown' && b !== 'Unknown') return 1;
        if (b === 'Unknown' && a !== 'Unknown') return -1;
        if (a === 'Unknown' && b === 'Unknown') return 0;
        
        // Check if format is "Q1 2027" (starts with Q) or "2027 Q1" (starts with year)
        const isNewFormatA = a.startsWith('Q');
        const isNewFormatB = b.startsWith('Q');
        
        let yearA, yearB, qA, qB;
        
        if (isNewFormatA) {
            // Format: "Q1 2027"
            const partsA = a.split(' ');
            qA = parseInt(partsA[0].replace('Q', '')) || 0;
            yearA = parseInt(partsA[1]) || 0;
        } else {
            // Format: "2027 Q1" or "2027"
            const partsA = a.split(' ');
            yearA = parseInt(partsA[0]) || 0;
            qA = parseInt(partsA[1]?.replace('Q', '')) || 0;
        }
        
        if (isNewFormatB) {
            // Format: "Q1 2027"
            const partsB = b.split(' ');
            qB = parseInt(partsB[0].replace('Q', '')) || 0;
            yearB = parseInt(partsB[1]) || 0;
        } else {
            // Format: "2027 Q1" or "2027"
            const partsB = b.split(' ');
            yearB = parseInt(partsB[0]) || 0;
            qB = parseInt(partsB[1]?.replace('Q', '')) || 0;
        }
        
        if (yearA !== yearB) {
            // Sort by year based on current sort order
            return currentSort.order === 'asc' ? yearA - yearB : yearB - yearA;
        }
        // Sort by quarter based on current sort order
        return currentSort.order === 'asc' ? qA - qB : qB - qA;
    });
    
    // Sort items within each period based on blockSort
    sortedPeriods.forEach(period => {
        // Sort START items
        grouped[period].start.sort((a, b) => {
            return sortDeal(a, b, blockSort);
        });
        // Sort other items by stage, then within stage by blockSort
        grouped[period].other.sort((a, b) => {
            return sortDeal(a, b, blockSort);
        });
    });
    
    return { grouped, sortedPeriods };
}

// Render the deal list - switches between timeline-style and stage-based views
function renderDealList(deals) {
    const container = document.getElementById('deal-list-container');
    
    if (!deals || deals.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <img src="Logos/STOA20-Logo-Mark-Grey.jpg" alt="STOA" class="stoa-logo" />
                <div class="empty-state-text">No deals found</div>
                <div class="empty-state-subtext">Try adjusting your filters</div>
            </div>
        `;
        return;
    }
    
    // Show toggle when on list view and update active state
    const toggle = document.getElementById('list-view-toggle');
    if (toggle && currentView === 'list') {
        toggle.style.display = 'flex';
        // Update active state
        toggle.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === listViewMode);
        });
    }
    
    if (listViewMode === 'timeline') {
        renderDealListByTimeline(deals);
    } else {
        renderDealListByStage(deals);
    }
    
    // Add click handlers for drill-down
    setupDrillDownHandlers();
}

// Render list by quarter/year (timeline-style)
function renderDealListByTimeline(deals) {
    const container = document.getElementById('deal-list-container');
    const filtered = applyFilters(deals, true); // Exclude START deals
    // Don't sort before grouping - we'll sort blocks and items within blocks separately
    const { grouped, sortedPeriods } = groupDealsByYear(filtered);
    
    // Build HTML with year/quarter groups, showing START slots if they exist (START deals are automatically included in timeline view)
    const html = `
        ${renderActiveFilters()}
        ${sortedPeriods.map(period => {
        const periodData = grouped[period];
        // Filter out any START items from other (in case they slipped through)
        const otherWithoutStart = periodData.other.filter(deal => {
            const stage = normalizeStage(deal.Stage || deal.stage);
            return stage !== 'START';
        });
        const stageGrouped = groupDealsByStage(otherWithoutStart);
        // Sort deals within each stage group by blockSort
        Object.keys(stageGrouped).forEach(stage => {
            stageGrouped[stage].sort((a, b) => sortDeal(a, b, blockSort));
        });
        // Exclude START from stage groups since we handle it separately
        const stageGroups = Object.keys(stageGrouped)
            .filter(stage => stage !== 'START')
            .map(stage => renderStageGroup(stage, stageGrouped[stage]))
            .join('');
        
        // Add START items only if there are any (they're automatically included in timeline view)
        let startGroup = '';
        if (periodData.start.length > 0) {
            startGroup = renderStageGroup('START', periodData.start);
        }
        
        // Collect all deals in this period for debugging
        const allPeriodDeals = [...periodData.start, ...periodData.other];
        
        return `
            <div class="year-group" data-period="${period}">
                <div class="year-group-header">
                    <span>${period}</span>
                    <div class="block-sort-controls">
                        <span class="block-sort-label">Sort:</span>
                        <button class="block-sort-btn ${blockSort.by === 'date' && blockSort.order === 'asc' ? 'active' : ''}" data-sort-by="date" data-sort-order="asc" title="Start Date ↑">
                            📅↑
                        </button>
                        <button class="block-sort-btn ${blockSort.by === 'date' && blockSort.order === 'desc' ? 'active' : ''}" data-sort-by="date" data-sort-order="desc" title="Start Date ↓">
                            📅↓
                        </button>
                        <button class="block-sort-btn ${blockSort.by === 'units' && blockSort.order === 'asc' ? 'active' : ''}" data-sort-by="units" data-sort-order="asc" title="Unit Count ↑">
                            🏠↑
                        </button>
                        <button class="block-sort-btn ${blockSort.by === 'units' && blockSort.order === 'desc' ? 'active' : ''}" data-sort-by="units" data-sort-order="desc" title="Unit Count ↓">
                            🏠↓
                        </button>
                        <button class="block-sort-btn ${blockSort.by === 'name' && blockSort.order === 'asc' ? 'active' : ''}" data-sort-by="name" data-sort-order="asc" title="Name ↑">
                            A-Z
                        </button>
                        <button class="block-sort-btn ${blockSort.by === 'name' && blockSort.order === 'desc' ? 'active' : ''}" data-sort-by="name" data-sort-order="desc" title="Name ↓">
                            Z-A
                        </button>
                    </div>
                </div>
                ${startGroup}
                ${stageGroups}
            </div>
        `;
    }).join('')}
    `;
    
    container.innerHTML = html;
}

// Render list by stage (Prospective, Under Contract, Started, Stabilized, Closed, START)
function renderDealListByStage(deals) {
    const container = document.getElementById('deal-list-container');
    const filtered = applyFilters(deals, true); // Exclude START deals
    
    // Group by stage first
    const stageGrouped = groupDealsByStage(filtered);
    
    // Sort deals within each stage group by currentSort
    Object.keys(stageGrouped).forEach(stage => {
        stageGrouped[stage].sort((a, b) => sortDeal(a, b, currentSort));
    });
    
    // Define stage order
    const stageOrder = ['Prospective', 'Under Contract', 'Started', 'Stabilized', 'Closed', 'START'];
    
    // Build HTML with stage groups
    const html = `
        ${renderActiveFilters()}
        ${stageOrder.map(stage => {
            if (!stageGrouped[stage] || stageGrouped[stage].length === 0) {
                // START deals are automatically excluded, so don't show empty START groups
                if (stage === 'START') {
                    return '';
                }
                return renderStageGroup(stage, []);
            }
            return renderStageGroup(stage, stageGrouped[stage]);
        }).join('')}
    `;
    
    container.innerHTML = html;
}

// Setup drill-down click handlers
function setupDrillDownHandlers() {
    // Stage badge clicks
    document.querySelectorAll('.stage-badge.clickable').forEach(badge => {
        badge.addEventListener('click', function(e) {
            e.stopPropagation();
            const stage = this.dataset.stage;
            currentFilters.stage = stage;
            updateFiltersUI();
            switchView('list', allDeals);
        });
    });
    
    // Location badge clicks - filter by city and focus map
    document.querySelectorAll('.location-badge.clickable').forEach(badge => {
        badge.addEventListener('click', function(e) {
            e.stopPropagation();
            const location = this.dataset.location;
            
            // Extract city from location string (e.g., "Baton Rouge, LA" -> "Baton Rouge")
            const cityMatch = location.match(/^([^,]+)/);
            const city = cityMatch ? cityMatch[1].trim() : location;
            
            // Set location filter
            currentFilters.location = location;
            updateFiltersUI();
            
            // Switch to location view
            switchView('location', allDeals);
            
            // After view switches, focus map on deals in that city
            setTimeout(() => {
                focusMapOnCity(city);
            }, 100);
        });
    });
    
    // Overview stat card clicks
    document.querySelectorAll('.stat-card[data-drill]').forEach(card => {
        card.addEventListener('click', function(e) {
            e.stopPropagation();
            const drill = this.dataset.drill;
            if (drill === 'list') {
                switchView('list', allDeals);
            } else if (drill === 'units') {
                switchView('units', allDeals);
            } else if (drill === 'location') {
                switchView('location', allDeals);
            } else if (drill === 'bank') {
                switchView('bank', allDeals);
            }
        });
    });
    
    // Stage breakdown item clicks (entire row)
    document.querySelectorAll('.breakdown-item[data-stage]').forEach(item => {
        item.addEventListener('click', function(e) {
            e.stopPropagation();
            const stage = this.dataset.stage;
            currentFilters.stage = stage;
            updateFiltersUI();
            switchView('list', allDeals);
        });
    });
    
    // Upcoming dates item clicks (drill to timeline)
    document.querySelectorAll('.date-item[data-drill-timeline]').forEach(item => {
        item.addEventListener('click', function(e) {
            e.stopPropagation();
            const dealName = this.dataset.drillTimeline;
            // Store the deal name to highlight in timeline
            window.highlightDealInTimeline = dealName;
            switchView('timeline', allDeals);
        });
    });
    
    // Deal card clicks (timeline cards, list rows, etc.) - show deal detail
    document.querySelectorAll('.timeline-card[data-deal-name]').forEach(card => {
        card.addEventListener('click', function(e) {
            // Don't trigger if clicking on a badge or other interactive element
            if (e.target.closest('.stage-badge.clickable, .location-badge.clickable, .precon-badge, .clickable')) {
                return;
            }
            const dealName = this.dataset.dealName;
            const deal = allDeals.find(d => (d.Name || d.name) === dealName);
            if (deal) {
                showDealDetail(deal);
            }
        });
    });
    
    // Deal row clicks (list view) - show deal detail
    document.querySelectorAll('.deal-row[data-deal-name]').forEach(row => {
        row.addEventListener('click', function(e) {
            // Don't trigger if clicking on a badge, notes cell, or other interactive element
            if (e.target.closest('.stage-badge.clickable, .location-badge.clickable, .precon-badge, .notes-cell.clickable, .clickable')) {
                return;
            }
            const dealName = this.dataset.dealName;
            const deal = allDeals.find(d => (d.Name || d.name) === dealName);
            if (deal) {
                showDealDetail(deal);
            }
        });
    });
    
    // Notes cell clicks (show modal)
    document.querySelectorAll('.notes-cell, .notes-preview').forEach(cell => {
        cell.addEventListener('click', function(e) {
            e.stopPropagation();
            const row = this.closest('.deal-row');
            if (row) {
                const dealName = row.querySelector('.deal-name')?.textContent?.trim() || 'Unknown Deal';
                const notes = this.title || this.textContent || '';
                if (notes && notes !== '-') {
                    showNotesModal(dealName, notes);
                }
            }
        });
    });
    
    // Block sort button clicks (sort within year/quarter groups)
    document.querySelectorAll('.block-sort-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const sortBy = this.dataset.sortBy;
            const sortOrder = this.dataset.sortOrder;
            blockSort = { by: sortBy, order: sortOrder };
            switchView('list', allDeals);
        });
    });
    
    // Quick filter dropdown change handlers
    document.body.addEventListener('change', function(e) {
        if (e.target.classList.contains('quick-filter-dropdown')) {
            const filterType = e.target.id.replace('-filter-dropdown', '');
            const filterValue = e.target.value || '';
            
            if (filterType === 'state') {
                currentFilters.state = filterValue;
            } else if (filterType === 'stage') {
                // Never allow START to be set as a filter
                if (filterValue === 'START') {
                    currentFilters.stage = '';
                } else {
                    currentFilters.stage = filterValue;
                }
            } else if (filterType === 'product') {
                currentFilters.product = filterValue;
            } else if (filterType === 'year') {
                currentFilters.year = filterValue;
            }
            
            // Update filter UI and refresh view
            updateFiltersUI();
            switchView(currentView, allDeals);
        }
    });
    
    // Timeline year filter button clicks
    document.body.addEventListener('click', function(e) {
        if (e.target.classList.contains('quick-filter-btn') && e.target.closest('.timeline-year-filter')) {
            e.preventDefault();
            e.stopPropagation();
            const filterValue = e.target.dataset.filterValue || '';
            currentFilters.year = filterValue;
            
            // Update active state of all year filter buttons
            const timelineYearFilter = e.target.closest('.timeline-year-filter');
            if (timelineYearFilter) {
                timelineYearFilter.querySelectorAll('.quick-filter-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.filterValue === filterValue);
                });
            }
            
            // Refresh timeline view
            switchView('timeline', allDeals);
        }
    });
    
    // List view toggle handlers (using event delegation since toggle is dynamically shown/hidden)
    document.body.addEventListener('click', function(e) {
        if (e.target.classList.contains('toggle-btn') && e.target.closest('#list-view-toggle')) {
            const mode = e.target.dataset.mode;
            if (mode && (mode === 'timeline' || mode === 'stage')) {
                listViewMode = mode;
                // Update active state
                const toggle = document.getElementById('list-view-toggle');
                if (toggle) {
                    toggle.querySelectorAll('.toggle-btn').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.mode === listViewMode);
                    });
                }
                // Re-render list view
                if (currentView === 'list') {
                    switchView('list', allDeals);
                }
            }
        }
    });
}

// Calculate summary statistics
function calculateSummary(deals, excludeStart = true) {
    // Filter out START deals by default (they're placeholders)
    // Use multiple checks to be absolutely sure START is excluded
    const filteredDeals = excludeStart ? deals.filter(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        return stage !== 'START' && stage.toLowerCase() !== 'start' && !stage.includes('START');
    }) : deals;
    
    const summary = {
        total: filteredDeals.length,
        byStage: {},
        totalUnits: 0,
        byProductType: {},
        byLocation: {},
        byBank: {},
        byState: {}, // Add state breakdown
        byYear: {}, // Add year breakdown
        upcomingDates: [],
        pastDates: []
    };
    
    filteredDeals.forEach(deal => {
        // By stage (never include START)
        const stage = normalizeStage(deal.Stage || deal.stage);
        
        // Skip all processing for START deals
        if (stage === 'START' || stage.toLowerCase() === 'start' || stage.includes('START')) {
            return; // Skip this deal entirely
        }
        
        summary.byStage[stage] = (summary.byStage[stage] || 0) + 1;
        
        // Get units once for use throughout
        const units = parseInt(deal['Unit Count'] || deal.unitCount || 0);
        
        // Total units
        if (units) {
            summary.totalUnits += units;
            if (!summary.byStage[stage + '_units']) {
                summary.byStage[stage + '_units'] = 0;
            }
            summary.byStage[stage + '_units'] += units;
        }
        
        // By product type
        const productType = deal['Product Type'] || deal.productType || 'Other';
        summary.byProductType[productType] = (summary.byProductType[productType] || 0) + 1;
        
        // By location
        const location = getDealLocation(deal) || 'Unknown';
        if (!summary.byLocation[location]) {
            summary.byLocation[location] = { count: 0, units: 0 };
        }
        summary.byLocation[location].count++;
        if (units) summary.byLocation[location].units += units;
        
        // By bank (use normalized name for grouping)
        const bank = deal.Bank || deal.bank || 'Unknown';
        const normalizedBank = normalizeBankName(bank);
        const canonicalBank = getCanonicalBankName(bank);
        // Use canonical name for display, but group by normalized name
        if (!summary.byBank[canonicalBank]) {
            summary.byBank[canonicalBank] = 0;
        }
        summary.byBank[canonicalBank] = (summary.byBank[canonicalBank] || 0) + 1;
        
        // By state (extract from location)
        const stateMatch = location.match(/,\s*([A-Z]{2})$/);
        const state = stateMatch ? stateMatch[1] : 'Unknown';
        if (!summary.byState[state]) {
            summary.byState[state] = { count: 0, units: 0 };
        }
        summary.byState[state].count++;
        if (units) summary.byState[state].units += units;
        
        // By year
        const dealStartDate = deal['Start Date'] || deal.startDate;
        if (dealStartDate) {
            const date = new Date(dealStartDate);
            if (!isNaN(date.getTime())) {
                const year = date.getFullYear().toString();
                if (!summary.byYear[year]) {
                    summary.byYear[year] = 0;
                }
                summary.byYear[year]++;
            }
        }
        
        // Dates (exclude START deals from dates)
        if (stage !== 'START') {
            const startDate = deal['Start Date'] || deal.startDate;
            if (startDate) {
                const date = new Date(startDate);
                if (!isNaN(date.getTime())) {
                    const dateItem = {
                        name: deal.Name || deal.name,
                        date: date,
                        stage: stage,
                        location: getDealLocation(deal),
                        units: deal['Unit Count'] || deal.unitCount,
                        bank: deal.Bank || deal.bank
                    };
                    
                    if (date >= new Date()) {
                        summary.upcomingDates.push(dateItem);
                    } else {
                        summary.pastDates.push(dateItem);
                    }
                }
            }
        }
    });
    
    // Sort dates
    summary.upcomingDates.sort((a, b) => a.date - b.date);
    summary.pastDates.sort((a, b) => b.date - a.date);
    
    // Absolutely ensure START is removed from byStage (in case it somehow got through)
    if (summary.byStage['START']) {
        delete summary.byStage['START'];
    }
    if (summary.byStage['START_units']) {
        delete summary.byStage['START_units'];
    }
    // Also remove any variations - check all keys
    Object.keys(summary.byStage).forEach(key => {
        if (key === 'START' || (key.toLowerCase() === 'start' && !key.includes('_units'))) {
            delete summary.byStage[key];
        }
    });
    
    return summary;
}

// Render Overview
function renderOverview(deals) {
    // Get filter options from ALL deals (so dropdowns show all available options)
    // First filter out START deals before calculating summary
    const dealsWithoutStart = deals.filter(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        return stage !== 'START';
    });
    const allDealsSummary = calculateSummary(dealsWithoutStart, true);
    const states = Object.keys(allDealsSummary.byState).filter(s => s !== 'Unknown').sort();
    const years = Object.keys(allDealsSummary.byYear).sort((a, b) => parseInt(b) - parseInt(a)); // Most recent first
    // Completely exclude START from stages - filter it out multiple times to be absolutely sure
    const stages = Object.keys(allDealsSummary.byStage)
        .filter(k => !k.includes('_units'))
        .filter(k => k !== 'START')
        .filter(k => k.toLowerCase() !== 'start')
        .filter(k => !k.includes('START'))
        .sort();
    const productTypes = Object.keys(allDealsSummary.byProductType).sort();
    
    // Apply filters to get filtered deals for display (excludes START by default)
    const filteredDeals = applyFilters(deals, true);
    // Calculate summary from filtered deals for the stats
    const summary = calculateSummary(filteredDeals, true);
    
    // Absolutely ensure START is removed from byStage (in case it somehow got through)
    if (summary.byStage['START']) {
        delete summary.byStage['START'];
    }
    if (summary.byStage['START_units']) {
        delete summary.byStage['START_units'];
    }
    // Also remove any variations
    Object.keys(summary.byStage).forEach(key => {
        if (key === 'START' || key.toLowerCase() === 'start' || key.includes('START')) {
            delete summary.byStage[key];
        }
    });
    
    return `
        <div class="overview-container">
            <div class="overview-header">
                <img src="Logos/STOA20-Logo-Mark-Green.jpg" alt="STOA" class="stoa-logo-overview" />
                <div class="beta-badge">BETA</div>
            </div>
            
            <!-- Quick Filters -->
            <div class="quick-filters">
                <div class="quick-filter-group">
                    <label for="state-filter-dropdown">Filter by State:</label>
                    <select id="state-filter-dropdown" class="quick-filter-dropdown">
                        <option value="">All States</option>
                        ${states.map(state => `
                            <option value="${state}" ${currentFilters.state === state ? 'selected' : ''}>${state}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="quick-filter-group">
                    <label for="stage-filter-dropdown">Filter by Stage:</label>
                    <select id="stage-filter-dropdown" class="quick-filter-dropdown">
                        <option value="">All Stages</option>
                        ${stages
                            .filter(stage => stage !== 'START' && stage.toLowerCase() !== 'start' && !stage.includes('START'))
                            .map(stage => `<option value="${stage}" ${currentFilters.stage === stage ? 'selected' : ''}>${stage}</option>`)
                            .join('')}
                    </select>
                </div>
                <div class="quick-filter-group">
                    <label for="product-filter-dropdown">Filter by Product Type:</label>
                    <select id="product-filter-dropdown" class="quick-filter-dropdown">
                        <option value="">All Types</option>
                        ${productTypes.map(product => `
                            <option value="${product}" ${currentFilters.product === product ? 'selected' : ''}>${product}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="quick-filter-group">
                    <label for="year-filter-dropdown">Filter by Year:</label>
                    <select id="year-filter-dropdown" class="quick-filter-dropdown">
                        <option value="">All Years</option>
                        ${years.map(year => `
                            <option value="${year}" ${currentFilters.year === year ? 'selected' : ''}>${year}</option>
                        `).join('')}
                    </select>
                </div>
            </div>
            
            <div class="overview-filter-actions">
                <button class="clear-filters-btn-overview" onclick="clearFilters()">Clear All Filters</button>
            </div>
            
            ${renderActiveFilters()}
            
            <div class="overview-stats">
                <div class="stat-card clickable" data-drill="list">
                    <div class="stat-value">${summary.total}</div>
                    <div class="stat-label">Total Deals</div>
                </div>
                <div class="stat-card clickable" data-drill="units">
                    <div class="stat-value">${summary.totalUnits.toLocaleString()}</div>
                    <div class="stat-label">Total Units</div>
                </div>
                <div class="stat-card clickable" data-drill="location">
                    <div class="stat-value">${Object.keys(summary.byLocation).filter(l => l !== 'Unknown').length}</div>
                    <div class="stat-label">Locations</div>
                </div>
                <div class="stat-card clickable" data-drill="bank">
                    <div class="stat-value">${Object.keys(summary.byBank).filter(b => b !== 'Unknown').length}</div>
                    <div class="stat-label">Banks</div>
                </div>
            </div>
            
            <div class="overview-sections">
                <div class="overview-section">
                    <h3>Deals by Stage (Click to Filter)</h3>
                    <div class="stage-breakdown">
                        ${Object.keys(summary.byStage)
                            .filter(k => !k.includes('_units'))
                            .filter(k => k !== 'START')
                            .filter(k => k.toLowerCase() !== 'start')
                            .filter(k => !k.includes('START'))
                            .map(stage => {
                                // Triple-check: never display START
                                if (stage === 'START' || stage.toLowerCase() === 'start' || stage.includes('START')) {
                                    return '';
                                }
                                const count = summary.byStage[stage];
                                const units = summary.byStage[stage + '_units'] || 0;
                                const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
                                return `
                                    <div class="breakdown-item clickable" data-stage="${stage}" style="cursor: pointer; width: 100%;">
                                        <span class="stage-badge ${stageConfig.class}">${stage}</span>
                                        <span class="breakdown-count">${count} deals</span>
                                        ${units > 0 ? `<span class="breakdown-units">${units.toLocaleString()} units</span>` : ''}
                                    </div>
                                `;
                            })
                            .filter(html => html !== '')
                            .join('')}
                    </div>
                </div>
                
                <div class="overview-section">
                    <h3>Upcoming Dates (Next 10)</h3>
                    <div class="upcoming-dates">
                        ${summary.upcomingDates.slice(0, 10).map(item => `
                            <div class="date-item clickable" data-drill-timeline="${item.name}" style="cursor: pointer;">
                                <span class="date-value">${formatDate(item.date)}</span>
                                <span class="date-name">${item.name}</span>
                                <span class="stage-badge clickable ${STAGE_CONFIG[item.stage]?.class || ''}" data-stage="${item.stage}">${item.stage}</span>
                            </div>
                        `).join('')}
                        ${summary.upcomingDates.length === 0 ? '<div class="no-data">No upcoming dates</div>' : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Geocode location (simple city, state parser)
function geocodeLocation(location) {
    if (!location || location === 'Unknown') return null;
    
    // Simple mapping for common cities (in production, use a geocoding service)
    const cityStateMap = {
        'Panama City, FL': [30.1588, -85.6602],
        'Fayetteville, NC': [35.0527, -78.8784],
        'Greenville, NC': [35.6127, -77.3663],
        'New Bern, NC': [35.1085, -77.0441],
        'Irmo, SC': [34.0854, -81.1832],
        'Hardeeville, SC': [32.2871, -81.0790],
        'Bartlett, TN': [35.2045, -89.8735],
        'Conway, LA': [30.4049, -91.0487],
        'Covington, LA': [30.4755, -90.1001],
        'Birmingham, AL': [33.5207, -86.8025],
        'Foley, AL': [30.4066, -87.6836],
        'Fort Walton Beach, FL': [30.4058, -86.6188],
        'Charlotte, NC': [35.2271, -80.8431],
        'Freeport, FL': [30.4983, -86.1361],
        'Flowood, MS': [32.3096, -90.1381],
        'Harvey, LA': [29.9035, -90.0773],
        'Pensacola, FL': [30.4213, -87.2169],
        'Baton Rouge, LA': [30.4515, -91.1871],
        'Columbia, SC': [34.0007, -81.0348],
        'Mobile, AL': [30.6954, -88.0399]
    };
    
    // Try exact match first
    if (cityStateMap[location]) {
        return cityStateMap[location];
    }
    
    // Try to extract city and state
    const match = location.match(/([^,]+),\s*([A-Z]{2})/);
    if (match) {
        const city = match[1].trim();
        const state = match[2];
        
        // Try partial match
        for (const [key, coords] of Object.entries(cityStateMap)) {
            if (key.includes(city) || key.includes(state)) {
                return coords;
            }
        }
    }
    
    return null;
}

// Render table for visible deals on map
function renderMapTable(deals) {
    if (!deals || deals.length === 0) {
        return `
            <div class="empty-state">
                <img src="Logos/STOA20-Logo-Mark-Grey.jpg" alt="STOA" class="stoa-logo" />
                <div class="empty-state-text">No deals visible on map</div>
                <div class="empty-state-subtext">Zoom or pan to see deals in the current view</div>
            </div>
        `;
    }
    
    const grouped = {};
    
    deals.forEach(deal => {
        const location = getDealLocation(deal) || 'Unknown';
        if (!grouped[location]) {
            grouped[location] = [];
        }
        grouped[location].push(deal);
    });
    
    const locations = Object.keys(grouped).filter(l => l !== 'Unknown').sort();
    
    return locations.map(location => {
        const locationDeals = grouped[location];
        const totalUnits = locationDeals.reduce((sum, d) => sum + parseInt(d['Unit Count'] || d.unitCount || 0), 0);
        
        return `
            <div class="stage-group">
                <div class="stage-group-header">
                    <span class="clickable" data-location="${location}">📍 ${location}</span>
                    <span style="margin-left: auto; opacity: 0.7;">
                        ${locationDeals.length} deals • ${totalUnits.toLocaleString()} units
                    </span>
                </div>
                <div class="stage-group-content">
                    <div class="stage-group-table-wrapper">
                        <table class="deal-list-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Stage</th>
                                    <th>Unit Count</th>
                                    <th>Start Date</th>
                                    <th>Bank</th>
                                    <th>Product Type</th>
                                    <th>Location</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${locationDeals.map(deal => renderDealRow(deal)).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Update table based on visible map markers
function updateMapTable() {
    if (!mapInstance || mapMarkers.length === 0) {
        // If no markers, show empty table
        const tableContainer = document.getElementById('map-table-container');
        if (tableContainer) {
            tableContainer.innerHTML = '<div class="empty-state">No deals match the current filters</div>';
        }
        return;
    }
    
    const bounds = mapInstance.getBounds();
    const visibleDeals = [];
    
    mapMarkers.forEach(markerData => {
        const latlng = markerData.marker.getLatLng();
        if (bounds.contains(latlng)) {
            // Handle both city markers (with deals array) and property markers (with deal object)
            if (markerData.deals && Array.isArray(markerData.deals)) {
                // City marker - has deals array
                visibleDeals.push(...markerData.deals);
            } else if (markerData.deal) {
                // Property marker - has single deal object
                visibleDeals.push(markerData.deal);
            }
        }
    });
    
    visibleDealsForMap = visibleDeals;
    
    // Update the table container
    const tableContainer = document.getElementById('map-table-container');
    if (tableContainer) {
        tableContainer.innerHTML = renderMapTable(visibleDeals);
        setupDrillDownHandlers();
    }
}

// Render by Location with Map
function renderByLocation(deals) {
    // Exclude START deals and filter by location
    const filtered = applyFilters(deals, true); // Exclude START deals
    const allDealsForMap = filtered.filter(deal => {
        const location = getDealLocation(deal);
        return location && location !== 'Unknown';
    });
    
    // Create map
    const mapHtml = `
        ${renderActiveFilters()}
        <div id="map-controls-container" style="margin-bottom: 12px; display: none;">
            <button id="exit-city-view-btn" class="exit-city-view-btn" style="display: none;">
                Exit City View
            </button>
        </div>
        <div id="location-map" style="height: 500px; width: 100%; margin-bottom: 24px; border-radius: 8px; overflow: hidden;"></div>
        <div id="map-table-container"></div>
    `;
    
    return mapHtml;
}

// Initialize map
function initMap(deals) {
    if (mapInstance) {
        mapInstance.remove();
    }
    
    const mapDiv = document.getElementById('location-map');
    if (!mapDiv) return;
    
    // Clear previous markers
    mapMarkers = [];
    allMapMarkers = []; // Reset all markers storage
    isCityView = false; // Reset city view state
    currentCityView = null;
    
    // Deals passed to initMap should already be filtered, but ensure they have locations
    const allDealsForMap = deals.filter(deal => {
        const location = getDealLocation(deal);
        return location && location !== 'Unknown';
    });
    
    // Initialize map with default view (will fit to markers after they're added)
    mapInstance = L.map('location-map').setView([35.0, -90.0], 5);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance);
    
    const locationGroups = {};
    allDealsForMap.forEach(deal => {
        const location = getDealLocation(deal);
        if (location && location !== 'Unknown') {
            if (!locationGroups[location]) {
                locationGroups[location] = [];
            }
            locationGroups[location].push(deal);
        }
    });
    
    // Create markers and store deal data
    Object.keys(locationGroups).forEach(location => {
        const locationDeals = locationGroups[location];
        
        // Try to get coordinates from Procore data first
        let coords = null;
        const dealsWithCoords = locationDeals.filter(deal => deal.Latitude && deal.Longitude);
        
        if (dealsWithCoords.length > 0) {
            // Use the first deal's coordinates (or average if multiple)
            const lat = parseFloat(dealsWithCoords[0].Latitude);
            const lng = parseFloat(dealsWithCoords[0].Longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
                coords = [lat, lng];
            }
        }
        
        // Fall back to geocoding if no Procore coordinates
        if (!coords) {
            coords = geocodeLocation(location);
        }
        
        if (coords) {
            const count = locationDeals.length;
            const totalUnits = locationDeals.reduce((sum, d) => sum + parseInt(d['Unit Count'] || d.unitCount || 0), 0);
            
            const marker = L.marker(coords).addTo(mapInstance);
            
            // Extract city name from location (e.g., "Baton Rouge, LA" -> "Baton Rouge")
            const cityMatch = location.match(/^([^,]+)/);
            const cityName = cityMatch ? cityMatch[1].trim() : location;
            
            // Check if any deals in this location have valid coordinates
            const dealsWithCoords = locationDeals.filter(deal => {
                let lat = null;
                let lng = null;
                
                if (deal.latitude !== null && deal.latitude !== undefined && deal.longitude !== null && deal.longitude !== undefined) {
                    lat = parseFloat(deal.latitude);
                    lng = parseFloat(deal.longitude);
                } else if (deal.Latitude !== null && deal.Latitude !== undefined && deal.Longitude !== null && deal.Longitude !== undefined) {
                    lat = parseFloat(deal.Latitude);
                    lng = parseFloat(deal.Longitude);
                }
                
                return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && 
                       lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
            });
            
            // Only show "View Deals" button if there are deals with valid coordinates
            const hasValidCoords = dealsWithCoords.length > 0;
            
            // Create popup with button (only if coordinates available)
            const popupContent = `
                <div style="text-align: center; padding: 4px;">
                    <strong>${location}</strong><br>
                    ${count} deal${count !== 1 ? 's' : ''}<br>
                    ${totalUnits.toLocaleString()} units<br>
                    ${hasValidCoords ? `
                        <button class="map-popup-btn" data-city="${cityName}" data-location="${location}" style="margin-top: 8px; padding: 6px 12px; background: var(--primary-green); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;">
                            View Deals
                        </button>
                    ` : `
                        <div style="margin-top: 8px; padding: 6px 12px; color: #666; font-size: 11px; font-style: italic;">
                            No location data available
                        </div>
                    `}
                </div>
            `;
            
            marker.bindPopup(popupContent);
            
            // Store marker with deal data
            const markerData = {
                marker: marker,
                location: location,
                city: cityName,
                deals: locationDeals,
                coords: coords
            };
            mapMarkers.push(markerData);
            allMapMarkers.push(markerData); // Also store in all markers array
        }
    });
    
    // Fit map to show all filtered markers
    if (mapMarkers.length > 0) {
        const group = new L.featureGroup(mapMarkers.map(m => m.marker));
        mapInstance.fitBounds(group.getBounds().pad(0.1));
    } else {
        // If no markers (all filtered out), reset to default view
        mapInstance.setView([35.0, -90.0], 5);
    }
    
    // Add event listeners for map movement
    mapInstance.on('moveend', updateMapTable);
    mapInstance.on('zoomend', updateMapTable);
    
    // Add event listener for popup button clicks
    mapInstance.on('popupopen', function(e) {
        const popup = e.popup;
        const popupElement = popup.getElement();
        if (popupElement) {
            const viewDealsBtn = popupElement.querySelector('.map-popup-btn');
            if (viewDealsBtn) {
                // Remove any existing listeners to prevent duplicates
                const newBtn = viewDealsBtn.cloneNode(true);
                viewDealsBtn.parentNode.replaceChild(newBtn, viewDealsBtn);
                
                newBtn.addEventListener('click', function() {
                    const cityName = this.dataset.city;
                    const location = this.dataset.location;
                    focusMapOnCityFromMarker(cityName, location);
                });
            }
        }
    });
    
    // Add event listener for exit city view button
    setTimeout(() => {
        const exitBtn = document.getElementById('exit-city-view-btn');
        if (exitBtn) {
            exitBtn.addEventListener('click', exitCityView);
        }
    }, 200);
    
    // Initial table update - show all filtered deals
    setTimeout(() => {
        // Get all deals from markers (these are already filtered)
        const allFilteredDeals = mapMarkers.reduce((acc, markerData) => {
            acc.push(...markerData.deals);
            return acc;
        }, []);
        
        // Initially show all filtered deals in the table (not just viewport-visible)
        visibleDealsForMap = allFilteredDeals;
        
        // Update table with all filtered deals initially
        const tableContainer = document.getElementById('map-table-container');
        if (tableContainer) {
            tableContainer.innerHTML = renderMapTable(allFilteredDeals);
            setupDrillDownHandlers();
        }
    }, 100);
}

// Focus map on city from marker popup (uses marker data directly)
function focusMapOnCityFromMarker(cityName, location) {
    if (!mapInstance) return;
    
    // Find the marker data for this location
    const markerData = allMapMarkers.find(m => m.location === location || m.city === cityName);
    
    if (!markerData) {
        console.warn(`No marker found for city: ${cityName}`);
        return;
    }
    
    const cityDeals = markerData.deals;
    
    if (cityDeals.length === 0) {
        console.warn(`No deals found for city: ${cityName}`);
        return;
    }
    
    // First, check if any deals have valid coordinates
    const dealsWithValidCoords = cityDeals.filter(deal => {
        let lat = null;
        let lng = null;
        
        if (deal.latitude !== null && deal.latitude !== undefined && deal.longitude !== null && deal.longitude !== undefined) {
            lat = parseFloat(deal.latitude);
            lng = parseFloat(deal.longitude);
        } else if (deal.Latitude !== null && deal.Latitude !== undefined && deal.Longitude !== null && deal.Longitude !== undefined) {
            lat = parseFloat(deal.Latitude);
            lng = parseFloat(deal.Longitude);
        }
        
        return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && 
               lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    });
    
    // If no deals have valid coordinates, don't allow city view
    if (dealsWithValidCoords.length === 0) {
        console.warn(`No deals with valid coordinates found for city: ${cityName}`);
        alert(`No location data available for properties in ${cityName}. City view is not available.`);
        return;
    }
    
    // Hide all other city markers
    allMapMarkers.forEach(m => {
        if (m.location !== location && m.city !== cityName) {
            mapInstance.removeLayer(m.marker);
        }
    });
    
    // Remove the city marker itself (we'll show individual property markers instead)
    mapInstance.removeLayer(markerData.marker);
    
    // Create individual markers for each property/deal in this city (only those with valid coordinates)
    const propertyMarkers = [];
    const coordinates = [];
    
    // Only process deals with valid coordinates
    dealsWithValidCoords.forEach(deal => {
        // Try to get coordinates from deal object using lowercase latitude/longitude (as user specified)
        let lat = null;
        let lng = null;
        
        // Check lowercase first (as user specified)
        if (deal.latitude !== null && deal.latitude !== undefined && deal.longitude !== null && deal.longitude !== undefined) {
            lat = parseFloat(deal.latitude);
            lng = parseFloat(deal.longitude);
        } 
        // Fall back to capitalized (for backward compatibility)
        else if (deal.Latitude !== null && deal.Latitude !== undefined && deal.Longitude !== null && deal.Longitude !== undefined) {
            lat = parseFloat(deal.Latitude);
            lng = parseFloat(deal.Longitude);
        }
        
        // Validate coordinates are valid numbers and within valid ranges
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && 
            lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            coordinates.push([lat, lng]);
            
            try {
                // Create a marker for this property
                const propertyMarker = L.marker([lat, lng]).addTo(mapInstance);
                
                // Get deal name
                const dealName = deal.Name || deal.name || 'Unknown Property';
                const unitCount = deal['Unit Count'] || deal.unitCount || 0;
                const stage = deal.Stage || deal.stage || 'Unknown';
                
                // Create popup for this property with clickable button
                const popupContent = `
                    <div style="text-align: center; padding: 4px;">
                        <strong>${dealName}</strong><br>
                        ${stage}<br>
                        ${unitCount} units<br>
                        <button class="map-property-popup-btn" data-deal-name="${dealName}" style="margin-top: 8px; padding: 6px 12px; background: var(--primary-green); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;">
                            View Details
                        </button>
                    </div>
                `;
                propertyMarker.bindPopup(popupContent);
                
                // Add click handler for the popup button
                propertyMarker.on('popupopen', function() {
                    const popupElement = propertyMarker.getPopup().getElement();
                    if (popupElement) {
                        const viewDetailsBtn = popupElement.querySelector('.map-property-popup-btn');
                        if (viewDetailsBtn) {
                            // Remove any existing listeners to prevent duplicates
                            const newBtn = viewDetailsBtn.cloneNode(true);
                            viewDetailsBtn.parentNode.replaceChild(newBtn, viewDetailsBtn);
                            
                            newBtn.addEventListener('click', function() {
                                const dealName = this.dataset.dealName;
                                // Find the deal object from deals with valid coordinates
                                const deal = dealsWithValidCoords.find(d => (d.Name || d.name) === dealName);
                                if (deal) {
                                    showDealDetail(deal);
                                    mapInstance.closePopup();
                                }
                            });
                        }
                    }
                });
                
                propertyMarkers.push({
                    marker: propertyMarker,
                    deal: deal,
                    coords: [lat, lng]
                });
            } catch (error) {
                console.warn(`Failed to create marker for deal "${deal.Name || deal.name}" with coordinates [${lat}, ${lng}]:`, error);
            }
        }
    });
    
    // If no coordinates found, fall back to city marker coordinates
    if (coordinates.length === 0) {
        console.warn(`No coordinates found for individual properties in city: ${cityName}, using city center`);
        if (markerData.coords) {
            coordinates.push(markerData.coords);
        } else {
            const coords = geocodeLocation(location);
            if (coords) {
                coordinates.push(coords);
            }
        }
    }
    
    if (coordinates.length === 0) {
        console.warn(`No coordinates found for deals in city: ${cityName}`);
        return;
    }
    
    // Store property markers (replacing city marker)
    mapMarkers = propertyMarkers;
    
    // Create bounds from all property coordinates
    const bounds = L.latLngBounds(coordinates);
    
    // Fit map to show all properties in that city with padding
    mapInstance.fitBounds(bounds, { padding: [50, 50] });
    
    // Update the table to show only deals with valid coordinates in that city
    visibleDealsForMap = dealsWithValidCoords;
    updateMapTable();
    
    // Set city view state
    isCityView = true;
    currentCityView = {
        cityName: cityName,
        location: location,
        markerData: markerData
    };
    
    // Show exit city view button
    const controlsContainer = document.getElementById('map-controls-container');
    const exitBtn = document.getElementById('exit-city-view-btn');
    if (controlsContainer && exitBtn) {
        controlsContainer.style.display = 'block';
        exitBtn.style.display = 'block';
    }
    
    // Close the popup
    mapInstance.closePopup();
}

// Exit city view and restore full map
function exitCityView() {
    if (!mapInstance || !isCityView) return;
    
    // Remove all property markers (if we're in city view, these are individual property markers)
    mapMarkers.forEach(m => {
        if (m.marker && m.deal) {
            // This is a property marker, remove it
            mapInstance.removeLayer(m.marker);
        }
    });
    
    // Restore all city markers
    allMapMarkers.forEach(m => {
        mapInstance.addLayer(m.marker);
    });
    
    // Restore mapMarkers to all city markers
    mapMarkers = [...allMapMarkers];
    
    // Fit map to show all markers
    if (mapMarkers.length > 0) {
        const group = new L.featureGroup(mapMarkers.map(m => m.marker));
        mapInstance.fitBounds(group.getBounds().pad(0.1));
    }
    
    // Update table to show all filtered deals
    const allFilteredDeals = mapMarkers.reduce((acc, markerData) => {
        acc.push(...markerData.deals);
        return acc;
    }, []);
    visibleDealsForMap = allFilteredDeals;
    updateMapTable();
    
    // Reset city view state
    isCityView = false;
    currentCityView = null;
    
    // Hide exit city view button
    const controlsContainer = document.getElementById('map-controls-container');
    const exitBtn = document.getElementById('exit-city-view-btn');
    if (controlsContainer && exitBtn) {
        exitBtn.style.display = 'none';
        if (mapMarkers.length === 0) {
            controlsContainer.style.display = 'none';
        }
    }
}

// Focus map on deals in a specific city
function focusMapOnCity(cityName) {
    if (!mapInstance) return;
    
    // Find all deals in that city
    const cityDeals = allDeals.filter(deal => {
        const location = getDealLocation(deal);
        if (!location) return false;
        
        // Extract city from location string
        const cityMatch = location.match(/^([^,]+)/);
        const city = cityMatch ? cityMatch[1].trim().toLowerCase() : location.toLowerCase();
        
        return city === cityName.toLowerCase();
    });
    
    if (cityDeals.length === 0) {
        console.warn(`No deals found for city: ${cityName}`);
        return;
    }
    
    // Collect coordinates from Procore data
    const coordinates = [];
    cityDeals.forEach(deal => {
        // First try to get coordinates from deal object (stored from Procore)
        if (deal.Latitude && deal.Longitude) {
            const lat = parseFloat(deal.Latitude);
            const lng = parseFloat(deal.Longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
                coordinates.push([lat, lng]);
            }
        } else {
            // Fall back to geocoding the location
            const location = getDealLocation(deal);
            if (location) {
                const coords = geocodeLocation(location);
                if (coords) {
                    coordinates.push(coords);
                }
            }
        }
    });
    
    if (coordinates.length === 0) {
        console.warn(`No coordinates found for deals in city: ${cityName}`);
        // Try to geocode the city name directly
        const cityLocation = `${cityName}, US`;
        const coords = geocodeLocation(cityLocation);
        if (coords) {
            mapInstance.setView(coords, 12);
        }
        return;
    }
    
    // Create bounds from all coordinates
    const bounds = L.latLngBounds(coordinates);
    
    // Fit map to show all deals in that city with some padding
    mapInstance.fitBounds(bounds, { padding: [50, 50] });
    
    // Update the table to show only deals with valid coordinates in that city
    visibleDealsForMap = dealsWithValidCoords;
    updateMapTable();
}

// Render by Bank (filter out START deals)
function renderByBank(deals) {
    const filtered = applyFilters(deals, true); // Exclude START deals
    
    // Build bank name mapping first
    buildBankNameMap(filtered);
    
    const grouped = {};
    
    filtered.forEach(deal => {
        const bank = deal.Bank || deal.bank || 'Unknown';
        // Use canonical bank name for grouping
        const canonicalBank = getCanonicalBankName(bank);
        if (!grouped[canonicalBank]) {
            grouped[canonicalBank] = [];
        }
        grouped[canonicalBank].push(deal);
    });
    
    const banks = Object.keys(grouped).filter(b => b !== 'Unknown').sort();
    if (grouped['Unknown']) banks.push('Unknown');
    
    return `
        ${renderActiveFilters()}
        ${banks.map(bank => {
        const bankDeals = grouped[bank];
        const totalUnits = bankDeals.reduce((sum, d) => sum + parseInt(d['Unit Count'] || d.unitCount || 0), 0);
        
        return `
            <div class="stage-group">
                <div class="stage-group-header">
                    <span>🏦 ${bank}</span>
                    <span style="margin-left: auto; opacity: 0.7;">
                        ${bankDeals.length} deals • ${totalUnits.toLocaleString()} units
                    </span>
                </div>
                <div class="stage-group-content">
                    <div class="stage-group-table-wrapper">
                        <table class="deal-list-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Stage</th>
                                    <th>Unit Count</th>
                                    <th>Start Date</th>
                                    <th>Product Type</th>
                                    <th>Location</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${bankDeals.map(deal => {
                                    // Create a version without Bank column for this view
                                    const stage = normalizeStage(deal.Stage || deal.stage);
                                    const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
                                    return `
                                        <tr class="deal-row" data-deal-name="${deal.Name || deal.name}">
                                            <td class="deal-name" data-label="Name">
                                                ${deal.commentsCount ? `<span class="comments-count">${deal.commentsCount}</span>` : ''}
                                                ${deal.Name || deal.name || 'Unnamed Deal'}
                                            </td>
                                            <td class="deal-cell" data-label="Stage">
                                                <span class="stage-badge clickable ${stageConfig.class}" data-stage="${stage}">${stage}</span>
                                            </td>
                                            <td class="deal-cell unit-count" data-label="Unit Count">${deal['Unit Count'] || deal.unitCount || deal.units || '-'}</td>
                                            <td class="deal-cell date-display ${isOverdue(deal['Start Date'] || deal.startDate) ? 'overdue' : ''}" data-label="Start Date">
                                                ${formatDate(deal['Start Date'] || deal.startDate) || '-'}
                                            </td>
                                            <td class="deal-cell secondary" data-label="Product Type">${deal['Product Type'] || deal.productType || '-'}</td>
                                            <td class="deal-cell" data-label="Location">
                                                ${(() => {
                                                    const location = getDealLocation(deal);
                                                    return location ? 
                                                        `<span class="location-badge clickable" data-location="${location}">${location}</span>` : 
                                                        '-';
                                                })()}
                                            </td>
                                            <td class="deal-cell" data-label="Pre-Con">
                                                ${deal['Pre-Con'] || deal.preCon || deal['Pre-Con M'] ? 
                                                    `<span class="precon-badge">${deal['Pre-Con'] || deal.preCon || deal['Pre-Con M']}</span>` : 
                                                    '-'
                                                }
                                            </td>
                                            <td class="deal-cell notes-cell" data-label="Notes" title="${(deal.Notes || deal.notes || '').replace(/"/g, '&quot;')}">
                                                ${deal.Notes || deal.notes ? 
                                                    `<span class="notes-preview">${(deal.Notes || deal.notes).substring(0, 100)}${(deal.Notes || deal.notes).length > 100 ? '...' : ''}</span>` : 
                                                    '-'
                                                }
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }).join('')}
    `;
}

// Render by Product Type
function renderByProductType(deals) {
    const filtered = applyFilters(deals, true); // Exclude START deals
    const grouped = {};
    
    filtered.forEach(deal => {
        const productType = deal['Product Type'] || deal.productType || 'Other';
        if (!grouped[productType]) {
            grouped[productType] = [];
        }
        grouped[productType].push(deal);
    });
    
    // Sort product types: Prototype first, then Heights/Flats, then others alphabetically
    const productTypes = Object.keys(grouped).sort((a, b) => {
        const order = ['Prototype', 'Heights/Flats'];
        const aIndex = order.indexOf(a);
        const bIndex = order.indexOf(b);
        
        // If both are in the order array, sort by their position
        if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex;
        }
        // If only a is in the order array, it comes first
        if (aIndex !== -1) return -1;
        // If only b is in the order array, it comes first
        if (bIndex !== -1) return 1;
        // If neither is in the order array, sort alphabetically
        return a.localeCompare(b);
    });
    
    return `
        ${renderActiveFilters()}
        ${productTypes.map(productType => {
        const typeDeals = grouped[productType];
        const totalUnits = typeDeals.reduce((sum, d) => sum + parseInt(d['Unit Count'] || d.unitCount || 0), 0);
        
        return `
            <div class="stage-group">
                <div class="stage-group-header">
                    <span>🏗️ ${productType}</span>
                    <span style="margin-left: auto; opacity: 0.7;">
                        ${typeDeals.length} deals • ${totalUnits.toLocaleString()} units
                    </span>
                </div>
                <div class="stage-group-content">
                    <div class="stage-group-table-wrapper">
                        <table class="deal-list-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Stage</th>
                                    <th>Unit Count</th>
                                    <th>Start Date</th>
                                    <th>Bank</th>
                                    <th>Location</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${typeDeals.map(deal => {
                                    // Create a version without Product Type column for this view
                                    const stage = normalizeStage(deal.Stage || deal.stage);
                                    const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
                                    return `
                                        <tr class="deal-row">
                                            <td class="deal-name" data-label="Name">
                                                ${deal.commentsCount ? `<span class="comments-count">${deal.commentsCount}</span>` : ''}
                                                ${deal.Name || deal.name || 'Unnamed Deal'}
                                            </td>
                                            <td class="deal-cell" data-label="Stage">
                                                <span class="stage-badge clickable ${stageConfig.class}" data-stage="${stage}">${stage}</span>
                                            </td>
                                            <td class="deal-cell unit-count" data-label="Unit Count">${deal['Unit Count'] || deal.unitCount || deal.units || '-'}</td>
                                            <td class="deal-cell date-display ${isOverdue(deal['Start Date'] || deal.startDate) ? 'overdue' : ''}" data-label="Start Date">
                                                ${formatDate(deal['Start Date'] || deal.startDate) || '-'}
                                            </td>
                                            <td class="deal-cell secondary" data-label="Bank">${deal.Bank || deal.bank || '-'}</td>
                                            <td class="deal-cell" data-label="Location">
                                                ${(() => {
                                                    const location = getDealLocation(deal);
                                                    return location ? 
                                                        `<span class="location-badge clickable" data-location="${location}">${location}</span>` : 
                                                        '-';
                                                })()}
                                            </td>
                                            <td class="deal-cell" data-label="Pre-Con">
                                                ${deal['Pre-Con'] || deal.preCon || deal['Pre-Con M'] ? 
                                                    `<span class="precon-badge">${deal['Pre-Con'] || deal.preCon || deal['Pre-Con M']}</span>` : 
                                                    '-'
                                                }
                                            </td>
                                            <td class="deal-cell notes-cell" data-label="Notes" title="${(deal.Notes || deal.notes || '').replace(/"/g, '&quot;')}">
                                                ${deal.Notes || deal.notes ? 
                                                    `<span class="notes-preview">${(deal.Notes || deal.notes).substring(0, 100)}${(deal.Notes || deal.notes).length > 100 ? '...' : ''}</span>` : 
                                                    '-'
                                                }
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }).join('')}
    `;
}

// Render Timeline (board-style with year/quarter columns)
// Timeline is the only view that includes START deals (they're placeholders for timeline)
function renderTimeline(deals) {
    const filtered = applyFilters(deals, false); // Don't exclude START in timeline
    const summary = calculateSummary(filtered, false); // Include START in timeline calculations
    
    const now = new Date();
    const allDates = [...summary.upcomingDates, ...summary.pastDates];
    
    // Filter dates by year (if year filter is set)
    const filteredDates = allDates.filter(item => {
        if (currentFilters.year) {
            const itemDate = new Date(item.date);
            const itemYear = itemDate.getFullYear().toString();
            return itemYear === currentFilters.year;
        }
        return true;
    });
    
    // Group by year/quarter
    const groupedByPeriod = {};
    filteredDates.forEach(item => {
        const date = new Date(item.date);
        const year = date.getFullYear();
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        const periodKey = `Q${quarter} ${year}`;
        
        if (!groupedByPeriod[periodKey]) {
            groupedByPeriod[periodKey] = [];
        }
        groupedByPeriod[periodKey].push(item);
    });
    
    // Sort periods and filter by year if year filter is set
    let periods = Object.keys(groupedByPeriod).sort((a, b) => {
        const [qA, yA] = a.split(' ').map(v => v.replace('Q', ''));
        const [qB, yB] = b.split(' ').map(v => v.replace('Q', ''));
        if (yA !== yB) return parseInt(yA) - parseInt(yB);
        return parseInt(qA) - parseInt(qB);
    });
    
    // If year filter is set, only show periods from that year
    if (currentFilters.year) {
        periods = periods.filter(period => {
            const [, year] = period.split(' ').map(v => v.replace('Q', ''));
            return year === currentFilters.year;
        });
    }
    
    // Check if we should highlight a specific deal
    const highlightDeal = window.highlightDealInTimeline;
    if (highlightDeal) {
        delete window.highlightDealInTimeline;
    }
    
    // Get available years for timeline filter
    const allYears = [...new Set(allDates.map(item => new Date(item.date).getFullYear().toString()))].sort((a, b) => parseInt(b) - parseInt(a));
    
    return `
        <div class="timeline-board-container">
            ${renderActiveFilters()}
            <div class="timeline-board-header">
                <h3>Timeline View - Organized by Quarter</h3>
                <div class="timeline-year-filter">
                    <label>Filter by Year:</label>
                    <div class="quick-filter-buttons">
                        <button class="quick-filter-btn ${!currentFilters.year ? 'active' : ''}" data-filter-type="year" data-filter-value="">All Years</button>
                        ${allYears.map(year => `
                            <button class="quick-filter-btn ${currentFilters.year === year ? 'active' : ''}" data-filter-type="year" data-filter-value="${year}">${year}</button>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="timeline-board-columns">
                ${periods.map(period => {
                    const periodDeals = groupedByPeriod[period].sort((a, b) => a.date - b.date);
                    return `
                        <div class="timeline-column">
                            <div class="timeline-column-header">
                                <span class="timeline-period">${period}</span>
                                <span class="timeline-count">${periodDeals.length}</span>
                            </div>
                            <div class="timeline-column-content">
                                ${periodDeals.map(item => {
                                    const stageConfig = STAGE_CONFIG[item.stage] || STAGE_CONFIG['Prospective'];
                                    const daysUntil = Math.ceil((item.date - now) / (1000 * 60 * 60 * 24));
                                    const isHighlighted = highlightDeal && item.name === highlightDeal;
                                    return `
                                        <div class="timeline-card ${isHighlighted ? 'highlighted' : ''}" data-deal-name="${item.name}">
                                            <div class="timeline-card-date">${formatDate(item.date)}</div>
                                            <div class="timeline-card-name">${item.name}</div>
                                            <div class="timeline-card-details">
                                                <span class="stage-badge clickable ${stageConfig.class}" data-stage="${item.stage}">${item.stage}</span>
                                                ${item.location ? `<span class="location-badge clickable" data-location="${item.location}">${item.location}</span>` : ''}
                                                ${item.units ? `<span class="units-info">${item.units} units</span>` : ''}
                                                ${item.bank ? `<span class="bank-info">${item.bank}</span>` : ''}
                                            </div>
                                            ${daysUntil >= 0 ? 
                                                `<div class="timeline-card-time">${daysUntil} day${daysUntil !== 1 ? 's' : ''} away</div>` :
                                                `<div class="timeline-card-time past">${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''} ago</div>`
                                            }
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Render Unit Summary
function renderUnitSummary(deals) {
    const filtered = applyFilters(deals, true); // Exclude START deals
    const summary = calculateSummary(filtered);
    
    return `
        ${renderActiveFilters()}
        <div class="unit-summary-container">
            <div class="summary-section">
                <h3>Total Units by Stage</h3>
                <div class="unit-breakdown">
                    ${Object.keys(summary.byStage).filter(k => !k.includes('_units') && k !== 'START').map(stage => {
                        const units = summary.byStage[stage + '_units'] || 0;
                        const count = summary.byStage[stage];
                        const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
                        const percentage = summary.totalUnits > 0 ? ((units / summary.totalUnits) * 100).toFixed(1) : 0;
                        return `
                            <div class="unit-breakdown-item">
                                <div class="unit-breakdown-header">
                                    <span class="stage-badge clickable ${stageConfig.class}" data-stage="${stage}">${stage}</span>
                                    <span class="unit-value">${units.toLocaleString()} units</span>
                                    <span class="unit-percentage">${percentage}%</span>
                                </div>
                                <div class="unit-bar">
                                    <div class="unit-bar-fill" style="width: ${percentage}%; background-color: ${stageConfig.color};"></div>
                                </div>
                                <div class="unit-count">${count} deals</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            
            <div class="summary-section">
                <h3>Total Units by Product Type</h3>
                <div class="unit-breakdown">
                    ${Object.keys(summary.byProductType).map(productType => {
                        const typeDeals = filtered.filter(d => (d['Product Type'] || d.productType || 'Other') === productType);
                        const units = typeDeals.reduce((sum, d) => sum + parseInt(d['Unit Count'] || d.unitCount || 0), 0);
                        const percentage = summary.totalUnits > 0 ? ((units / summary.totalUnits) * 100).toFixed(1) : 0;
                        return `
                            <div class="unit-breakdown-item">
                                <div class="unit-breakdown-header">
                                    <span>${productType}</span>
                                    <span class="unit-value">${units.toLocaleString()} units</span>
                                    <span class="unit-percentage">${percentage}%</span>
                                </div>
                                <div class="unit-bar">
                                    <div class="unit-bar-fill" style="width: ${percentage}%; background-color: var(--primary-green);"></div>
                                </div>
                                <div class="unit-count">${summary.byProductType[productType]} deals</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    `;
}

// Update filter UI
function updateFiltersUI() {
    // Exclude START deals before calculating summary
    const dealsWithoutStart = allDeals.filter(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        return stage !== 'START';
    });
    const summary = calculateSummary(dealsWithoutStart, true);
    
    // Update stage filter (exclude START and clear if START is somehow selected)
    const stageFilter = document.getElementById('stage-filter');
    if (stageFilter) {
        // Clear START filter if somehow set
        if (currentFilters.stage === 'START') {
            currentFilters.stage = '';
        }
        // Completely exclude START from stages - filter it out multiple times to be absolutely sure
        const validStages = Object.keys(summary.byStage)
            .filter(k => !k.includes('_units'))
            .filter(k => k !== 'START')
            .filter(k => k.toLowerCase() !== 'start')
            .filter(k => !k.includes('START'));
        stageFilter.innerHTML = '<option value="">All Stages</option>' +
            validStages
                .filter(stage => stage !== 'START' && stage.toLowerCase() !== 'start' && !stage.includes('START'))
                .map(stage => `<option value="${stage}" ${currentFilters.stage === stage ? 'selected' : ''}>${stage}</option>`)
                .join('');
    }
    
    // Update quick filter dropdowns on overview page
    const stateDropdown = document.getElementById('state-filter-dropdown');
    if (stateDropdown) {
        stateDropdown.value = currentFilters.state || '';
    }
    
    const stageDropdown = document.getElementById('stage-filter-dropdown');
    if (stageDropdown) {
        // Never allow START to be selected - clear it if somehow set
        if (currentFilters.stage === 'START') {
            currentFilters.stage = '';
        }
        stageDropdown.value = currentFilters.stage || '';
    }
    
    const productDropdown = document.getElementById('product-filter-dropdown');
    if (productDropdown) {
        productDropdown.value = currentFilters.product || '';
    }
    
    const yearDropdown = document.getElementById('year-filter-dropdown');
    if (yearDropdown) {
        yearDropdown.value = currentFilters.year || '';
    }
    
    // Update location filter
    const locationFilter = document.getElementById('location-filter');
    if (locationFilter) {
        locationFilter.innerHTML = '<option value="">All Locations</option>' +
            Object.keys(summary.byLocation).filter(l => l !== 'Unknown').sort().map(location => 
                `<option value="${location}" ${currentFilters.location === location ? 'selected' : ''}>${location}</option>`
            ).join('');
    }
    
    // Update bank filter
    const bankFilter = document.getElementById('bank-filter');
    if (bankFilter) {
        bankFilter.innerHTML = '<option value="">All Banks</option>' +
            Object.keys(summary.byBank).filter(b => b !== 'Unknown').sort().map(bank => 
                `<option value="${bank}" ${currentFilters.bank === bank ? 'selected' : ''}>${bank}</option>`
            ).join('');
    }
    
    // Update product filter
    const productFilter = document.getElementById('product-filter');
    if (productFilter) {
        productFilter.innerHTML = '<option value="">All Types</option>' +
            Object.keys(summary.byProductType).sort().map(product => 
                `<option value="${product}" ${currentFilters.product === product ? 'selected' : ''}>${product}</option>`
            ).join('');
    }
    
    // hideStart filter removed - START deals are automatically excluded
}

// Update sort UI to reflect current sort settings
function updateSortUI() {
    const sortBy = document.getElementById('sort-by');
    const sortOrder = document.getElementById('sort-order');
    
    if (sortBy) {
        sortBy.value = currentSort.by;
    }
    
    if (sortOrder) {
        sortOrder.value = currentSort.order;
    }
}

// Get active filters for display
function getActiveFilters() {
    const active = [];
    if (currentFilters.stage) active.push({ label: 'Stage', value: currentFilters.stage });
    if (currentFilters.location) active.push({ label: 'Location', value: currentFilters.location });
    if (currentFilters.bank) active.push({ label: 'Bank', value: currentFilters.bank });
    if (currentFilters.product) active.push({ label: 'Product Type', value: currentFilters.product });
    if (currentFilters.state) active.push({ label: 'State', value: currentFilters.state });
    if (currentFilters.year) active.push({ label: 'Year', value: currentFilters.year });
    if (currentFilters.search) active.push({ label: 'Search', value: currentFilters.search });
    return active;
}

// Render active filters display
function renderActiveFilters() {
    const active = getActiveFilters();
    if (active.length === 0) return '';
    
    return `
        <div class="active-filters-container">
            <div class="active-filters-label">Active Filters:</div>
            <div class="active-filters-list">
                ${active.map(filter => `
                    <span class="active-filter-badge">
                        <span class="filter-label">${filter.label}:</span>
                        <span class="filter-value">${filter.value}</span>
                    </span>
                `).join('')}
            </div>
            <button class="clear-filters-btn-top" onclick="clearFilters()">Clear All Filters</button>
        </div>
    `;
}

// Clear filters
function clearFilters() {
    currentFilters = {
        stage: '',
        location: '',
        bank: '',
        product: '',
        state: '',
        search: '', // Clear search
        year: '', // Clear year filter
        timelineStartDate: null,
        timelineEndDate: null
    };
    // Clear search input
    const searchInput = document.getElementById('search-filter');
    if (searchInput) searchInput.value = '';
    updateFiltersUI();
    switchView(currentView, allDeals);
}

// Show deal detail page
function showDealDetail(deal) {
    const stage = normalizeStage(deal.Stage || deal.stage);
    const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
    const location = getDealLocation(deal);
    const productType = getDealProductType(deal);
    const startDate = deal['Start Date'] || deal.startDate || deal.dueon || deal.due_on;
    const bank = deal.Bank || deal.bank;
    const units = deal['Unit Count'] || deal.unitCount;
    const preCon = deal['Pre-Con'] || deal.preCon || deal['Pre-Con Manager'];
    const notes = deal.Notes || deal.notes || '';
    
    // Calculate days until/ago
    let timeInfo = '';
    if (startDate) {
        try {
            const date = new Date(startDate);
            const now = new Date();
            const diffTime = date - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays >= 0) {
                timeInfo = `${diffDays} day${diffDays !== 1 ? 's' : ''} away`;
            } else {
                timeInfo = `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago`;
            }
        } catch (e) {
            // Date parsing failed
        }
    }
    
    const modal = document.createElement('div');
    modal.className = 'deal-detail-modal';
    modal.innerHTML = `
        <div class="deal-detail-overlay"></div>
        <div class="deal-detail-content">
            <div class="deal-detail-header">
                <h2>${deal.Name || deal.name || 'Unnamed Deal'}</h2>
                <button class="deal-detail-close" aria-label="Close">&times;</button>
            </div>
            <div class="deal-detail-body">
                <div class="deal-detail-section">
                    <h3>Overview</h3>
                    <div class="deal-detail-grid">
                        <div class="deal-detail-item">
                            <label>Stage</label>
                            <span class="stage-badge ${stageConfig.class}">${stage}</span>
                        </div>
                        ${location ? `
                        <div class="deal-detail-item">
                            <label>Location</label>
                            <span>${location}</span>
                        </div>
                        ` : ''}
                        ${productType ? `
                        <div class="deal-detail-item">
                            <label>Product Type</label>
                            <span>${productType}</span>
                        </div>
                        ` : ''}
                        ${units ? `
                        <div class="deal-detail-item">
                            <label>Unit Count</label>
                            <span>${units} units</span>
                        </div>
                        ` : ''}
                        ${bank ? `
                        <div class="deal-detail-item">
                            <label>Bank</label>
                            <span>${bank}</span>
                        </div>
                        ` : ''}
                        ${preCon ? `
                        <div class="deal-detail-item">
                            <label>Pre-Con Manager</label>
                            <span>${preCon}</span>
                        </div>
                        ` : ''}
                        ${startDate ? `
                        <div class="deal-detail-item">
                            <label>Start Date</label>
                            <span>${formatDate(startDate)}${timeInfo ? ` <span class="time-info">(${timeInfo})</span>` : ''}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                ${notes ? `
                <div class="deal-detail-section">
                    <h3>Notes</h3>
                    <div class="deal-detail-notes">
                        <pre>${notes.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                    </div>
                </div>
                ` : ''}
                ${deal._original ? `
                <div class="deal-detail-section">
                    <h3>Additional Information</h3>
                    <div class="deal-detail-grid">
                        ${deal._original.createdat ? `
                        <div class="deal-detail-item">
                            <label>Created</label>
                            <span>${formatDate(deal._original.createdat)}</span>
                        </div>
                        ` : ''}
                        ${deal._original.modifiedat ? `
                        <div class="deal-detail-item">
                            <label>Last Modified</label>
                            <span>${formatDate(deal._original.modifiedat)}</span>
                        </div>
                        ` : ''}
                        ${deal._original.completed ? `
                        <div class="deal-detail-item">
                            <label>Completed</label>
                            <span>${deal._original.completed === 'true' || deal._original.completed === true ? 'Yes' : 'No'}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close handlers
    modal.querySelector('.deal-detail-overlay').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.querySelector('.deal-detail-close').addEventListener('click', () => {
        modal.remove();
    });
    
    // Close on Escape key
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

// Show notes modal
function showNotesModal(dealName, notes) {
    // Remove existing modal if any
    const existingModal = document.getElementById('notes-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal
    const modal = document.createElement('div');
    modal.id = 'notes-modal';
    modal.className = 'notes-modal';
    modal.innerHTML = `
        <div class="notes-modal-overlay"></div>
        <div class="notes-modal-content">
            <div class="notes-modal-header">
                <h3>${dealName}</h3>
                <button class="notes-modal-close" onclick="this.closest('#notes-modal').remove()">&times;</button>
            </div>
            <div class="notes-modal-body">
                <pre>${notes.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close on overlay click
    modal.querySelector('.notes-modal-overlay').addEventListener('click', () => {
        modal.remove();
    });
    
    // Close on Escape key
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

// Store timeline scroll position
let timelineScrollPosition = 0;

// Switch view
function switchView(view, deals) {
    // Save timeline scroll position if leaving timeline view
    if (currentView === 'timeline') {
        const timelineColumns = document.querySelector('.timeline-board-columns');
        if (timelineColumns) {
            timelineScrollPosition = timelineColumns.scrollLeft;
        }
    }
    
    currentView = view;
    const container = document.getElementById('deal-list-container');
    const filterControls = document.getElementById('filter-controls');
    const sortControls = document.getElementById('sort-controls');
    
    // Update active tab
    document.querySelectorAll('.nav-tab').forEach(tab => {
        if (tab.dataset.view === view) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    // Show/hide filter and sort controls
    if (view === 'list' || view === 'location' || view === 'bank' || view === 'product') {
        if (filterControls) filterControls.style.display = 'flex';
        if (sortControls) sortControls.style.display = 'flex';
        // Update filter UI when showing controls
        updateFiltersUI();
        // Update sort UI to reflect current sort settings
        updateSortUI();
    } else {
        if (filterControls) filterControls.style.display = 'none';
        if (sortControls) sortControls.style.display = 'none';
    }
    
    // Show/hide list view toggle
    const listViewToggle = document.getElementById('list-view-toggle');
    if (view === 'list') {
        if (listViewToggle) listViewToggle.style.display = 'flex';
    } else {
        if (listViewToggle) listViewToggle.style.display = 'none';
    }
    
    // Render appropriate view
    switch(view) {
        case 'overview':
            container.innerHTML = renderOverview(deals);
            setupDrillDownHandlers();
            break;
        case 'list':
            renderDealList(deals);
            break;
        case 'location':
            container.innerHTML = renderByLocation(deals);
            // Apply filters before initializing map
            const filteredForMap = applyFilters(deals, true);
            setTimeout(() => initMap(filteredForMap), 100);
            setupDrillDownHandlers();
            break;
        case 'bank':
            container.innerHTML = renderByBank(deals);
            setupDrillDownHandlers();
            break;
        case 'product':
            container.innerHTML = renderByProductType(deals);
            setupDrillDownHandlers();
            break;
        case 'timeline':
            container.innerHTML = renderTimeline(deals);
            setupDrillDownHandlers();
            // Check if we need to scroll to a highlighted deal
            const highlightDeal = window.highlightDealInTimeline;
            if (highlightDeal) {
                // Scroll to highlighted deal after DOM is ready
                setTimeout(() => {
                    const highlightedCard = document.querySelector(`.timeline-card[data-deal-name="${highlightDeal}"]`);
                    if (highlightedCard) {
                        // Find the parent column and column content
                        const timelineColumn = highlightedCard.closest('.timeline-column');
                        const columnContent = highlightedCard.closest('.timeline-column-content');
                        const timelineColumns = document.querySelector('.timeline-board-columns');
                        
                        if (timelineColumn && timelineColumns && columnContent) {
                            // First, scroll the timeline columns horizontally to bring the column into view
                            const columnRect = timelineColumn.getBoundingClientRect();
                            const columnsRect = timelineColumns.getBoundingClientRect();
                            const columnLeft = timelineColumn.offsetLeft;
                            
                            // Calculate how much we need to scroll to center the column
                            const targetHorizontalScroll = columnLeft - (columnsRect.width / 2) + (columnRect.width / 2);
                            
                            timelineColumns.scrollTo({ 
                                left: Math.max(0, targetHorizontalScroll), 
                                behavior: 'smooth' 
                            });
                            
                            // Update stored scroll position
                            timelineScrollPosition = Math.max(0, targetHorizontalScroll);
                            
                            // Then scroll the column content vertically to show the card
                            // Wait a bit for horizontal scroll to start
                            setTimeout(() => {
                                const cardTop = highlightedCard.offsetTop;
                                const contentHeight = columnContent.clientHeight;
                                const cardHeight = highlightedCard.offsetHeight;
                                
                                // Calculate scroll position to center the card vertically
                                const targetVerticalScroll = cardTop - (contentHeight / 2) + (cardHeight / 2);
                                
                                columnContent.scrollTo({
                                    top: Math.max(0, targetVerticalScroll),
                                    behavior: 'smooth'
                                });
                            }, 100);
                        }
                    }
                }, 150);
            } else {
                // Restore scroll position after a brief delay to ensure DOM is ready
                setTimeout(() => {
                    const timelineColumns = document.querySelector('.timeline-board-columns');
                    if (timelineColumns) {
                        timelineColumns.scrollLeft = timelineScrollPosition;
                    }
                }, 50);
            }
            break;
        case 'units':
            container.innerHTML = renderUnitSummary(deals);
            setupDrillDownHandlers();
            break;
        default:
            renderDealList(deals);
    }
}

// Handle errors
function showError(message) {
    const container = document.getElementById('deal-list-container');
    container.innerHTML = `
        <div class="error">
            <strong>Error:</strong> ${message}
        </div>
    `;
}

// Process custom field data - group by task gid and extract custom field values
function processCustomFieldsData(rawData) {
    // The manifest maps:
    // - projectid (alias) -> projects_gid (column)
    // - ProjectName (alias) -> projects_name (column)
    // So each row already has the project name and project ID directly available!
    
    // Group by task gid
    const tasksMap = {};
    
    rawData.forEach(item => {
        const taskGid = item.gid;
        const customFieldName = item.customfieldsname || item.custom_fields_name;
        const customFieldType = item.customfieldstype || item.custom_fields_type;
        // Get project_id - manifest maps projectid (alias) -> projects_gid (column)
        const projectId = item.projectid || item.project_id || item.projectsgid || item.projects_gid;
        const resourceType = item.resourcetype || item.resource_type || '';
        
        // Skip project records in task processing (we already processed them above)
        if (resourceType === 'project' || (item.resourcesubtype || item.resource_subtype) === 'project') {
            return; // Skip project records
        }
        
        // Initialize task if not seen before
        if (!tasksMap[taskGid]) {
            // Copy all original fields from the first occurrence
            tasksMap[taskGid] = { ...item };
            // Initialize custom field containers
            tasksMap[taskGid]._customFields = {};
        }
        
        // Always preserve project_id from any row (it should be the same for all rows of same gid)
        // The manifest maps projectid (alias) -> projects_gid (column)
        if (projectId && !tasksMap[taskGid].projectid && !tasksMap[taskGid].project_id) {
            tasksMap[taskGid].projectid = projectId;
            tasksMap[taskGid].project_id = projectId;
        }
        
        // Set Project Name from the row data
        // The manifest maps ProjectName (alias) -> projects_name (column)
        const projectName = item.ProjectName || item['Project Name'] || item.projectsname || item.projects_name;
        if (projectName && projectName !== 'Unknown' && projectName.trim() !== '') {
            tasksMap[taskGid].ProjectName = projectName;
            tasksMap[taskGid]['Project Name'] = projectName;
        }
        
        // Extract custom field value based on type
        if (customFieldName) {
            let value = null;
            
            if (customFieldType === 'text') {
                value = item.customfieldstextvalue || item.custom_fields_text_value || null;
            } else if (customFieldType === 'enum') {
                // For enum, try display_value first, then enum_value_name
                // Also check if the value is "List" and skip it
                const displayValue = item.customfieldsdisplayvalue || item.custom_fields_display_value;
                const enumValueName = item.customfieldsenumvaluename || item.custom_fields_enum_value_name;
                
                if (displayValue && displayValue !== 'List' && displayValue.trim() !== '') {
                    value = displayValue;
                } else if (enumValueName && enumValueName !== 'List' && enumValueName.trim() !== '') {
                    value = enumValueName;
                } else {
                    value = null;
                }
            } else if (customFieldType === 'multi_enum') {
                // For multi_enum, it's stored as a list/array
                const multiEnum = item.customfieldsmultienumvalues || item.custom_fields_multi_enum_values;
                // Check display_value first (might have the actual selected value)
                const displayValue = item.customfieldsdisplayvalue || item.custom_fields_display_value;
                if (displayValue && displayValue !== 'List' && displayValue.trim() !== '') {
                    value = displayValue;
                } else if (multiEnum && typeof multiEnum === 'string') {
                    // Skip if it's just the literal "List" placeholder
                    if (multiEnum === 'List' || multiEnum.trim() === 'List') {
                        value = null;
                    } else {
                        // Try to parse if it's a string representation
                        try {
                            const parsed = JSON.parse(multiEnum);
                            value = Array.isArray(parsed) ? parsed.map(v => v.name || v).join(', ') : (multiEnum !== 'List' ? multiEnum : null);
                        } catch {
                            value = (multiEnum !== 'List' ? multiEnum : null);
                        }
                    }
                } else if (Array.isArray(multiEnum)) {
                    value = multiEnum.map(v => v.name || v).join(', ');
                } else {
                    value = (multiEnum && multiEnum !== 'List') ? multiEnum : null;
                }
            } else if (customFieldType === 'people') {
                // For people, it's stored as a list/array
                const people = item.customfieldspeoplevalue || item.custom_fields_people_value;
                // Check if there's a name in the people value structure
                if (people && typeof people === 'string') {
                    // Skip if it's just the literal "List" placeholder
                    if (people === 'List' || people.trim() === 'List') {
                        value = null;
                    } else {
                        try {
                            const parsed = JSON.parse(people);
                            value = Array.isArray(parsed) ? parsed.map(p => p.name || p).join(', ') : (people !== 'List' ? people : null);
                        } catch {
                            value = (people !== 'List' ? people : null);
                        }
                    }
                } else if (Array.isArray(people)) {
                    value = people.map(p => p.name || p).join(', ');
                } else {
                    value = (people && people !== 'List') ? people : null;
                }
            } else if (customFieldType === 'date') {
                value = item.customfieldsdatevaluedate || item.custom_fields_date_value_date || 
                        item.customfieldsdatevalue || item.custom_fields_date_value || null;
            } else if (customFieldType === 'number') {
                value = item.customfieldsnumbervalue || item.custom_fields_number_value || null;
            }
            
            // Store custom field value
            if (value !== null && value !== '') {
                tasksMap[taskGid]._customFields[customFieldName] = value;
            }
        }
    });
    
    // Convert map to array and add custom fields as direct properties
    return Object.values(tasksMap).map(task => {
        // Add custom fields as direct properties for easy access
        if (task._customFields) {
            if (task._customFields['Bank']) task.Bank = task._customFields['Bank'];
            if (task._customFields['Location']) {
                task.Location = task._customFields['Location'];
                task.location = task._customFields['Location']; // Also set lowercase version
            }
            if (task._customFields['Pre-Con Manager']) {
                task['Pre-Con Manager'] = task._customFields['Pre-Con Manager'];
                task.PreConManager = task._customFields['Pre-Con Manager']; // Also set as PreConManager for easier access
                task.preConManager = task._customFields['Pre-Con Manager']; // Also set lowercase version
            }
            if (task._customFields['Unit Count']) task['Unit Count Custom'] = task._customFields['Unit Count'];
            if (task._customFields['Start Date']) task['Start Date Custom'] = task._customFields['Start Date'];
            if (task._customFields['Product Type']) task['Product Type Custom'] = task._customFields['Product Type'];
            if (task._customFields['Stage']) {
                task.Stage = task._customFields['Stage'];
                task.stage = task._customFields['Stage']; // Also set lowercase version
                task['Stage Custom'] = task._customFields['Stage']; // Also set as Stage Custom for consistency
            }
        }
        // Also check for Location in the raw item fields as fallback
        if (!task.Location && !task.location) {
            const rawLocation = task.customfieldsdisplayvalue || task.custom_fields_display_value ||
                               task.customfieldsenumvaluename || task.custom_fields_enum_value_name;
            if (rawLocation && (task.customfieldsname || task.custom_fields_name) === 'Location') {
                task.Location = rawLocation;
                task.location = rawLocation;
            }
        }
        return task;
    });
}

// Main initialization
function init() {
    // Use the alias from manifest.json
    const datasetAlias = 'asanaTasksData';
    const procoreAlias = 'procoreProjectInfo';
    
    // Show loading state
    const container = document.getElementById('deal-list-container');
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
    
    // First, fetch Procore project data to build the mapping
    const procorePromise = domo.get(`/data/v2/${procoreAlias}`)
        .then(function(procoreData) {
            console.log('Procore data loaded:', procoreData);
            
            let projects = [];
            
            // Handle different data structures
            if (Array.isArray(procoreData)) {
                projects = procoreData;
            } else if (procoreData && typeof procoreData === 'object') {
                projects = procoreData.data || procoreData.rows || Object.values(procoreData);
                if (!Array.isArray(projects)) {
                    projects = [];
                }
            }
            
            // Build mapping: project name -> { actualstartdate, ... }
            procoreProjectMap = {};
            projects.forEach(project => {
                const projectName = project.name || project.Name || '';
                if (projectName) {
                    procoreProjectMap[projectName] = {
                        actualstartdate: project.actualstartdate || project.actual_start_date || null,
                        estimatedstartdate: project.estimatedstartdate || project.estimated_start_date || null,
                        address: project.address || null,
                        city: project.city || null,
                        latitude: project.latitude || null,
                        longitude: project.longitude || null,
                        // Store other fields as needed
                    };
                }
            });
            
            console.log(`Loaded ${projects.length} Procore projects. Mapping:`, Object.keys(procoreProjectMap).length, 'projects');
            return procoreProjectMap;
        })
        .catch(function(error) {
            console.warn('Error loading Procore data (will continue without it):', error);
            procoreProjectMap = {}; // Set empty map on error
            return {};
        });
    
    // Then fetch Asana data
    const asanaPromise = domo.get(`/data/v2/${datasetAlias}`)
        .then(function(data) {
            console.log('Data loaded:', data);
            
            let deals = [];
            
            // Handle different data structures
            if (Array.isArray(data)) {
                deals = data;
            } else if (data && typeof data === 'object') {
                // Handle case where data might be wrapped
                deals = data.data || data.rows || Object.values(data);
                if (!Array.isArray(deals)) {
                    deals = [];
                }
            }
            
            console.log(`Loaded ${deals.length} raw data rows`);
            return deals;
        })
        .catch(function(error) {
            console.error('Error loading Asana data:', error);
            // Try with limit parameter as fallback
            console.log('Retrying Asana data with limit parameter...');
            return domo.get(`/data/v2/${datasetAlias}?limit=5000`)
                .then(function(data) {
                    console.log('Data loaded with limit:', data);
                    let deals = [];
                    if (Array.isArray(data)) {
                        deals = data;
                    } else if (data && typeof data === 'object') {
                        deals = data.data || data.rows || Object.values(data);
                        if (!Array.isArray(deals)) {
                            deals = [];
                        }
                    }
                    return deals;
                })
                .catch(function(retryError) {
                    console.error('Retry also failed:', retryError);
                    throw new Error(`Failed to load deal data. Error: ${error.message || 'Unknown error'}. Please check your dataset alias "${datasetAlias}" in the manifest.`);
                });
        });
    
    // Wait for both to complete, then process deals
    Promise.all([procorePromise, asanaPromise])
        .then(function([procoreMap, deals]) {
            // Procore map is already set in procoreProjectMap, now process deals
            console.log('Both datasets loaded. Processing deals with Procore dates...');
            processDealData(deals);
        })
        .catch(function(error) {
            console.error('Error loading data:', error);
            showError(`Failed to load data. Error: ${error.message || 'Unknown error'}`);
        });
    
    // Helper function to process deal data
    function processDealData(deals) {
        // Process custom fields - group by task gid
        const processedTasks = processCustomFieldsData(deals);
        
        // Debug: Check what project names exist
        if (processedTasks.length > 0) {
            const sampleTask = processedTasks[0];
            console.log('Sample task keys:', Object.keys(sampleTask));
            console.log('Sample task Project Name field:', sampleTask['Project Name'], sampleTask.ProjectName, sampleTask.projectName);
            console.log('Sample task project_id:', sampleTask.projectid, sampleTask.project_id);
            
            // Check unique project names
            const projectNames = [...new Set(processedTasks.map(t => t['Project Name'] || t.ProjectName || t.projectName || 'Unknown').filter(Boolean))];
            console.log('Unique project names found:', projectNames);
            
            // Check unique project IDs
            const projectIds = [...new Set(processedTasks.map(t => t.projectid || t.project_id || 'Unknown').filter(Boolean))];
            console.log('Unique project IDs found:', projectIds.slice(0, 10)); // Show first 10
        }
        
        // Filter for only "Deal Pipeline" project
        // Manifest maps:
        // - ProjectName (alias) -> projects_name (column) 
        // - projectid (alias) -> projects_gid (column)
        const dealPipelineItems = processedTasks.filter(item => {
            // Use the manifest alias: ProjectName maps to projects_name column
            const projectName = item.ProjectName || item.projectsname || item.projects_name;
            
            // Check by project name (should be "Deal Pipeline" from projects_name column)
            const isDealPipeline = projectName === 'Deal Pipeline' || 
                                 projectName === 'deal pipeline' ||
                                 (projectName && projectName.toLowerCase().trim() === 'deal pipeline');
            
            return isDealPipeline;
        });
        
        console.log(`Filtered ${dealPipelineItems.length} items from Deal Pipeline project out of ${processedTasks.length} total tasks`);
        
        // First pass: map all items, but filter out START deals immediately
        const mappedItems = dealPipelineItems
            .map(mapAsanaDataToDeal)
            .filter(deal => {
                // Filter out null deals (returned when stage is START)
                if (!deal) return false;
                
                // Double-check stage in multiple ways to catch all variations
                const stage = deal.Stage || deal.stage || '';
                const stageStr = String(stage).trim();
                const stageLower = stageStr.toLowerCase();
                
                // If it's START in any form, exclude it completely
                if (stageStr === 'START' || 
                    stageLower === 'start' || 
                    stageStr === 'S T A R T' ||
                    stageLower === 's t a r t' ||
                    stageStr.includes('START') ||
                    (stageLower.includes('start') && !stageLower.includes('started'))) {
                    return false; // Don't include this deal at all
                }
                return true;
            });
        
        // Second pass: enrich deals with bank info from child tasks (like "Key Parties")
        allDeals = mappedItems.map(deal => {
            // If deal already has bank info, keep it
            if (deal.Bank) return deal;
            
            // Look for a child task with bank info
            const dealGid = deal._original?.gid;
            if (dealGid) {
                const childTasks = dealPipelineItems.filter(item => {
                    const parentGid = item.parentgid || item.parent_gid || item.parent;
                    return parentGid === dealGid;
                });
                
                // Check child tasks for bank info (especially "Key Parties")
                for (const child of childTasks) {
                    const childNotes = child.notes || '';
                    const parsedChild = parseNotes(childNotes);
                    if (parsedChild.bank) {
                        // Double-check it's not a product type name
                        const bankName = parsedChild.bank.toLowerCase();
                        if (!['prototype', 'heights/flats', 'heights', 'flats'].includes(bankName)) {
                            deal.Bank = parsedChild.bank;
                            break;
                        }
                    }
                }
                
                // Also check child tasks for pre-con manager info
                if (!deal['Pre-Con']) {
                    for (const child of childTasks) {
                        const childName = (child.name || '').toLowerCase();
                        // Look for tasks that might contain pre-con manager info
                        if (childName.includes('pre') && childName.includes('con')) {
                            const childNotes = child.notes || '';
                            const parsedChild = parseNotes(childNotes);
                            if (parsedChild.preCon) {
                                deal['Pre-Con'] = parsedChild.preCon;
                                break;
                            }
                        }
                    }
                }
            }
            
            return deal;
        });
        
        // Build bank name mapping after all deals are processed
        buildBankNameMap(allDeals);
        
        if (allDeals.length > 0) {
            // Set up navigation
            document.querySelectorAll('.nav-tab').forEach(tab => {
                tab.addEventListener('click', function() {
                    const view = this.dataset.view;
                    switchView(view, allDeals);
                });
            });
            
            // Set up search input handler (use input event for real-time search)
            const searchInput = document.getElementById('search-filter');
            if (searchInput) {
                searchInput.addEventListener('input', function() {
                    currentFilters.search = this.value.trim();
                    switchView(currentView, allDeals);
                });
            }
            
            // Set up filter event listeners using event delegation to handle dynamic updates
            const filterControlsContainer = document.getElementById('filter-controls');
            if (filterControlsContainer) {
                filterControlsContainer.addEventListener('change', function(e) {
                    if (e.target.id === 'stage-filter') {
                        currentFilters.stage = e.target.value;
                        switchView(currentView, allDeals);
                    } else if (e.target.id === 'location-filter') {
                        currentFilters.location = e.target.value;
                        switchView(currentView, allDeals);
                    } else if (e.target.id === 'bank-filter') {
                        currentFilters.bank = e.target.value;
                        switchView(currentView, allDeals);
                    } else if (e.target.id === 'product-filter') {
                        currentFilters.product = e.target.value;
                        switchView(currentView, allDeals);
                    }
                });
            }
            
            // Set up sort event listeners using event delegation
            const sortControlsContainer = document.getElementById('sort-controls');
            if (sortControlsContainer) {
                sortControlsContainer.addEventListener('change', function(e) {
                    if (e.target.id === 'sort-by') {
                        currentSort.by = e.target.value;
                        switchView(currentView, allDeals);
                    } else if (e.target.id === 'sort-order') {
                        currentSort.order = e.target.value;
                        switchView(currentView, allDeals);
                    }
                });
            }
            
            // Initialize filter UI and sort UI
            updateFiltersUI();
            updateSortUI();
            
            // Render initial view
            switchView(currentView, allDeals);
        } else {
            showError('No deals found in the data. Please check your dataset configuration.');
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
