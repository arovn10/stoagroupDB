# Quick Update Reference - Update ANY Field by ID

## 🎯 Simple Rule: Use the ID, send only the fields you want to change

**Base URL:** `https://stoagroupdb.onrender.com`

---

## 📋 All Update Endpoints

### Core Entities

| What to Update | Endpoint | ID Parameter | Example |
|----------------|----------|--------------|---------|
| **Project** | `PUT /api/core/projects/:id` | ProjectId | `updateProject(4, { Units: 350 })` |
| **Bank** | `PUT /api/core/banks/:id` | BankId | `updateBank(4, { Notes: "Updated" })` |
| **Person** | `PUT /api/core/persons/:id` | PersonId | `updatePerson(1, { FullName: "Toby" })` |
| **Equity Partner** | `PUT /api/core/equity-partners/:id` | EquityPartnerId | `updateEquityPartner(1, { ContactInfo: "new@email.com" })` |

### Banking Entities

| What to Update | Endpoint | ID Parameter | Example |
|----------------|----------|--------------|---------|
| **Loan** | `PUT /api/banking/loans/:id` | LoanId | `updateLoan(4, { Spread: "0.75%" })` |
| **Loan (by Project)** | `PUT /api/banking/loans/project/:projectId` | ProjectId | `updateLoanByProject(4, { Spread: "0.75%" })` |
| **Participation** | `PUT /api/banking/participations/:id` | ParticipationId | `updateParticipation(11, { ExposureAmount: 16000000 })` |
| **Guarantee** | `PUT /api/banking/guarantees/:id` | GuaranteeId | `updateGuarantee(1, { GuaranteePercent: 50 })` |
| **DSCR Test** | `PUT /api/banking/dscr-tests/:id` | DSCRTestId | `updateDSCRTest(1, { ProjectedValue: "1.25" })` |
| **Covenant** | `PUT /api/banking/covenants/:id` | CovenantId | `updateCovenant(1, { ProjectedValue: "80%" })` |
| **Liquidity Requirement** | `PUT /api/banking/liquidity-requirements/:id` | LiquidityRequirementId | `updateLiquidityRequirement(1, { TotalAmount: 6000000 })` |
| **Bank Target** | `PUT /api/banking/bank-targets/:id` | BankTargetId | `updateBankTarget(1, { ExposureWithStoa: 50000000 })` |
| **Equity Commitment** | `PUT /api/banking/equity-commitments/:id` | EquityCommitmentId | `updateEquityCommitment(1, { Amount: 6000000 })` |

### Pipeline Entities

| What to Update | Endpoint | ID Parameter | Example |
|----------------|----------|--------------|---------|
| **Under Contract** | `PUT /api/pipeline/under-contracts/:id` | UnderContractId | `updateUnderContract(1, { Price: 11000000 })` |
| **Commercial Listed** | `PUT /api/pipeline/commercial-listed/:id` | CommercialListedId | `updateCommercialListed(1, { Price: 5000000 })` |
| **Commercial Acreage** | `PUT /api/pipeline/commercial-acreage/:id` | CommercialAcreageId | `updateCommercialAcreage(1, { Price: 2000000 })` |
| **Closed Property** | `PUT /api/pipeline/closed-properties/:id` | ClosedPropertyId | `updateClosedProperty(1, { Price: 12000000 })` |

---

## 💻 Domo Usage Examples

```javascript
// Update loan interest rate
await updateLoan(loanId, {
  Spread: "0.75%",
  InterestRate: "SOFR + 0.75%"
});

// Update loan by ProjectId (no LoanId needed!)
await updateLoanByProject(projectId, {
  Spread: "0.75%"
});

// Update participation amount
await updateParticipation(participationId, {
  ExposureAmount: 16000000,
  ParticipationPercent: "32.5%"
});

// Update guarantee
await updateGuarantee(guaranteeId, {
  GuaranteePercent: 50,
  GuaranteeAmount: 25000
});

// Update DSCR test
await updateDSCRTest(testId, {
  ProjectedValue: "1.30",
  Requirement: 1.25
});

// Update covenant
await updateCovenant(covenantId, {
  ProjectedValue: "80%",
  Requirement: "50%"
});

// Update liquidity requirement
await updateLiquidityRequirement(reqId, {
  TotalAmount: 7000000,
  LendingBankAmount: 3000000
});

// Update project
await updateProject(projectId, {
  Units: 350,
  Stage: "Stabilized"
});
```

---

## 🔍 Finding IDs

Use GET endpoints to find IDs:

```javascript
// Get all projects
const projects = await getAllProjects();
// Find ProjectId from projects.data

// Get all loans
const loans = await getAllLoans();
// Find LoanId from loans.data

// Get loans for a project
const projectLoans = await getLoansByProject(projectId);
// Find LoanId from projectLoans.data
```

---

## ✅ Key Points

1. **All endpoints support partial updates** - Just send the fields you want to change
2. **Use the ID** - Every entity has an update endpoint using its primary key ID
3. **No need to send all fields** - Only send what you're changing
4. **Works from Domo** - Copy `api-client.js` into your Domo Custom Script

---

**Every single data point can be updated using its ID!** 🎯
