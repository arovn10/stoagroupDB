# Banking Deal Management - Add/Remove by ProjectId

## 🎯 Convenience Endpoints for Managing Banking Data by Deal

All these endpoints work with just the **ProjectId** - no need to know the LoanId!

---

## 📋 Add Bank Participations to a Deal

### Create Participation by ProjectId
```
POST /api/banking/participations/project/:projectId
```

**Example:**
```javascript
// Add a bank participation to a deal
await createParticipationByProject(4, {
  BankId: 4, // b1Bank
  ParticipationPercent: "32.0%",
  ExposureAmount: 15998489,
  PaidOff: false
});
```

**What it does:**
- Automatically finds the construction loan for the project
- Creates the participation linked to that loan
- No need to know the LoanId!

---

## 👥 Add Personal Guarantees to a Deal

### Create Guarantee by ProjectId
```
POST /api/banking/guarantees/project/:projectId
```

**Example:**
```javascript
// Add a personal guarantee to a deal
await createGuaranteeByProject(4, {
  PersonId: 1, // 1=Toby, 2=Ryan, 3=Saun
  GuaranteePercent: 100,
  GuaranteeAmount: 45698
});
```

**What it does:**
- Automatically finds the construction loan for the project
- Creates the guarantee linked to that loan and person
- No need to know the LoanId!

---

## 📜 Add Covenants to a Deal

### Create Covenant by ProjectId
```
POST /api/banking/covenants/project/:projectId
```

**Example:**
```javascript
// Add a covenant to a deal
await createCovenantByProject(4, {
  CovenantType: "Occupancy",
  CovenantDate: "2027-03-31",
  Requirement: "50%",
  ProjectedValue: "76.5%",
  Notes: "Occupancy covenant"
});
```

**What it does:**
- Automatically finds the construction loan for the project
- Creates the covenant linked to that loan
- No need to know the LoanId!

---

## 🗑️ Remove Items from a Deal

### Delete Participation
```
DELETE /api/banking/participations/:id
```

**Example:**
```javascript
await deleteParticipation(participationId);
```

### Delete Guarantee (Remove Personal Guarantee)
```
DELETE /api/banking/guarantees/:id
```

**Example:**
```javascript
await deleteGuarantee(guaranteeId);
```

### Delete Covenant
```
DELETE /api/banking/covenants/:id
```

**Example:**
```javascript
await deleteCovenant(covenantId);
```

---

## 📊 Get All Items for a Deal

### Get Participations by Project
```
GET /api/banking/participations/project/:projectId
```

### Get Guarantees by Project
```
GET /api/banking/guarantees/project/:projectId
```

### Get Covenants by Project
```
GET /api/banking/covenants/project/:projectId
```

**Example:**
```javascript
// Get all participations for a deal
const participations = await getParticipationsByProject(4);

// Get all guarantees for a deal
const guarantees = await getGuaranteesByProject(4);

// Get all covenants for a deal
const covenants = await getCovenantsByProject(4);
```

---

## 🔄 Update Items

### Update Participation
```
PUT /api/banking/participations/:id
```

**Example:**
```javascript
await updateParticipation(participationId, {
  ExposureAmount: 16000000,
  ParticipationPercent: "32.5%"
});
```

### Update Guarantee
```
PUT /api/banking/guarantees/:id
```

**Example:**
```javascript
await updateGuarantee(guaranteeId, {
  GuaranteePercent: 50,
  GuaranteeAmount: 25000
});
```

### Update Covenant
```
PUT /api/banking/covenants/:id
```

**Example:**
```javascript
await updateCovenant(covenantId, {
  ProjectedValue: "80%",
  Requirement: "50%"
});
```

---

## 💡 Complete Workflow Example

```javascript
// 1. Add a bank participation to a deal
const participation = await createParticipationByProject(4, {
  BankId: 4,
  ParticipationPercent: "32.0%",
  ExposureAmount: 15998489
});

// 2. Add a personal guarantee
const guarantee = await createGuaranteeByProject(4, {
  PersonId: 1, // Toby
  GuaranteePercent: 100,
  GuaranteeAmount: 45698
});

// 3. Add a covenant
const covenant = await createCovenantByProject(4, {
  CovenantType: "Occupancy",
  Requirement: "50%",
  ProjectedValue: "76.5%"
});

// 4. Later, update the participation
await updateParticipation(participation.data.ParticipationId, {
  ExposureAmount: 16000000
});

// 5. Remove a guarantee if needed
await deleteGuarantee(guarantee.data.GuaranteeId);
```

---

## ✅ Summary

**Create by ProjectId (No LoanId needed!):**
- `createParticipationByProject(projectId, data)` - Add bank participation
- `createGuaranteeByProject(projectId, data)` - Add personal guarantee
- `createCovenantByProject(projectId, data)` - Add covenant

**Update by ID:**
- `updateParticipation(id, updates)` - Update participation
- `updateGuarantee(id, updates)` - Update guarantee
- `updateCovenant(id, updates)` - Update covenant

**Delete by ID:**
- `deleteParticipation(id)` - Remove participation
- `deleteGuarantee(id)` - Remove guarantee
- `deleteCovenant(id)` - Remove covenant

**Get by ProjectId:**
- `getParticipationsByProject(projectId)` - Get all participations
- `getGuaranteesByProject(projectId)` - Get all guarantees
- `getCovenantsByProject(projectId)` - Get all covenants

---

**All endpoints are ready for your banking dashboard!** 🎯
