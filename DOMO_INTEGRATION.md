# Using the API in Domo Dashboards

Copy `api-client.js` to your Domo project to easily use the API functions.

---

## 📋 Quick Setup

### Step 1: Copy the File

Copy `api-client.js` to your Domo project or dashboard folder.

### Step 2: Use in Domo Custom Scripts

In Domo DataFlows or Magic ETL, add a **Custom Script** step and use the functions:

---

## 🚀 Usage Examples

### Example 1: Create a Project from Domo Data

```javascript
// In Domo Custom Script step
// Input: Your dataset with project information

// Create a project for each row
const results = [];

for (let i = 0; i < DomoData.length; i++) {
  const row = DomoData[i];
  
  try {
    const result = await createProject({
      ProjectName: row.ProjectName,
      City: row.City,
      State: row.State,
      Region: row.Region,
      Location: row.Location,
      Units: row.Units,
      ProductType: row.ProductType,
      Stage: row.Stage
    });
    
    results.push({
      ...row,
      API_Status: 'Success',
      ProjectId: result.data.ProjectId
    });
  } catch (error) {
    results.push({
      ...row,
      API_Status: 'Error',
      Error: error.message
    });
  }
}

return results;
```

### Example 2: Update Project Units

```javascript
// Update projects based on Domo data
const results = [];

for (let i = 0; i < DomoData.length; i++) {
  const row = DomoData[i];
  
  try {
    const result = await updateProject(row.ProjectId, {
      Units: row.NewUnits,
      Stage: row.NewStage
    });
    
    results.push({
      ProjectId: row.ProjectId,
      Status: 'Updated',
      NewUnits: result.data.Units
    });
  } catch (error) {
    results.push({
      ProjectId: row.ProjectId,
      Status: 'Error',
      Error: error.message
    });
  }
}

return results;
```

### Example 3: Create Loans from Domo Data

```javascript
// Create loans for projects
const results = [];

for (let i = 0; i < DomoData.length; i++) {
  const row = DomoData[i];
  
  try {
    const result = await createLoan({
      ProjectId: row.ProjectId,
      LoanPhase: row.LoanPhase,
      LoanType: row.LoanType,
      LenderId: row.LenderId,
      LoanAmount: row.LoanAmount,
      LoanClosingDate: row.LoanClosingDate,
      MaturityDate: row.MaturityDate
    });
    
    results.push({
      ProjectId: row.ProjectId,
      Status: 'Created',
      LoanId: result.data.LoanId
    });
  } catch (error) {
    results.push({
      ProjectId: row.ProjectId,
      Status: 'Error',
      Error: error.message
    });
  }
}

return results;
```

### Example 4: Bulk Update Projects

```javascript
// Update multiple projects at once
const updates = DomoData.map(async (row) => {
  try {
    const result = await updateProject(row.ProjectId, {
      Units: row.Units,
      Stage: row.Stage,
      ProductType: row.ProductType
    });
    return { ProjectId: row.ProjectId, Status: 'Success', Data: result.data };
  } catch (error) {
    return { ProjectId: row.ProjectId, Status: 'Error', Error: error.message };
  }
});

return await Promise.all(updates);
```

---

## 📝 Available Functions

### Core Entities
- `createProject(projectData)` - Create new project
- `updateProject(projectId, updates)` - Update project
- `createBank(bankData)` - Create new bank
- `updateBank(bankId, updates)` - Update bank
- `createPerson(personData)` - Create new person
- `updatePerson(personId, updates)` - Update person
- `createEquityPartner(partnerData)` - Create equity partner
- `updateEquityPartner(partnerId, updates)` - Update equity partner

