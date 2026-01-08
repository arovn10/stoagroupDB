# Domo Dashboard Setup - Quick Start

## 📁 Files to Add to Your Dashboard

### 1. **api-client.js** (Required)
This file contains all the API functions you need.

**Location:** Copy the entire `api-client.js` file into your Domo dashboard project.

---

## 🚀 Quick Setup Steps

### Step 1: Copy api-client.js
1. Open `api-client.js` from this repository
2. Copy the **entire file content**
3. Paste it into your Domo dashboard's JavaScript file (usually `app.js` or a custom script)

### Step 2: Use the Functions
Now you can use any of the functions in your dashboard code:

```javascript
// Pull data
const projects = await getAllProjects();
const loans = await getLoansByProject(4);
const participations = await getParticipationsByProject(4);

// Update data
await updateLoanByProject(4, { Spread: "0.75%" });
await updateProject(4, { Units: 350 });

// Add items to a deal
await createParticipationByProject(4, {
  BankId: 4,
  ParticipationPercent: "32.0%",
  ExposureAmount: 15998489
});

await createGuaranteeByProject(4, {
  PersonId: 1, // 1=Toby, 2=Ryan, 3=Saun
  GuaranteePercent: 100,
  GuaranteeAmount: 45698
});

// Remove items
await deleteGuarantee(guaranteeId);
await deleteParticipation(participationId);
```

---

## 📚 Reference Guides

### For Quick Reference:
- **`QUICK_UPDATE_REFERENCE.md`** - Quick table of all update endpoints
- **`BANKING_DEAL_MANAGEMENT.md`** - How to add/remove participations, guarantees, covenants

### For Detailed Documentation:
- **`COMPLETE_API_REFERENCE.md`** - Complete list of all endpoints
- **`HOW_TO_USE_THE_API.md`** - Detailed usage guide

---

## 💡 Most Common Functions for Banking Dashboard

### Pull Data (GET)
```javascript
// Get all data for a deal
const project = await getProjectById(projectId);
const loans = await getLoansByProject(projectId);
const participations = await getParticipationsByProject(projectId);
const guarantees = await getGuaranteesByProject(projectId);
const covenants = await getCovenantsByProject(projectId);
```

### Update Data (PUT)
```javascript
// Update loan interest rate (by ProjectId - easiest!)
await updateLoanByProject(projectId, {
  Spread: "0.75%",
  InterestRate: "SOFR + 0.75%"
});

// Update any field by ID
await updateParticipation(participationId, {
  ExposureAmount: 16000000
});
```

### Add to Deal (POST by ProjectId)
```javascript
// Add bank participation
await createParticipationByProject(projectId, {
  BankId: 4,
  ParticipationPercent: "32.0%",
  ExposureAmount: 15998489
});

// Add personal guarantee
await createGuaranteeByProject(projectId, {
  PersonId: 1,
  GuaranteePercent: 100,
  GuaranteeAmount: 45698
});

// Add covenant
await createCovenantByProject(projectId, {
  CovenantType: "Occupancy",
  Requirement: "50%",
  ProjectedValue: "76.5%"
});
```

### Remove from Deal (DELETE)
```javascript
await deleteParticipation(participationId);
await deleteGuarantee(guaranteeId);
await deleteCovenant(covenantId);
```

---

## 🔑 Key Points

1. **Copy `api-client.js`** - This is the only file you need
2. **API URL is already set** - `https://stoagroupdb.onrender.com`
3. **All functions are async** - Use `await` when calling them
4. **Partial updates work** - Send only the fields you want to change
5. **By ProjectId is easier** - Use `updateLoanByProject`, `createParticipationByProject`, etc.

---

## ✅ That's It!

Just copy `api-client.js` into your dashboard and start using the functions. All the API endpoints are live and ready to use!
