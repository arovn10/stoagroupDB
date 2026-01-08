# Complete Data Sync Guide

This guide shows you how to sync all your banking dashboard data to the database using the API.

---

## 🎯 Overview

Your data includes:
1. **Projects** - All properties (Multifamily, Under Contract, Liquidated, Other)
2. **Banks** - All lenders with exposure data
3. **Loans** - Construction loans with all details
4. **Participations** - Bank participation splits
5. **Guarantees** - Contingent liabilities (Stoa Holdings, Toby, Ryan, Saun)
6. **DSCR Tests** - 1st, 2nd, 3rd test dates and requirements
7. **Covenants** - Occupancy and other requirements
8. **Liquidity Requirements** - Total and lending bank amounts
9. **Bank Targets** - Relationship and capacity information

---

## 🚀 Quick Start

### Option 1: Use the Sync Script

```bash
cd api
npm run db:sync-all
```

This will create all projects, banks, and people. Then you can add loans, participations, etc. via API.

### Option 2: Use API Directly

Use the `api-client.js` file or make direct API calls. See examples below.

---

## 📋 Step-by-Step Data Entry

### Step 1: Projects (Already in sync script)

All projects are defined in the sync script. Run it first.

### Step 2: Add Loans

For each project, create a loan record:

```javascript
// Example: The Waters at Hammond
await createLoan({
  ProjectId: projectId, // Get from project map
  BirthOrder: 6,
  LoanType: "LOC - Construction",
  Borrower: "The Waters at Hammond",
  LoanPhase: "Construction",
  LenderId: bankId, // b1Bank
  LoanAmount: 31520000,
  LoanClosingDate: "2020-09-24",
  MaturityDate: "2023-09-24",
  FixedOrFloating: "Floating",
  IndexName: "WSJ Prime",
  Spread: "0.50%",
  IOMaturityDate: "2023-09-24",
  MiniPermMaturity: "2026-09-24",
  MiniPermInterestRate: "5yr US Treasury + TBD - 25yr am",
  PermanentCloseDate: "2024-04-30",
  PermanentLoanAmount: 39364000,
  // ... other fields
});
```

### Step 3: Add Participations

For each bank participating in a loan:

```javascript
// Example: The Waters at Settlers Trace - b1Bank participation
await createParticipation({
  ProjectId: projectId,
  LoanId: loanId, // Optional
  BankId: bankId, // b1Bank
  ParticipationPercent: "32.0%",
  ExposureAmount: 15998489,
  PaidOff: false
});
```

### Step 4: Add Guarantees

For each guarantor on each project:

```javascript
// Example: Toby Easterly guarantee for The Waters at Ransley
await createGuarantee({
  ProjectId: projectId,
  LoanId: loanId, // Optional
  PersonId: personId, // Toby Easterly
  GuaranteePercent: 100,
  GuaranteeAmount: 45337,
  Notes: "100% guaranty"
});
```

### Step 5: Add DSCR Tests

For each DSCR test (1st, 2nd, 3rd):

```javascript
// Example: 1st DSCR Test for The Waters at Millerville
await createDSCRTest({
  ProjectId: projectId,
  LoanId: loanId, // Optional
  TestNumber: 1,
  TestDate: "2025-06-30",
  ProjectedInterestRate: "0.00%",
  Requirement: 1.00,
  ProjectedValue: "2,795,107.64"
});
```

### Step 6: Add Covenants

```javascript
// Example: Occupancy covenant
await createCovenant({
  ProjectId: projectId,
  LoanId: loanId, // Optional
  CovenantType: "Occupancy",
  CovenantDate: "2027-03-31",
  Requirement: "50%",
  ProjectedValue: "76.5%"
});
```

### Step 7: Add Liquidity Requirements

```javascript
await createLiquidityRequirement({
  ProjectId: projectId,
  LoanId: loanId, // Optional
  TotalAmount: 5000000,
  LendingBankAmount: 1000000
});
```

### Step 8: Add Bank Targets

```javascript
await createBankTarget({
  BankId: bankId,
  AssetsText: "$1,743,283,000",
  City: "Sioux Falls",
  State: "SD",
  ExposureWithStoa: 41580000,
  ContactText: "Brady Hutka",
  Comments: "3/16/21: Showed no interest"
});
```

---

## 📊 Data Mapping Reference

### Project Stages
- `Stabilized` - Completed and stabilized
- `Under Construction` - Currently being built
- `Pre-Construction` - Not yet started
- `Under Contract` - Contracted but not started
- `Liquidated` - Sold/closed
- `Other` - Other types

### Loan Phases
- `Construction` - Construction loan
- `Permanent` - Permanent financing
- `MiniPerm` - Mini-permanent loan
- `Land` - Land loan
- `Other` - Other loan types