### Banking
- `createLoan(loanData)` - Create new loan
- `updateLoan(loanId, updates)` - Update loan
- `createParticipation(participationData)` - Create participation
- `updateParticipation(participationId, updates)` - Update participation
- `createGuarantee(guaranteeData)` - Create guarantee
- `updateGuarantee(guaranteeId, updates)` - Update guarantee
- `createDSCRTest(testData)` - Create DSCR test
- `updateDSCRTest(testId, updates)` - Update DSCR test
- `createCovenant(covenantData)` - Create covenant
- `updateCovenant(covenantId, updates)` - Update covenant
- `createLiquidityRequirement(requirementData)` - Create liquidity requirement
- `updateLiquidityRequirement(requirementId, updates)` - Update liquidity requirement
- `createBankTarget(targetData)` - Create bank target
- `updateBankTarget(targetId, updates)` - Update bank target
- `createEquityCommitment(commitmentData)` - Create equity commitment
- `updateEquityCommitment(commitmentId, updates)` - Update equity commitment

### Pipeline
- `createUnderContract(contractData)` - Create under contract
- `updateUnderContract(contractId, updates)` - Update under contract
- `createCommercialListed(listedData)` - Create commercial listed
- `updateCommercialListed(listedId, updates)` - Update commercial listed
- `createCommercialAcreage(acreageData)` - Create commercial acreage
- `updateCommercialAcreage(acreageId, updates)` - Update commercial acreage
- `createClosedProperty(propertyData)` - Create closed property
- `updateClosedProperty(propertyId, updates)` - Update closed property

### Utilities
- `checkHealth()` - Check API health
- `getAPIDocs()` - Get API documentation

---

## 🔧 How to Add to Domo

### Option 1: Copy-Paste the Functions

1. Open `api-client.js`
2. Copy the entire file content
3. In Domo Custom Script, paste it at the top
4. Then use the functions below

### Option 2: Reference External File

1. Upload `api-client.js` to a web server or Domo file storage
2. In Domo Custom Script, load it:
   ```javascript
   // Load the API client
   const script = await fetch('https://your-server.com/api-client.js');
   eval(await script.text());
   
   // Now use the functions
   const result = await createProject({...});
   ```

### Option 3: Inline Functions

Just copy the specific functions you need into your Domo script.

---

## 💡 Tips for Domo

1. **Always handle errors** - Wrap API calls in try/catch
2. **Use async/await** - Domo supports async functions
3. **Process row by row** - Loop through DomoData array
4. **Return results** - Always return an array for Domo
5. **Test with one row first** - Before processing all rows

---

## 🎯 Common Patterns

### Pattern 1: Create Records from Domo Data

```javascript
const results = DomoData.map(async (row) => {
  try {
    const result = await createProject(row);
    return { ...row, Status: 'Success', ID: result.data.ProjectId };
  } catch (error) {
    return { ...row, Status: 'Error', Error: error.message };
  }
});

return await Promise.all(results);
```

### Pattern 2: Update Based on Conditions

```javascript
const results = [];

for (const row of DomoData) {
  if (row.ShouldUpdate === 'Yes') {
    try {
      await updateProject(row.ProjectId, {
        Units: row.NewUnits,
        Stage: row.NewStage
      });
      results.push({ ProjectId: row.ProjectId, Status: 'Updated' });
    } catch (error) {
      results.push({ ProjectId: row.ProjectId, Status: 'Error', Error: error.message });
    }
  }
}

return results;
```

### Pattern 3: Validate Before Creating

```javascript
const results = [];

for (const row of DomoData) {
  // Validate required fields
  if (!row.ProjectName || !row.City || !row.State) {
    results.push({ ...row, Status: 'Skipped', Reason: 'Missing required fields' });
    continue;
  }
  
  try {
    const result = await createProject(row);
    results.push({ ...row, Status: 'Created', ProjectId: result.data.ProjectId });
  } catch (error) {
    results.push({ ...row, Status: 'Error', Error: error.message });
  }
}

return results;
```

---

## 📚 More Information

- **API URL:** https://stoagroupdb.onrender.com
- **Full API Guide:** See `HOW_TO_USE_THE_API.md`
- **API Documentation:** `GET https://stoagroupdb.onrender.com/api`

---

**Copy `api-client.js` to your Domo project and start using the API functions!** 🚀
