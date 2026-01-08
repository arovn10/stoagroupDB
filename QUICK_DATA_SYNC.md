# Quick Data Sync Instructions

## 🎯 Goal
Sync all your banking dashboard data to the database using the API.

## ✅ What's Already Done
- ✅ Sync script created (`api/scripts/sync-all-data.ts`)
- ✅ All projects defined
- ✅ All banks defined
- ✅ All people (guarantors) defined
- ✅ API endpoints ready

## 🚀 Quick Start

### Step 1: Run the Base Sync
```bash
cd api
npm run db:sync-all
```

This creates all projects, banks, and people.

### Step 2: Add Data via API

Use the API to add:
- Loans
- Participations  
- Guarantees
- DSCR Tests
- Covenants
- Liquidity Requirements
- Bank Targets

## 📝 Example: Adding a Complete Project

Here's how to add all data for "The Waters at Settlers Trace":

```javascript
// 1. Get project ID (from sync script output or query)
const projectId = 12; // Example

// 2. Create the loan
const loan = await fetch('https://stoagroupdb.onrender.com/api/banking/loans', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ProjectId: projectId,
    BirthOrder: 12,
    LoanType: 'LOC - Construction',
    Borrower: 'The Waters at Settlers Trace',
    LoanPhase: 'Construction',
    LenderId: bankId, // b1Bank ID
    LoanAmount: 49996842,
    LoanClosingDate: '2022-08-24',
    IOMaturityDate: '2025-08-24',
    FixedOrFloating: 'Floating',
    IndexName: 'WSJ Prime',
    Spread: '0.50%',
    PermPhaseMaturity: '2028-08-24',
    PermPhaseInterestRate: '3yr US Treasury + 250 - 25yr am',
    ConstructionCompletionDate: 'Feb-10',
    LeaseUpCompletedDate: 'Dec-25',
    PermanentCloseDate: '2026-06-30',
    PermanentLoanAmount: 54163986
  })
});

// 3. Add participations
const participations = [
  { BankId: b1BankId, Percent: '32.0%', Exposure: 15998489 },
  { BankId: citizensBankId, Percent: '16.0%', Exposure: 7999995 },
  { BankId: rayneStateBankId, Percent: '4.0%', Exposure: 1999874 },
  { BankId: catalystBankId, Percent: '10.0%', Exposure: 4999684 },
  { BankId: communityFirstBankId, Percent: '10.0%', Exposure: 4999684 },
  { BankId: bomBankId, Percent: '10.0%', Exposure: 4999684 },
  { BankId: clbBankId, Percent: '8.0%', Exposure: 3999747 },
  { BankId: fnbJeaneretteId, Percent: '10.0%', Exposure: 4999684 },
];

for (const part of participations) {
  await fetch('https://stoagroupdb.onrender.com/api/banking/participations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ProjectId: projectId,
      LoanId: loan.data.LoanId,
      BankId: part.BankId,
      ParticipationPercent: part.Percent,
      ExposureAmount: part.Exposure
    })
  });
}

// 4. Add guarantees
const guarantors = ['Toby Easterly', 'Ryan Nash', 'Saun Sullivan'];
for (const name of guarantors) {
  await fetch('https://stoagroupdb.onrender.com/api/banking/guarantees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ProjectId: projectId,
      PersonId: personId, // Get from person map
      GuaranteePercent: 100,
      GuaranteeAmount: 45698
    })
  });
}

// 5. Add DSCR tests
await fetch('https://stoagroupdb.onrender.com/api/banking/dscr-tests', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ProjectId: projectId,
    TestNumber: 1,
    TestDate: '2025-09-30',
    ProjectedInterestRate: '8.00%',
    Requirement: 1.00,
    ProjectedValue: '0.41'
  })
});

// 6. Add liquidity requirement
await fetch('https://stoagroupdb.onrender.com/api/banking/liquidity-requirements', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ProjectId: projectId,
    TotalAmount: 5000000,
    LendingBankAmount: 2000000
  })
});
```

## 🔍 Finding IDs

Before adding data, you need to get the IDs:

```bash
# Get project IDs
cd api
npm run db:query "SELECT ProjectId, ProjectName FROM core.Project ORDER BY ProjectName"

# Get bank IDs  
npm run db:query "SELECT BankId, BankName FROM core.Bank ORDER BY BankName"

# Get person IDs
npm run db:query "SELECT PersonId, FullName FROM core.Person"
```

## 📊 Data Reference

### Projects by Category

**Multifamily (Under Construction):**
- The Waters at Millerville
- The Waters at Redstone
- The Waters at Settlers Trace
- The Waters at West Village
- The Waters at Bluebonnet
- The Waters at Crestview
- The Heights at Picardy
- The Waters at McGowin
- The Waters at Freeport
- The Heights at Waterpointe
- The Waters at Promenade

**Pre-Construction:**
- The Flats at Ransley
- The Heights at Materra
- The Waters at Crosspointe

**Under Contract:**
- The Waters at Inverness
- The Waters at Conway
- The Waters at Covington
- The Waters at OWA
- The Waters at Greenville
- The Waters at Oxford
- The Waters at Southpoint
- The Waters at Robinwood

**Liquidated:**
- Silver Oaks
- The Heights
- Sweetwater
- The Waters at Southpark
- Dawson Park
- The Waters at Manhattan
- The Waters at Heritage
- The Waters at Ransley
- The Flats at East Bay

**Other:**
- Bauerle Rd Land, LLC
- Plane Loan
- 210 E Morris Ave, LLC
- Amor Fati, LLC
- Icarus Development, LLC
- Tredge
- Stoa Construction, LLC

## 🎯 Next Steps

1. **Run the sync script** to create base data
2. **Query the database** to get all IDs
3. **Use the API** to add loans, participations, guarantees, etc.
4. **Verify** by querying the database

See `DATA_SYNC_GUIDE.md` for detailed instructions.

---

**The API is ready at: https://stoagroupdb.onrender.com**