### Product Types
- `Waters` - The Waters at...
- `Heights` - The Heights at...
- `Flats` - The Flats at...
- `Other` - Other product types

---

## 🔧 Using the API Client

Copy `api-client.js` to your Domo project or use it in a script:

```javascript
// Load the API client functions
// Then use:
const project = await createProject({...});
const loan = await createLoan({...});
const participation = await createParticipation({...});
```

---

## 📝 Example: Complete Project Setup

```javascript
// 1. Create/Get Project
const project = await createProject({
  ProjectName: "The Waters at Settlers Trace",
  City: "Lafayette",
  State: "LA",
  Units: 348,
  Stage: "Under Construction",
  ProductType: "Waters"
});

// 2. Create Loan
const loan = await createLoan({
  ProjectId: project.data.ProjectId,
  BirthOrder: 12,
  LoanType: "LOC - Construction",
  LoanPhase: "Construction",
  LenderId: bankMap['b1Bank'],
  LoanAmount: 49996842,
  LoanClosingDate: "2022-08-24",
  // ... all other loan fields
});

// 3. Add Participations
const participations = [
  { BankId: bankMap['b1Bank'], Percent: "32.0%", Exposure: 15998489 },
  { BankId: bankMap['The Citizens Bank'], Percent: "16.0%", Exposure: 7999995 },
  // ... etc
];

for (const part of participations) {
  await createParticipation({
    ProjectId: project.data.ProjectId,
    LoanId: loan.data.LoanId,
    BankId: part.BankId,
    ParticipationPercent: part.Percent,
    ExposureAmount: part.Exposure
  });
}

// 4. Add Guarantees
for (const personName of ['Toby Easterly', 'Ryan Nash', 'Saun Sullivan']) {
  await createGuarantee({
    ProjectId: project.data.ProjectId,
    PersonId: personMap[personName],
    GuaranteePercent: 100,
    GuaranteeAmount: 45698
  });
}

// 5. Add DSCR Tests
await createDSCRTest({
  ProjectId: project.data.ProjectId,
  TestNumber: 1,
  TestDate: "2025-09-30",
  ProjectedInterestRate: "8.00%",
  Requirement: 1.00,
  ProjectedValue: "0.41"
});

// 6. Add Liquidity Requirement
await createLiquidityRequirement({
  ProjectId: project.data.ProjectId,
  TotalAmount: 5000000,
  LendingBankAmount: 2000000
});
```

---

## 🎯 Priority Order

1. **Projects** - Must exist first (run sync script)
2. **Banks** - Must exist for loans/participations (run sync script)
3. **People** - Must exist for guarantees (run sync script)
4. **Loans** - Create after projects/banks exist
5. **Participations** - Create after loans exist
6. **Guarantees** - Create after projects/people exist
7. **DSCR Tests** - Create after projects exist
8. **Covenants** - Create after projects exist
9. **Liquidity Requirements** - Create after projects exist
10. **Bank Targets** - Create after banks exist

---

## ✅ Verification

After syncing, verify data:

```bash
# Check projects
npm run db:query "SELECT * FROM core.Project ORDER BY ProjectName"

# Check loans
npm run db:query "SELECT * FROM banking.Loan ORDER BY ProjectId"

# Check participations
npm run db:query "SELECT * FROM banking.Participation ORDER BY ProjectId"

# Check guarantees
npm run db:query "SELECT * FROM banking.Guarantee ORDER BY ProjectId"
```

---

## 🐛 Troubleshooting

### "Project not found"
- Make sure you ran the sync script to create projects first
- Check project name matches exactly (case-sensitive)

### "Bank not found"
- Make sure bank exists in core.Bank table
- Check bank name matches exactly

### "Person not found"
- Make sure people (Toby, Ryan, Saun) exist in core.Person table

### "Foreign key constraint"
- Make sure parent records exist (Project before Loan, Bank before Participation, etc.)

---

## 📚 API Endpoints Reference

- `POST /api/core/projects` - Create project
- `POST /api/core/banks` - Create bank
- `POST /api/core/persons` - Create person
- `POST /api/banking/loans` - Create loan
- `POST /api/banking/participations` - Create participation
- `POST /api/banking/guarantees` - Create guarantee
- `POST /api/banking/dscr-tests` - Create DSCR test
- `POST /api/banking/covenants` - Create covenant
- `POST /api/banking/liquidity-requirements` - Create liquidity requirement
- `POST /api/banking/bank-targets` - Create bank target

See `HOW_TO_USE_THE_API.md` for full API documentation.

---

**Start with the sync script, then add detailed data via API!** 🚀
