# Loan Update Implementation Guide

## Overview

The loan update functionality has been fixed to ensure **Construction** and **Permanent** loans are completely separate. When updating loan information (bank, amount, rates, etc.), you must specify which loan type you're updating to prevent accidentally modifying the wrong loan.

## Problem Fixed

Previously, updating a Construction loan's bank would sometimes accidentally update the Permanent loan's bank (and vice versa). This has been fixed by requiring `LoanPhase` to be specified when updating loans.

## API Function: `updateLoanByProject`

### Function Signature
```javascript
API.updateLoanByProject(projectId, data)
```

### Parameters
- `projectId` (number, required) - The Project ID
- `data` (object, required) - Update data object
  - `LoanPhase` (string, **REQUIRED**) - Must be `'Construction'` or `'Permanent'`
  - `LenderId` (number, optional) - Bank/Lender ID
  - `LoanAmount` (number, optional) - Loan amount
  - `FixedOrFloating` (string, optional) - `'Fixed'` or `'Floating'`
  - `IndexName` (string, optional) - For Construction loans: `'Prime'` or `'SOFR'`
  - `Spread` (string, optional) - Spread value (e.g., "2.75%")
  - Any other loan fields you want to update

### Return Value
```javascript
{
  success: true,
  data: {
    LoanId: 123,
    LoanPhase: 'Construction', // or 'Permanent'
    LenderId: 5,
    LoanAmount: 5000000,
    // ... other loan fields
  }
}
```

## Implementation Steps

### Step 1: Identify Which Loan Type You're Updating

Before calling `updateLoanByProject`, determine if you're updating:
- **Construction Loan** - The initial construction financing
- **Permanent Loan** - The permanent/takeout financing

### Step 2: Always Include `LoanPhase` in Update Calls

**✅ CORRECT:**
```javascript
// Update Construction loan bank
await API.updateLoanByProject(projectId, {
  LoanPhase: 'Construction',
  LenderId: newBankId,
  LoanAmount: newAmount
});

// Update Permanent loan bank
await API.updateLoanByProject(projectId, {
  LoanPhase: 'Permanent',
  LenderId: newBankId,
  LoanAmount: newAmount
});
```

**❌ INCORRECT (Will default to Construction, may update wrong loan):**
```javascript
// DON'T DO THIS - Missing LoanPhase
await API.updateLoanByProject(projectId, {
  LenderId: newBankId,
  LoanAmount: newAmount
});
```

### Step 3: Handle Separate Forms/Sections

If your UI has separate sections for Construction and Permanent loans, ensure each section includes `LoanPhase`:

```javascript
// Construction Loan Form Handler
async function updateConstructionLoan(projectId, formData) {
  const updateData = {
    LoanPhase: 'Construction', // Always include this!
    LenderId: formData.constructionBankId,
    LoanAmount: formData.constructionAmount,
    FixedOrFloating: formData.constructionFixedOrFloating,
    IndexName: formData.constructionIndexName,
    Spread: formData.constructionSpread
  };
  
  return await API.updateLoanByProject(projectId, updateData);
}

// Permanent Loan Form Handler
async function updatePermanentLoan(projectId, formData) {
  const updateData = {
    LoanPhase: 'Permanent', // Always include this!
    LenderId: formData.permanentBankId,
    LoanAmount: formData.permanentAmount,
    FixedOrFloating: formData.permanentFixedOrFloating,
    Spread: formData.permanentSpread
  };
  
  return await API.updateLoanByProject(projectId, updateData);
}
```

### Step 4: Fetch Loans to Determine What Exists

Before updating, you may want to check which loans exist for a project:

```javascript
// Get all loans for a project
const loansResponse = await API.getLoansByProject(projectId);
const loans = loansResponse.data;

// Find Construction loan
const constructionLoan = loans.find(loan => loan.LoanPhase === 'Construction');

// Find Permanent loan
const permanentLoan = loans.find(loan => loan.LoanPhase === 'Permanent');

// Update only if loan exists
if (constructionLoan) {
  await API.updateLoanByProject(projectId, {
    LoanPhase: 'Construction',
    LenderId: newBankId
  });
} else {
  // Create new Construction loan instead
  await API.createLoan({
    ProjectId: projectId,
    LoanPhase: 'Construction',
    LenderId: newBankId
  });
}
```

