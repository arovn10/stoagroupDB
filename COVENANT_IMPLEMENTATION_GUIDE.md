# Covenant Implementation Guide

## Overview

Covenants have **conditional fields** based on the selected `CovenantType`. The UI should show/hide fields dynamically based on the selected type.

## CovenantType Options

- **DSCR**
- **Occupancy**
- **Liquidity Requirement**
- **Other**

## Field Mapping by Type

### DSCR Covenants
Show these fields when `CovenantType === 'DSCR'`:
- `DSCRTestDate` (Date picker)
- `ProjectedInterestRate` (Text input, e.g., "5.25%")
- `DSCRRequirement` (Text input, e.g., "1.25")
- `ProjectedDSCR` (Text input, e.g., "1.35")

### Occupancy Covenants
Show these fields when `CovenantType === 'Occupancy'`:
- `OccupancyCovenantDate` (Date picker)
- `OccupancyRequirement` (Text input, e.g., "50%")
- `ProjectedOccupancy` (Text input, e.g., "76.5%")

### Liquidity Requirement Covenants
Show these fields when `CovenantType === 'Liquidity Requirement'`:
- `LiquidityRequirementLendingBank` (Number input, decimal amount)

### Other Covenants
Show these fields when `CovenantType === 'Other'`:
- `CovenantDate` (Date picker)
- `Requirement` (Text input)
- `ProjectedValue` (Text input)

## Common Fields (All Types)
- `Notes` (Textarea) - Always visible

## Implementation Steps

### 1. Create Covenant Form Structure

```javascript
// HTML/JSX structure
<form id="covenantForm">
  <!-- Covenant Type Dropdown (REQUIRED) -->
  <select id="covenantType" required>
    <option value="">Select Type...</option>
    <option value="DSCR">DSCR</option>
    <option value="Occupancy">Occupancy</option>
    <option value="Liquidity Requirement">Liquidity Requirement</option>
    <option value="Other">Other</option>
  </select>

  <!-- DSCR Fields (hidden by default) -->
  <div id="dscrFields" style="display: none;">
    <input type="date" id="dscrTestDate" placeholder="DSCR Test Date">
    <input type="text" id="projectedInterestRate" placeholder="Projected Interest Rate">
    <input type="text" id="dscrRequirement" placeholder="DSCR Requirement">
    <input type="text" id="projectedDSCR" placeholder="Projected DSCR">
  </div>

  <!-- Occupancy Fields (hidden by default) -->
  <div id="occupancyFields" style="display: none;">
    <input type="date" id="occupancyCovenantDate" placeholder="Occupancy Covenant Date">
    <input type="text" id="occupancyRequirement" placeholder="Occupancy Requirement">
    <input type="text" id="projectedOccupancy" placeholder="Projected Occupancy %">
  </div>

  <!-- Liquidity Fields (hidden by default) -->
  <div id="liquidityFields" style="display: none;">
    <input type="number" id="liquidityRequirementLendingBank" placeholder="Liquidity Requirement - Lending Bank">
  </div>

  <!-- Other Fields (hidden by default) -->
  <div id="otherFields" style="display: none;">
    <input type="date" id="covenantDate" placeholder="Covenant Date">
    <input type="text" id="requirement" placeholder="Requirement">
    <input type="text" id="projectedValue" placeholder="Projected Value">
  </div>

  <!-- Notes (always visible) -->
  <textarea id="notes" placeholder="Notes"></textarea>

  <button type="submit">Save Covenant</button>
</form>
```

### 2. Add Event Listener for CovenantType Change

```javascript
document.getElementById('covenantType').addEventListener('change', function(e) {
  const covenantType = e.target.value;
  
  // Hide all conditional fields
  document.getElementById('dscrFields').style.display = 'none';
  document.getElementById('occupancyFields').style.display = 'none';
  document.getElementById('liquidityFields').style.display = 'none';
  document.getElementById('otherFields').style.display = 'none';
  
  // Remove required attributes from hidden fields
  const allConditionalInputs = document.querySelectorAll('#dscrFields input, #occupancyFields input, #liquidityFields input, #otherFields input');
  allConditionalInputs.forEach(input => input.removeAttribute('required'));
  
  // Show relevant fields based on type
  if (covenantType === 'DSCR') {
    document.getElementById('dscrFields').style.display = 'block';
    document.querySelectorAll('#dscrFields input').forEach(input => input.setAttribute('required', 'required'));
  } else if (covenantType === 'Occupancy') {
    document.getElementById('occupancyFields').style.display = 'block';
    document.querySelectorAll('#occupancyFields input').forEach(input => input.setAttribute('required', 'required'));
  } else if (covenantType === 'Liquidity Requirement') {
    document.getElementById('liquidityFields').style.display = 'block';
    document.querySelectorAll('#liquidityFields input').forEach(input => input.setAttribute('required', 'required'));
  } else if (covenantType === 'Other') {
    document.getElementById('otherFields').style.display = 'block';
    document.querySelectorAll('#otherFields input').forEach(input => input.setAttribute('required', 'required'));
  }
});
```

### 3. Build Payload Based on CovenantType