## Common Scenarios

### Scenario 1: Updating Bank/Lender

```javascript
// User changes Construction loan bank
async function handleConstructionBankChange(projectId, newBankId) {
  try {
    const result = await API.updateLoanByProject(projectId, {
      LoanPhase: 'Construction',
      LenderId: newBankId
    });
    console.log('Construction loan updated:', result.data);
  } catch (error) {
    if (error.message.includes('No Construction loan found')) {
      // Loan doesn't exist, create it
      await API.createLoan({
        ProjectId: projectId,
        LoanPhase: 'Construction',
        LenderId: newBankId
      });
    } else {
      throw error;
    }
  }
}

// User changes Permanent loan bank
async function handlePermanentBankChange(projectId, newBankId) {
  try {
    const result = await API.updateLoanByProject(projectId, {
      LoanPhase: 'Permanent',
      LenderId: newBankId
    });
    console.log('Permanent loan updated:', result.data);
  } catch (error) {
    if (error.message.includes('No Permanent loan found')) {
      // Loan doesn't exist, create it
      await API.createLoan({
        ProjectId: projectId,
        LoanPhase: 'Permanent',
        LenderId: newBankId
      });
    } else {
      throw error;
    }
  }
}
```

### Scenario 2: Updating Loan Amount

```javascript
// Update Construction loan amount
await API.updateLoanByProject(projectId, {
  LoanPhase: 'Construction',
  LoanAmount: 5000000
});

// Update Permanent loan amount
await API.updateLoanByProject(projectId, {
  LoanPhase: 'Permanent',
  LoanAmount: 4500000
});
```

### Scenario 3: Updating Rate Information

```javascript
// Update Construction loan rates
await API.updateLoanByProject(projectId, {
  LoanPhase: 'Construction',
  FixedOrFloating: 'Floating',
  IndexName: 'SOFR',
  Spread: '2.75%'
});

// Update Permanent loan rates
await API.updateLoanByProject(projectId, {
  LoanPhase: 'Permanent',
  FixedOrFloating: 'Fixed',
  InterestRate: '5.25%'
});
```

### Scenario 4: Batch Update Multiple Fields

```javascript
// Update multiple Construction loan fields at once
await API.updateLoanByProject(projectId, {
  LoanPhase: 'Construction',
  LenderId: 5,
  LoanAmount: 5000000,
  LoanClosingDate: '2024-01-15',
  FixedOrFloating: 'Floating',
  IndexName: 'SOFR',
  Spread: '2.75%',
  MaturityDate: '2026-01-15'
});
```

## Error Handling

### Error: Loan Not Found

If the loan doesn't exist, the API will return:
```javascript
{
  success: false,
  error: {
    message: "No Construction loan found for this project. Please create the loan first or specify a different LoanPhase."
  }
}
```

**Solution:** Create the loan first:
```javascript
try {
  await API.updateLoanByProject(projectId, {
    LoanPhase: 'Construction',
    LenderId: bankId
  });
} catch (error) {
  if (error.message.includes('No Construction loan found')) {
    // Create the loan
    await API.createLoan({
      ProjectId: projectId,
      LoanPhase: 'Construction',
      LenderId: bankId
    });
  }
}
```

### Error: Cannot Change LoanPhase

If you try to change `LoanPhase` using `updateLoanByProject`, you'll get:
```javascript
{
  success: false,
  error: {
    message: "Cannot change LoanPhase from 'Construction' to 'Permanent' using updateLoanByProject. Use updateLoan with LoanId instead, or create a new loan."
  }
}
```

**Solution:** To change loan type, create a new loan or use `updateLoan` with the `LoanId`:
```javascript
// Option 1: Create a new loan
await API.createLoan({
  ProjectId: projectId,
  LoanPhase: 'Permanent',
  LenderId: bankId
});

// Option 2: Use updateLoan with LoanId (if you have it)
await API.updateLoan(loanId, {
  LoanPhase: 'Permanent'
});
```

## Validation Rules

### Construction Loans
- `IndexName` must be `NULL`, `'Prime'`, or `'SOFR'` (only for Floating rates)
- `FixedOrFloating` must be `NULL`, `'Fixed'`, or `'Floating'`

### Permanent Loans
- `FixedOrFloating` must be `NULL`, `'Fixed'`, or `'Floating'`
- `IndexName` is typically not used for Permanent loans

## Best Practices

1. **Always specify `LoanPhase`** - Never omit this field
2. **Separate UI sections** - Have distinct forms/sections for Construction vs Permanent loans
3. **Check loan existence** - Before updating, check if the loan exists using `getLoansByProject`
4. **Handle errors gracefully** - If loan doesn't exist, offer to create it
5. **Clear labeling** - Make it obvious to users which loan type they're editing
6. **Prevent confusion** - Use different variable names (e.g., `constructionBankId` vs `permanentBankId`)

## Example: Complete Form Handler

```javascript
class LoanUpdateHandler {
  constructor(projectId) {
    this.projectId = projectId;
  }

  async updateConstructionLoan(formData) {
    const updateData = {
      LoanPhase: 'Construction', // CRITICAL: Always include
      ...(formData.lenderId && { LenderId: formData.lenderId }),
      ...(formData.amount && { LoanAmount: formData.amount }),
      ...(formData.fixedOrFloating && { FixedOrFloating: formData.fixedOrFloating }),
      ...(formData.indexName && { IndexName: formData.indexName }),
      ...(formData.spread && { Spread: formData.spread }),
      ...(formData.closingDate && { LoanClosingDate: formData.closingDate })
    };

    try {
      return await API.updateLoanByProject(this.projectId, updateData);
    } catch (error) {
      if (error.message.includes('No Construction loan found')) {
        // Create loan if it doesn't exist
        return await API.createLoan({
          ProjectId: this.projectId,
          LoanPhase: 'Construction',
          ...updateData
        });
      }
      throw error;
    }
  }

  async updatePermanentLoan(formData) {
    const updateData = {
      LoanPhase: 'Permanent', // CRITICAL: Always include
      ...(formData.lenderId && { LenderId: formData.lenderId }),
      ...(formData.amount && { LoanAmount: formData.amount }),
      ...(formData.fixedOrFloating && { FixedOrFloating: formData.fixedOrFloating }),
      ...(formData.spread && { Spread: formData.spread }),
      ...(formData.closingDate && { LoanClosingDate: formData.closingDate })
    };

    try {
      return await API.updateLoanByProject(this.projectId, updateData);
    } catch (error) {
      if (error.message.includes('No Permanent loan found')) {
        // Create loan if it doesn't exist
        return await API.createLoan({
          ProjectId: this.projectId,
          LoanPhase: 'Permanent',
          ...updateData
        });
      }
      throw error;
    }
  }
}

// Usage
const handler = new LoanUpdateHandler(projectId);
await handler.updateConstructionLoan({
  lenderId: 5,
  amount: 5000000,
  fixedOrFloating: 'Floating',
  indexName: 'SOFR',
  spread: '2.75%'
});
```

## Summary

**Key Takeaway:** Always include `LoanPhase: 'Construction'` or `LoanPhase: 'Permanent'` when calling `updateLoanByProject` to ensure you're updating the correct loan. This prevents accidentally modifying the wrong loan type.

**Quick Reference:**
- ✅ `updateLoanByProject(projectId, { LoanPhase: 'Construction', ... })`
- ✅ `updateLoanByProject(projectId, { LoanPhase: 'Permanent', ... })`
- ❌ `updateLoanByProject(projectId, { ... })` (Missing LoanPhase)