```javascript
function buildCovenantPayload(projectId) {
  const covenantType = document.getElementById('covenantType').value;
  const payload = {
    ProjectId: projectId,
    CovenantType: covenantType,
    Notes: document.getElementById('notes').value || null
  };
  
  // Add fields based on type
  if (covenantType === 'DSCR') {
    payload.DSCRTestDate = document.getElementById('dscrTestDate').value || null;
    payload.ProjectedInterestRate = document.getElementById('projectedInterestRate').value || null;
    payload.DSCRRequirement = document.getElementById('dscrRequirement').value || null;
    payload.ProjectedDSCR = document.getElementById('projectedDSCR').value || null;
  } else if (covenantType === 'Occupancy') {
    payload.OccupancyCovenantDate = document.getElementById('occupancyCovenantDate').value || null;
    payload.OccupancyRequirement = document.getElementById('occupancyRequirement').value || null;
    payload.ProjectedOccupancy = document.getElementById('projectedOccupancy').value || null;
  } else if (covenantType === 'Liquidity Requirement') {
    const liquidityValue = document.getElementById('liquidityRequirementLendingBank').value;
    payload.LiquidityRequirementLendingBank = liquidityValue ? parseFloat(liquidityValue) : null;
  } else if (covenantType === 'Other') {
    payload.CovenantDate = document.getElementById('covenantDate').value || null;
    payload.Requirement = document.getElementById('requirement').value || null;
    payload.ProjectedValue = document.getElementById('projectedValue').value || null;
  }
  
  return payload;
}
```

### 4. Create Covenant Using API

```javascript
async function saveCovenant(projectId) {
  const payload = buildCovenantPayload(projectId);
  
  try {
    const result = await createCovenantByProject(projectId, payload);
    console.log('Covenant created:', result.data);
    return result;
  } catch (error) {
    console.error('Error creating covenant:', error);
    throw error;
  }
}
```

### 5. Update Existing Covenant

```javascript
async function updateCovenant(covenantId, projectId) {
  const payload = buildCovenantPayload(projectId);
  
  try {
    const result = await updateCovenant(covenantId, payload);
    console.log('Covenant updated:', result.data);
    return result;
  } catch (error) {
    console.error('Error updating covenant:', error);
    throw error;
  }
}
```

### 6. Populate Form for Editing

```javascript
function populateCovenantForm(covenant) {
  document.getElementById('covenantType').value = covenant.CovenantType;
  
  // Trigger change event to show correct fields
  document.getElementById('covenantType').dispatchEvent(new Event('change'));
  
  // Populate fields based on type
  if (covenant.CovenantType === 'DSCR') {
    document.getElementById('dscrTestDate').value = covenant.DSCRTestDate || '';
    document.getElementById('projectedInterestRate').value = covenant.ProjectedInterestRate || '';
    document.getElementById('dscrRequirement').value = covenant.DSCRRequirement || '';
    document.getElementById('projectedDSCR').value = covenant.ProjectedDSCR || '';
  } else if (covenant.CovenantType === 'Occupancy') {
    document.getElementById('occupancyCovenantDate').value = covenant.OccupancyCovenantDate || '';
    document.getElementById('occupancyRequirement').value = covenant.OccupancyRequirement || '';
    document.getElementById('projectedOccupancy').value = covenant.ProjectedOccupancy || '';
  } else if (covenant.CovenantType === 'Liquidity Requirement') {
    document.getElementById('liquidityRequirementLendingBank').value = covenant.LiquidityRequirementLendingBank || '';
  } else if (covenant.CovenantType === 'Other') {
    document.getElementById('covenantDate').value = covenant.CovenantDate || '';
    document.getElementById('requirement').value = covenant.Requirement || '';
    document.getElementById('projectedValue').value = covenant.ProjectedValue || '';
  }
  
  document.getElementById('notes').value = covenant.Notes || '';
}
```

## API Endpoints

```javascript
// Get all covenants for a project
const covenants = await getCovenantsByProject(projectId);

// Create covenant
await createCovenantByProject(projectId, {
  CovenantType: 'DSCR',
  DSCRTestDate: '2027-03-31',
  ProjectedInterestRate: '5.25%',
  DSCRRequirement: '1.25',
  ProjectedDSCR: '1.35'
});

// Update covenant
await updateCovenant(covenantId, {
  CovenantType: 'Occupancy',
  OccupancyCovenantDate: '2027-03-31',
  OccupancyRequirement: '50%',
  ProjectedOccupancy: '76.5%'
});

// Delete covenant
await deleteCovenant(covenantId);
```

## Key Points

1. **Always validate CovenantType is selected** before showing conditional fields
2. **Remove `required` attribute** from hidden fields to avoid browser validation errors
3. **Only send fields relevant to the selected CovenantType** in the API payload
4. **Show/hide fields immediately** when CovenantType changes
5. **Clear conditional fields** when switching between types to avoid confusion

## Example: Complete Form Handler

```javascript
document.getElementById('covenantForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const projectId = getCurrentProjectId(); // Your function to get current project
  const covenantType = document.getElementById('covenantType').value;
  
  if (!covenantType) {
    alert('Please select a Covenant Type');
    return;
  }
  
  try {
    const payload = buildCovenantPayload(projectId);
    const result = await createCovenantByProject(projectId, payload);
    alert('Covenant created successfully!');
    // Refresh covenant list or close modal
  } catch (error) {
    alert('Error creating covenant: ' + error.message);
  }
});
```
