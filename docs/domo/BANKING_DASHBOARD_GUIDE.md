# Banking/Equity Dashboard - Complete Implementation Guide

## 🎯 Overview

This guide provides complete instructions for building a Banking/Equity dashboard with three main tabs:
1. **By Property** (with 3 sub-views: Construction Financing, Permanent Financing, Equity)
2. **Search By Bank**
3. **Search By Equity**

**Key Principle:** All data is deal-centric (tied to `ProjectId`). Use the API to fetch and manipulate data.

---

## 📊 TAB 1: BY PROPERTY

### Structure
- **Main Tab:** By Property
- **Three Sub-Views:** Construction Financing | Permanent Financing | Equity
- **Data Source:** All from database via API
- **CRUD Access:** Full (Create, Read, Update, Delete)

---

### SUB-VIEW 1: Construction Financing

#### Data Points to Display (Deal-by-Deal):

| Display Field | Database Field | Table | API Endpoint | CRUD |
|--------------|---------------|-------|--------------|------|
| Property Name | `ProjectName` | `core.Project` | `/api/core/projects/:id` | ✅ Full |
| Construction Financing Lender | `BankName` | `core.Bank` (via `LenderId`) | `/api/core/banks/:id` | ✅ Full |
| Construction Loan Closing | `LoanClosingDate` | `banking.Loan` | `/api/banking/loans/:id` | ✅ Full |
| Construction Loan Amount | `LoanAmount` | `banking.Loan` | `/api/banking/loans/:id` | ✅ Full |
| Construction Loan LTC (Original) | **CALCULATED** | `LoanAmount / ProjectCost` | N/A | ❌ Calculated |
| Construction (I/O) Term | **CALCULATED** | `IOMaturityDate - LoanClosingDate` (in months) | N/A | ❌ Calculated |
| Construction (I/O) Maturity | `IOMaturityDate` (or `MaturityDate` if IOMaturityDate is null) | `banking.Loan` | `/api/banking/loans/:id` | ✅ Full |
| Index | `IndexName` | `banking.Loan` | `/api/banking/loans/:id` | ✅ Full |
| Spread | `Spread` | `banking.Loan` | `/api/banking/loans/:id` | ✅ Full |

#### API Query for Construction Financing:

```javascript
// Get all construction loans by project
async function getConstructionFinancingByProject(projectId) {
  const loans = await getLoansByProject(projectId);
  
  // Filter for construction loans
  const constructionLoans = loans.data.filter(loan => 
    loan.LoanPhase === 'Construction' || 
    loan.LoanPhase === 'Land' ||
    loan.LoanType?.toLowerCase().includes('construction')
  );
  
  // Helper function to calculate term in months
  function calculateTerm(startDate, endDate) {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    return months > 0 ? `${months} months` : null;
  }
  
  // Enrich with project and bank data
  const project = await getProjectById(projectId);
  const enrichedLoans = await Promise.all(constructionLoans.map(async (loan) => {
    const bank = loan.LenderId ? await getBankById(loan.LenderId) : null;
    
    return {
      ProjectId: projectId,
      PropertyName: project.data.ProjectName,
      ConstructionFinancingLender: bank?.data?.BankName || 'N/A',
      ConstructionLoanClosing: loan.LoanClosingDate,
      ConstructionLoanAmount: loan.LoanAmount,
      ConstructionLoanLTCOriginal: null, // Calculate: LoanAmount / ProjectCost (from other source)
      ConstructionIOTerm: calculateTerm(loan.LoanClosingDate, loan.IOMaturityDate || loan.MaturityDate), // Calculate in months
      ConstructionIOMaturity: loan.IOMaturityDate || loan.MaturityDate,
      Index: loan.IndexName || 'N/A',
      Spread: loan.Spread || 'N/A',
      LoanId: loan.LoanId // For editing
    };
  }));
  
  return enrichedLoans;
}
```

#### SQL Query (Alternative):

```sql
SELECT 
    p.ProjectId,
    p.ProjectName AS PropertyName,
    b.BankName AS ConstructionFinancingLender,
    l.LoanClosingDate AS ConstructionLoanClosing,
    l.LoanAmount AS ConstructionLoanAmount,
    -- LTC Calculation: LoanAmount / ProjectCost (ProjectCost from other source)
    -- Term Calculation: Months between LoanClosingDate and IOMaturityDate (or MaturityDate)
    DATEDIFF(MONTH, l.LoanClosingDate, COALESCE(l.IOMaturityDate, l.MaturityDate)) AS ConstructionIOTerm,
    COALESCE(l.IOMaturityDate, l.MaturityDate) AS ConstructionIOMaturity,
    l.IndexName AS Index,
    l.Spread,
    l.LoanId
FROM core.Project p
INNER JOIN banking.Loan l ON l.ProjectId = p.ProjectId
LEFT JOIN core.Bank b ON b.BankId = l.LenderId
WHERE l.LoanPhase IN ('Construction', 'Land')
   OR l.LoanType LIKE '%Construction%'
ORDER BY p.ProjectName, l.LoanClosingDate DESC
```

#### Notes:
- **LTC (Loan-to-Cost):** Requires `ProjectCost` which may not be in database. Use external source or calculate from other data.
- **Filter:** Only show loans where `LoanPhase = 'Construction'` or `LoanType` contains "Construction"

---

### SUB-VIEW 2: Permanent Financing

#### Data Points to Display (Deal-by-Deal):

| Display Field | Database Field | Table | API Endpoint | CRUD |
|--------------|---------------|-------|--------------|------|
| Property Name | `ProjectName` | `core.Project` | `/api/core/projects/:id` | ✅ Full |
| Permanent Financing Lender | `BankName` | `core.Bank` (via `LenderId`) | `/api/core/banks/:id` | ✅ Full |
| Permanent Financing Close Date | `PermanentCloseDate` | `banking.Loan` | `/api/banking/loans/:id` | ✅ Full |
| Permanent Financing Loan Amount | `PermanentLoanAmount` | `banking.Loan` | `/api/banking/loans/:id` | ✅ Full |
| Permanent Financing LTV | **CALCULATED** | `PermanentLoanAmount / PropertyValue` | N/A | ❌ Calculated |
| Term | `PermPhaseMaturity` - `PermanentCloseDate` | `banking.Loan` | `/api/banking/loans/:id` | ✅ Full |
| Maturity Date | `PermPhaseMaturity` | `banking.Loan` | `/api/banking/loans/:id` | ✅ Full |
| Permanent Interest Rate | `PermPhaseInterestRate` | `banking.Loan` | `/api/banking/loans/:id` | ✅ Full |

#### API Query for Permanent Financing:

```javascript
async function getPermanentFinancingByProject(projectId) {
  const loans = await getLoansByProject(projectId);
  
  // Filter for permanent loans
  const permanentLoans = loans.data.filter(loan => 
    loan.LoanPhase === 'Permanent' ||
    loan.PermanentLoanAmount != null ||
    loan.PermanentCloseDate != null
  );
  
  const project = await getProjectById(projectId);
  const enrichedLoans = await Promise.all(permanentLoans.map(async (loan) => {
    const bank = loan.LenderId ? await getBankById(loan.LenderId) : null;
    
    // Calculate term (years) from dates
    const term = loan.PermPhaseMaturity && loan.PermanentCloseDate
      ? Math.round((new Date(loan.PermPhaseMaturity) - new Date(loan.PermanentCloseDate)) / (365.25 * 24 * 60 * 60 * 1000))
      : null;
    
    return {
      ProjectId: projectId,
      PropertyName: project.data.ProjectName,
      PermanentFinancingLender: bank?.data?.BankName || 'N/A',
      PermanentFinancingCloseDate: loan.PermanentCloseDate,
      PermanentFinancingLoanAmount: loan.PermanentLoanAmount,
      PermanentFinancingLTV: null, // Calculate: PermanentLoanAmount / PropertyValue (from other source)
      Term: term,
      MaturityDate: loan.PermPhaseMaturity,
      PermanentInterestRate: loan.PermPhaseInterestRate || loan.InterestRate || 'N/A',
      LoanId: loan.LoanId
    };
  }));
  
  return enrichedLoans;
}
```

#### SQL Query (Alternative):

```sql
SELECT 
    p.ProjectId,
    p.ProjectName AS PropertyName,
    b.BankName AS PermanentFinancingLender,
    l.PermanentCloseDate AS PermanentFinancingCloseDate,
    l.PermanentLoanAmount AS PermanentFinancingLoanAmount,
    -- LTV Calculation: PermanentLoanAmount / PropertyValue (from other source)
    DATEDIFF(YEAR, l.PermanentCloseDate, l.PermPhaseMaturity) AS Term,
    l.PermPhaseMaturity AS MaturityDate,
    l.PermPhaseInterestRate AS PermanentInterestRate,
    l.LoanId
FROM core.Project p
INNER JOIN banking.Loan l ON l.ProjectId = p.ProjectId
LEFT JOIN core.Bank b ON b.BankId = l.LenderId
WHERE l.LoanPhase = 'Permanent'
   OR l.PermanentLoanAmount IS NOT NULL
   OR l.PermanentCloseDate IS NOT NULL
ORDER BY p.ProjectName, l.PermanentCloseDate DESC
```

#### Notes:
- **LTV (Loan-to-Value):** Requires `PropertyValue` which may not be in database. Use external source.
- **Filter:** Show loans where `LoanPhase = 'Permanent'` OR `PermanentLoanAmount` is not null

---

### SUB-VIEW 3: Equity

#### Data Points to Display (Deal-by-Deal):

| Display Field | Database Field | Table | API Endpoint | CRUD |
|--------------|---------------|-------|--------------|------|
| Property Name | `ProjectName` | `core.Project` | `/api/core/projects/:id` | ✅ Full |
| Lead Pref Group | **NOT IN DB** | Use external source | N/A | ❌ External |
| Funding Date | `FundingDate` | `banking.EquityCommitment` | `/api/banking/equity-commitments/:id` | ✅ Full |
| Pref Amount | **NOT IN DB** | Use external source | N/A | ❌ External |
| Common Equity Requirement | **NOT IN DB** | Use external source | N/A | ❌ External |
| Interest Rate | **NOT IN DB** | Use external source | N/A | ❌ External |
| Annual/Monthly | **NOT IN DB** | Use external source | N/A | ❌ External |
| Back-end Kicker | **NOT IN DB** | Use external source | N/A | ❌ External |
| Pref Last Dollar | **CALCULATED** | See calculation below | N/A | ❌ Calculated |
| Common Equity Last Dollar | **CALCULATED** | See calculation below | N/A | ❌ Calculated |

#### Available Database Fields:

| Database Field | Table | API Endpoint | CRUD |
|--------------|-------|--------------|------|
| Investor Name | `PartnerName` | `core.EquityPartner` | ✅ Full |
| Amount | `Amount` | `banking.EquityCommitment` | ✅ Full |
| Funding Date | `FundingDate` | `banking.EquityCommitment` | ✅ Full |
| Equity Type | `EquityType` | `banking.EquityCommitment` | ✅ Full |

#### API Query for Equity:

```javascript
async function getEquityByProject(projectId) {
  const commitments = await getEquityCommitmentsByProject(projectId);
  const project = await getProjectById(projectId);
  
  // Group by investor and aggregate
  const investorGroups = {};
  
  commitments.data.forEach(commitment => {
    const investorId = commitment.EquityPartnerId;
    if (!investorGroups[investorId]) {
      investorGroups[investorId] = {
        investorId,
        commitments: [],
        totalAmount: 0,
        firstFundingDate: null,
        lastFundingDate: null
      };
    }
    
    investorGroups[investorId].commitments.push(commitment);
    investorGroups[investorId].totalAmount += commitment.Amount || 0;
    
    const fundingDate = commitment.FundingDate ? new Date(commitment.FundingDate) : null;
    if (fundingDate) {
      if (!investorGroups[investorId].firstFundingDate || fundingDate < investorGroups[investorId].firstFundingDate) {
        investorGroups[investorId].firstFundingDate = fundingDate;
      }
      if (!investorGroups[investorId].lastFundingDate || fundingDate > investorGroups[investorId].lastFundingDate) {
        investorGroups[investorId].lastFundingDate = fundingDate;
      }
    }
  });
  
  // Enrich with investor names
  const enriched = await Promise.all(Object.values(investorGroups).map(async (group) => {
    const investor = await getEquityPartnerById(group.investorId);
    
    return {
      ProjectId: projectId,
      PropertyName: project.data.ProjectName,
      InvestorName: investor.data.PartnerName,
      LeadPrefGroup: null, // FROM EXTERNAL SOURCE
      FundingDate: group.firstFundingDate?.toISOString().split('T')[0] || null,
      PrefAmount: null, // FROM EXTERNAL SOURCE
      CommonEquityRequirement: null, // FROM EXTERNAL SOURCE
      InterestRate: null, // FROM EXTERNAL SOURCE
      AnnualMonthly: null, // FROM EXTERNAL SOURCE
      BackendKicker: null, // FROM EXTERNAL SOURCE
      PrefLastDollar: null, // CALCULATE: Sum of Pref Amounts / Total Project Cost
      CommonEquityLastDollar: null, // CALCULATE: Common Equity / Total Project Cost
      TotalAmount: group.totalAmount,
      CommitmentCount: group.commitments.length,
      Commitments: group.commitments // For drill-down
    };
  }));
  
  return enriched;
}
```

#### SQL Query (Alternative):

```sql
SELECT 
    p.ProjectId,
    p.ProjectName AS PropertyName,
    ep.PartnerName AS InvestorName,
    MIN(ec.FundingDate) AS FundingDate,
    SUM(ec.Amount) AS TotalAmount,
    COUNT(ec.EquityCommitmentId) AS CommitmentCount,
    -- These fields need to come from external source:
    -- LeadPrefGroup, PrefAmount, CommonEquityRequirement, InterestRate, 
    -- AnnualMonthly, BackendKicker
    -- Calculations:
    -- PrefLastDollar = PrefAmount / ProjectCost (from external)
    -- CommonEquityLastDollar = CommonEquityRequirement / ProjectCost (from external)
    ep.EquityPartnerId
FROM core.Project p
INNER JOIN banking.EquityCommitment ec ON ec.ProjectId = p.ProjectId
INNER JOIN core.EquityPartner ep ON ep.EquityPartnerId = ec.EquityPartnerId
GROUP BY p.ProjectId, p.ProjectName, ep.EquityPartnerId, ep.PartnerName
ORDER BY p.ProjectName, TotalAmount DESC
```

#### Notes:
- **Most equity fields are NOT in database:** Lead Pref Group, Pref Amount, Common Equity Requirement, Interest Rate, Annual/Monthly, Back-end Kicker must come from external source
- **Last Dollar calculations:** Require ProjectCost from external source
- **Show:** Aggregated by investor per project, with drill-down to individual commitments

---

### SUB-VIEW 4: Contingent Liabilities

#### Data Points to Display (Deal-by-Deal):

| Display Field | Database Field | Table | API Endpoint | CRUD |
|--------------|---------------|-------|--------------|------|
| Property Name | `ProjectName` | `core.Project` | `/api/core/projects/:id` | ✅ Full |
| Construction Loan Closing | `LoanClosingDate` | `banking.Loan` (Construction) | `/api/banking/loans/:id` | ✅ Full |
| Construction Loan Amount | `LoanAmount` | `banking.Loan` (Construction) | `/api/banking/loans/:id` | ✅ Full |
| Construction Financing Lender | `BankName` | `core.Bank` (via `LenderId`) | `/api/core/banks/:id` | ✅ Full |
| Stoa Holdings, LLC Guaranty % | `GuaranteePercent` | `banking.Guarantee` (PersonId = Stoa Holdings) | `/api/banking/guarantees/:id` | ✅ Full |
| Stoa Holdings, LLC Guaranty $ | `GuaranteeAmount` | `banking.Guarantee` (PersonId = Stoa Holdings) | `/api/banking/guarantees/:id` | ✅ Full |
| Toby Easterly Guaranty % | `GuaranteePercent` | `banking.Guarantee` (PersonId = Toby Easterly) | `/api/banking/guarantees/:id` | ✅ Full |
| Toby Easterly Guaranty $ | `GuaranteeAmount` | `banking.Guarantee` (PersonId = Toby Easterly) | `/api/banking/guarantees/:id` | ✅ Full |
| Ryan Nash Guaranty % | `GuaranteePercent` | `banking.Guarantee` (PersonId = Ryan Nash) | `/api/banking/guarantees/:id` | ✅ Full |
| Ryan Nash Guaranty $ | `GuaranteeAmount` | `banking.Guarantee` (PersonId = Ryan Nash) | `/api/banking/guarantees/:id` | ✅ Full |
| Saun Sullivan Guaranty % | `GuaranteePercent` | `banking.Guarantee` (PersonId = Saun Sullivan) | `/api/banking/guarantees/:id` | ✅ Full |
| Saun Sullivan Guaranty $ | `GuaranteeAmount` | `banking.Guarantee` (PersonId = Saun Sullivan) | `/api/banking/guarantees/:id` | ✅ Full |
| Covenants | `Notes` | `banking.Covenant` | `/api/banking/covenants/:id` | ✅ Full |

#### API Query for Contingent Liabilities:

```javascript
async function getContingentLiabilitiesByProject(projectId) {
  // Get project info
  const project = await getProjectById(projectId);
  
  // Get construction loan for this project
  const loans = await getLoansByProject(projectId);
  const constructionLoan = loans.data.find(loan => 
    loan.LoanPhase === 'Construction' || 
    loan.LoanPhase === 'Land' ||
    loan.LoanType?.toLowerCase().includes('construction')
  );
  
  // Get bank info if loan exists
  let bank = null;
  if (constructionLoan?.LenderId) {
    bank = await getBankById(constructionLoan.LenderId);
  }
  
  // Get all guarantees for this project
  const guarantees = await getGuaranteesByProject(projectId);
  
  // Get all persons to map PersonId to names
  const allPersons = await getAllPersons();
  const personMap = {};
  allPersons.data.forEach(person => {
    personMap[person.PersonId] = person.FullName;
  });
  
  // Organize guarantees by person
  const guaranteeMap = {
    'Stoa Holdings, LLC': { percent: null, amount: null },
    'Toby Easterly': { percent: null, amount: null },
    'Ryan Nash': { percent: null, amount: null },
    'Saun Sullivan': { percent: null, amount: null }
  };
  
  guarantees.data.forEach(guarantee => {
    const personName = personMap[guarantee.PersonId];
    if (guaranteeMap[personName]) {
      guaranteeMap[personName].percent = guarantee.GuaranteePercent;
      guaranteeMap[personName].amount = guarantee.GuaranteeAmount;
    }
  });
  
  // Get covenants
  const covenants = await getCovenantsByProject(projectId);
  const covenantText = covenants.data
    .map(c => c.Notes)
    .filter(n => n && n.trim() !== '')
    .join('; ');
  
  return {
    ProjectId: projectId,
    PropertyName: project.data.ProjectName,
    ConstructionLoanClosing: constructionLoan?.LoanClosingDate || null,
    ConstructionLoanAmount: constructionLoan?.LoanAmount || null,
    ConstructionFinancingLender: bank?.data?.BankName || 'N/A',
    StoaHoldingsGuarantyPercent: guaranteeMap['Stoa Holdings, LLC'].percent,
    StoaHoldingsGuarantyAmount: guaranteeMap['Stoa Holdings, LLC'].amount,
    TobyEasterlyGuarantyPercent: guaranteeMap['Toby Easterly'].percent,
    TobyEasterlyGuarantyAmount: guaranteeMap['Toby Easterly'].amount,
    RyanNashGuarantyPercent: guaranteeMap['Ryan Nash'].percent,
    RyanNashGuarantyAmount: guaranteeMap['Ryan Nash'].amount,
    SaunSullivanGuarantyPercent: guaranteeMap['Saun Sullivan'].percent,
    SaunSullivanGuarantyAmount: guaranteeMap['Saun Sullivan'].amount,
    Covenants: covenantText || null,
    // Keep references for editing
    LoanId: constructionLoan?.LoanId || null,
    Guarantees: guarantees.data, // Array of all guarantees
    CovenantIds: covenants.data.map(c => c.CovenantId) // Array of covenant IDs
  };
}
```

#### SQL Query (Alternative):

```sql
SELECT 
    p.ProjectId,
    p.ProjectName AS PropertyName,
    l.LoanClosingDate AS ConstructionLoanClosing,
    l.LoanAmount AS ConstructionLoanAmount,
    b.BankName AS ConstructionFinancingLender,
    -- Stoa Holdings guarantees
    MAX(CASE WHEN pe.FullName = 'Stoa Holdings, LLC' THEN g.GuaranteePercent END) AS StoaHoldingsGuarantyPercent,
    MAX(CASE WHEN pe.FullName = 'Stoa Holdings, LLC' THEN g.GuaranteeAmount END) AS StoaHoldingsGuarantyAmount,
    -- Toby Easterly guarantees
    MAX(CASE WHEN pe.FullName = 'Toby Easterly' THEN g.GuaranteePercent END) AS TobyEasterlyGuarantyPercent,
    MAX(CASE WHEN pe.FullName = 'Toby Easterly' THEN g.GuaranteeAmount END) AS TobyEasterlyGuarantyAmount,
    -- Ryan Nash guarantees
    MAX(CASE WHEN pe.FullName = 'Ryan Nash' THEN g.GuaranteePercent END) AS RyanNashGuarantyPercent,
    MAX(CASE WHEN pe.FullName = 'Ryan Nash' THEN g.GuaranteeAmount END) AS RyanNashGuarantyAmount,
    -- Saun Sullivan guarantees
    MAX(CASE WHEN pe.FullName = 'Saun Sullivan' THEN g.GuaranteePercent END) AS SaunSullivanGuarantyPercent,
    MAX(CASE WHEN pe.FullName = 'Saun Sullivan' THEN g.GuaranteeAmount END) AS SaunSullivanGuarantyAmount,
    -- Covenants (concatenated)
    STRING_AGG(c.Notes, '; ') AS Covenants
FROM core.Project p
LEFT JOIN banking.Loan l ON l.ProjectId = p.ProjectId 
    AND (l.LoanPhase IN ('Construction', 'Land') OR l.LoanType LIKE '%Construction%')
LEFT JOIN core.Bank b ON b.BankId = l.LenderId
LEFT JOIN banking.Guarantee g ON g.ProjectId = p.ProjectId
LEFT JOIN core.Person pe ON pe.PersonId = g.PersonId
LEFT JOIN banking.Covenant c ON c.ProjectId = p.ProjectId
GROUP BY p.ProjectId, p.ProjectName, l.LoanClosingDate, l.LoanAmount, b.BankName
ORDER BY p.ProjectName
```

#### Notes:
- **Guarantees:** Each person (Stoa Holdings, Toby, Ryan, Saun) can have one guarantee per project
- **Construction Loan:** Uses the construction loan for the project (LoanPhase = 'Construction' or 'Land')
- **Covenants:** Multiple covenants can exist per project; concatenate Notes field
- **CRUD Access:** All fields have full CRUD support via API endpoints
- **Person Names:** Must match exactly: "Stoa Holdings, LLC", "Toby Easterly", "Ryan Nash", "Saun Sullivan"

#### Example: Creating/Updating a Guarantee

```javascript
// Create or update Toby Easterly's guarantee for a project
async function updateTobyGuarantee(projectId, percent, amount) {
  // First, get Toby's PersonId
  const allPersons = await getAllPersons();
  const toby = allPersons.data.find(p => p.FullName === 'Toby Easterly');
  
  if (!toby) {
    throw new Error('Toby Easterly not found in Person table');
  }
  
  // Check if guarantee already exists
  const guarantees = await getGuaranteesByProject(projectId);
  const existingGuarantee = guarantees.data.find(g => g.PersonId === toby.PersonId);
  
  if (existingGuarantee) {
    // Update existing guarantee
    return await updateGuarantee(existingGuarantee.GuaranteeId, {
      GuaranteePercent: percent,
      GuaranteeAmount: amount
    });
  } else {
    // Create new guarantee
    return await createGuaranteeByProject(projectId, {
      PersonId: toby.PersonId,
      GuaranteePercent: percent,
      GuaranteeAmount: amount
    });
  }
}
```

---

## 📊 TAB 2: SEARCH BY BANK

#### Data Points to Display:

| Display Field | Database Field | Table | API Endpoint | CRUD |
|--------------|---------------|-------|--------------|------|
| Deal Names | `ProjectName` | `core.Project` (via loans/participations) | `/api/core/projects/:id` | ✅ Full |
| Number of deals | COUNT(DISTINCT ProjectId) | `banking.Loan` or `banking.Participation` | Calculated | ❌ Calculated |
| Exposure | `ExposureAmount` (sum) | `banking.Participation` | `/api/banking/participations/:id` | ✅ Full |
| Positioning (lead? Participant?) | **CALCULATED** | See logic below | N/A | ❌ Calculated |
| Estimated Hold Limit | `HoldLimit` | `core.Bank` | `/api/core/banks/:id` | ✅ Full |
| Estimated Capacity | **CALCULATED** | `HoldLimit - CurrentExposure` | N/A | ❌ Calculated |
| Debt Yield | **NOT IN DB** | Use external source | N/A | ❌ External |
| Last Dollar | **CALCULATED** | See calculation below | N/A | ❌ Calculated |
| LTC | **CALCULATED** | See calculation below | N/A | ❌ Calculated |

#### API Query for Search By Bank:

```javascript
async function getBankSummary(bankId) {
  // Get bank info
  const bank = await getBankById(bankId);
  
  // Get all participations for this bank
  const allParticipations = await getAllParticipations();
  const bankParticipations = allParticipations.data.filter(p => p.BankId === bankId);
  
  // Get all loans where bank is lender
  const allLoans = await getAllLoans();
  const bankLoans = allLoans.data.filter(l => l.LenderId === bankId);
  
  // Combine and group by project
  const projectMap = {};
  
  // Process participations
  bankParticipations.forEach(part => {
    if (!projectMap[part.ProjectId]) {
      projectMap[part.ProjectId] = {
        projectId: part.ProjectId,
        participations: [],
        loans: [],
        totalExposure: 0,
        isLead: false
      };
    }
    projectMap[part.ProjectId].participations.push(part);
    projectMap[part.ProjectId].totalExposure += part.ExposureAmount || 0;
  });
  
  // Process loans (if bank is lender, they're likely the lead)
  bankLoans.forEach(loan => {
    if (!projectMap[loan.ProjectId]) {
      projectMap[loan.ProjectId] = {
        projectId: loan.ProjectId,
        participations: [],
        loans: [],
        totalExposure: 0,
        isLead: false
      };
    }
    projectMap[loan.ProjectId].loans.push(loan);
    projectMap[loan.ProjectId].isLead = true; // Bank is lender = lead
  });
  
  // Enrich with project names and calculate metrics
  const enriched = await Promise.all(Object.values(projectMap).map(async (proj) => {
    const project = await getProjectById(proj.projectId);
    
    // Determine positioning
    let positioning = 'Participant';
    if (proj.isLead) {
      positioning = 'Lead';
    } else if (proj.participations.length > 0) {
      // Check if this bank has the highest participation %
      const allPartsForProject = await getParticipationsByProject(proj.projectId);
      const maxParticipation = Math.max(...allPartsForProject.data.map(p => 
        parseFloat(p.ParticipationPercent?.replace('%', '') || 0)
      ));
      const thisBankParticipation = Math.max(...proj.participations.map(p => 
        parseFloat(p.ParticipationPercent?.replace('%', '') || 0)
      ));
      if (thisBankParticipation === maxParticipation && thisBankParticipation > 0) {
        positioning = 'Lead Participant';
      }
    }
    
    // Calculate Last Dollar (requires ProjectCost from external)
    const lastDollar = null; // ProjectCost - TotalLoanAmount (from external)
    
    // Calculate LTC (requires ProjectCost from external)
    const ltc = null; // TotalLoanAmount / ProjectCost (from external)
    
    return {
      BankId: bankId,
      BankName: bank.data.BankName,
      DealName: project.data.ProjectName,
      ProjectId: proj.projectId,
      NumberOfDeals: 1, // Will be aggregated
      Exposure: proj.totalExposure,
      Positioning: positioning,
      EstimatedHoldLimit: bank.data.HoldLimit || null,
      EstimatedCapacity: bank.data.HoldLimit ? bank.data.HoldLimit - proj.totalExposure : null,
      DebtYield: null, // FROM EXTERNAL SOURCE
      LastDollar: lastDollar, // CALCULATED (requires external data)
      LTC: ltc // CALCULATED (requires external data)
    };
  }));
  
  // Aggregate by bank
  const totalExposure = enriched.reduce((sum, item) => sum + (item.Exposure || 0), 0);
  const dealNames = enriched.map(item => item.DealName).join(', ');
  
  return {
    BankId: bankId,
    BankName: bank.data.BankName,
    DealNames: dealNames,
    NumberOfDeals: enriched.length,
    TotalExposure: totalExposure,
    EstimatedHoldLimit: bank.data.HoldLimit || null,
    EstimatedCapacity: bank.data.HoldLimit ? bank.data.HoldLimit - totalExposure : null,
    Deals: enriched // For drill-down
  };
}
```

#### SQL Query (Alternative):

```sql
-- Bank Summary Query
SELECT 
    b.BankId,
    b.BankName,
    STRING_AGG(p.ProjectName, ', ') AS DealNames,
    COUNT(DISTINCT p.ProjectId) AS NumberOfDeals,
    SUM(part.ExposureAmount) AS Exposure,
    b.HoldLimit AS EstimatedHoldLimit,
    b.HoldLimit - SUM(part.ExposureAmount) AS EstimatedCapacity,
    -- Positioning: If bank is lender, they're lead; otherwise check participation %
    CASE 
        WHEN EXISTS (SELECT 1 FROM banking.Loan l WHERE l.LenderId = b.BankId AND l.ProjectId = p.ProjectId)
        THEN 'Lead'
        WHEN MAX(CAST(REPLACE(part.ParticipationPercent, '%', '') AS FLOAT)) = 
             (SELECT MAX(CAST(REPLACE(p2.ParticipationPercent, '%', '') AS FLOAT))
              FROM banking.Participation p2 WHERE p2.ProjectId = p.ProjectId)
        THEN 'Lead Participant'
        ELSE 'Participant'
    END AS Positioning,
    -- Last Dollar and LTC require ProjectCost from external source
    NULL AS DebtYield, -- FROM EXTERNAL SOURCE
    NULL AS LastDollar, -- CALCULATED
    NULL AS LTC -- CALCULATED
FROM core.Bank b
INNER JOIN banking.Participation part ON part.BankId = b.BankId
INNER JOIN core.Project p ON p.ProjectId = part.ProjectId
GROUP BY b.BankId, b.BankName, b.HoldLimit
ORDER BY Exposure DESC
```

#### Notes:
- **Positioning Logic:** 
  - If bank is `LenderId` on a loan → "Lead"
  - If bank has highest participation % → "Lead Participant"
  - Otherwise → "Participant"
- **Last Dollar & LTC:** Require ProjectCost from external source
- **Debt Yield:** Must come from external source

---

## 📊 TAB 3: SEARCH BY EQUITY

#### Data Points to Display:

| Display Field | Database Field | Table | API Endpoint | CRUD |
|--------------|---------------|-------|--------------|------|
| Deal Names | `ProjectName` | `core.Project` (via commitments) | `/api/core/projects/:id` | ✅ Full |
| Number of deals | COUNT(DISTINCT ProjectId) | `banking.EquityCommitment` | Calculated | ❌ Calculated |
| Exposure | `Amount` (sum) | `banking.EquityCommitment` | `/api/banking/equity-commitments/:id` | ✅ Full |
| Last Dollar | **CALCULATED** | See calculation below | N/A | ❌ Calculated |
| LTC | **CALCULATED** | See calculation below | N/A | ❌ Calculated |

#### API Query for Search By Equity:

```javascript
async function getEquityInvestorSummary(equityPartnerId) {
  // Get investor info
  const investor = await getEquityPartnerById(equityPartnerId);
  
  // Get all commitments for this investor
  const allCommitments = await getAllEquityCommitments();
  const investorCommitments = allCommitments.data.filter(c => c.EquityPartnerId === equityPartnerId);
  
  // Group by project
  const projectMap = {};
  
  investorCommitments.forEach(commitment => {
    if (!projectMap[commitment.ProjectId]) {
      projectMap[commitment.ProjectId] = {
        projectId: commitment.ProjectId,
        commitments: [],
        totalAmount: 0
      };
    }
    projectMap[commitment.ProjectId].commitments.push(commitment);
    projectMap[commitment.ProjectId].totalAmount += commitment.Amount || 0;
  });
  
  // Enrich with project names
  const enriched = await Promise.all(Object.values(projectMap).map(async (proj) => {
    const project = await getProjectById(proj.projectId);
    
    // Calculate Last Dollar (requires ProjectCost from external)
    const lastDollar = null; // ProjectCost - TotalEquityInvested (from external)
    
    // Calculate LTC (requires ProjectCost from external)
    const ltc = null; // TotalEquityInvested / ProjectCost (from external)
    
    return {
      EquityPartnerId: equityPartnerId,
      InvestorName: investor.data.PartnerName,
      DealName: project.data.ProjectName,
      ProjectId: proj.projectId,
      Exposure: proj.totalAmount,
      CommitmentCount: proj.commitments.length,
      LastDollar: lastDollar, // CALCULATED (requires external data)
      LTC: ltc, // CALCULATED (requires external data)
      Commitments: proj.commitments // For drill-down
    };
  }));
  
  // Aggregate summary
  const totalExposure = enriched.reduce((sum, item) => sum + (item.Exposure || 0), 0);
  const dealNames = enriched.map(item => item.DealName).join(', ');
  
  return {
    EquityPartnerId: equityPartnerId,
    InvestorName: investor.data.PartnerName,
    DealNames: dealNames,
    NumberOfDeals: enriched.length,
    TotalExposure: totalExposure,
    Deals: enriched // For drill-down
  };
}
```

#### SQL Query (Alternative):

```sql
SELECT 
    ep.EquityPartnerId,
    ep.PartnerName AS InvestorName,
    STRING_AGG(p.ProjectName, ', ') AS DealNames,
    COUNT(DISTINCT p.ProjectId) AS NumberOfDeals,
    SUM(ec.Amount) AS Exposure,
    -- Last Dollar and LTC require ProjectCost from external source
    NULL AS LastDollar, -- CALCULATED: ProjectCost - TotalEquityInvested
    NULL AS LTC -- CALCULATED: TotalEquityInvested / ProjectCost
FROM core.EquityPartner ep
INNER JOIN banking.EquityCommitment ec ON ec.EquityPartnerId = ep.EquityPartnerId
INNER JOIN core.Project p ON p.ProjectId = ec.ProjectId
GROUP BY ep.EquityPartnerId, ep.PartnerName
ORDER BY Exposure DESC
```

#### Notes:
- **Last Dollar & LTC:** Require ProjectCost from external source
- **Show:** Aggregated by investor, with drill-down to individual deals

---

## 🔗 How Everything Ties Together

### Data Flow Architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    CORE.Project                         │
│                  (ProjectId = Deal)                      │
└────────────┬────────────────────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
┌──────────┐    ┌──────────────┐
│ Banking  │    │   Equity     │
│  Data    │    │    Data      │
└──────────┘    └──────────────┘
    │                 │
    ├─ Loan              ├─ EquityCommitment
    ├─ Participation     │
    ├─ DSCRTest          │
    ├─ Covenant          │
    ├─ Guarantee         │
    └─ LiquidityRequirement │
```

### Key Relationships:

1. **All banking data links to ProjectId:**
   - `banking.Loan.ProjectId` → `core.Project.ProjectId`
   - `banking.Participation.ProjectId` → `core.Project.ProjectId`
   - `banking.EquityCommitment.ProjectId` → `core.Project.ProjectId`
   - `banking.Guarantee.ProjectId` → `core.Project.ProjectId`
   - `banking.Covenant.ProjectId` → `core.Project.ProjectId`

2. **Banking data links to Bank:**
   - `banking.Loan.LenderId` → `core.Bank.BankId`
   - `banking.Participation.BankId` → `core.Bank.BankId`

3. **Equity data links to EquityPartner:**
   - `banking.EquityCommitment.EquityPartnerId` → `core.EquityPartner.EquityPartnerId`

4. **Guarantee data links to Person:**
   - `banking.Guarantee.PersonId` → `core.Person.PersonId`

### API Usage Pattern:

```javascript
// 1. Start with Project (Deal)
const project = await getProjectById(projectId);

// 2. Get related banking data
const loans = await getLoansByProject(projectId);
const participations = await getParticipationsByProject(projectId);

// 3. Get related equity data
const commitments = await getEquityCommitmentsByProject(projectId);

// 4. Get contingent liabilities
const guarantees = await getGuaranteesByProject(projectId);
const covenants = await getCovenantsByProject(projectId);

// 5. Enrich with reference data
const bank = await getBankById(loan.LenderId);
const investor = await getEquityPartnerById(commitment.EquityPartnerId);
const persons = await getAllPersons(); // For guarantee person names
```

---

## ✅ CRUD Operations Available

### Full CRUD (Create, Read, Update, Delete):

#### Projects:
- ✅ `getAllProjects()`, `getProjectById()`, `createProject()`, `updateProject()`, `deleteProject()`

#### Banks:
- ✅ `getAllBanks()`, `getBankById()`, `createBank()`, `updateBank()`, `deleteBank()`

#### Loans:
- ✅ `getAllLoans()`, `getLoanById()`, `getLoansByProject()`, `createLoan()`, `updateLoan()`, `deleteLoan()`

#### Participations:
- ✅ `getAllParticipations()`, `getParticipationById()`, `getParticipationsByProject()`, `createParticipation()`, `updateParticipation()`, `deleteParticipation()`

#### Equity Commitments:
- ✅ `getAllEquityCommitments()`, `getEquityCommitmentById()`, `getEquityCommitmentsByProject()`, `createEquityCommitment()`, `updateEquityCommitment()`, `deleteEquityCommitment()`

#### Equity Partners:
- ✅ `getAllEquityPartners()`, `getEquityPartnerById()`, `createEquityPartner()`, `updateEquityPartner()`, `deleteEquityPartner()`

#### Guarantees (Contingent Liabilities):
- ✅ `getAllGuarantees()`, `getGuaranteeById()`, `getGuaranteesByProject()`, `createGuarantee()`, `createGuaranteeByProject()`, `updateGuarantee()`, `deleteGuarantee()`

#### Covenants:
- ✅ `getAllCovenants()`, `getCovenantById()`, `getCovenantsByProject()`, `createCovenant()`, `createCovenantByProject()`, `updateCovenant()`, `deleteCovenant()`

---

## ❌ Fields NOT in Database (Use External Sources)

### Construction Financing:
- **Project Cost** (for LTC calculation)

### Permanent Financing:
- **Property Value** (for LTV calculation)

### Equity:
- **Lead Pref Group**
- **Pref Amount**
- **Common Equity Requirement**
- **Interest Rate**
- **Annual/Monthly**
- **Back-end Kicker**
- **Project Cost** (for Last Dollar and LTC calculations)

### Search By Bank:
- **Debt Yield**
- **Project Cost** (for Last Dollar and LTC calculations)

### Search By Equity:
- **Project Cost** (for Last Dollar and LTC calculations)

### Contingent Liabilities:
- **All fields are in database** - No external sources needed

**Important:** Do NOT fabricate these values. Pull from external sources or leave as NULL/blank.

---

## 🎨 Dashboard Implementation Steps

### Step 1: Set Up Main Tabs

1. Create three main tabs:
   - "By Property"
   - "Search By Bank"
   - "Search By Equity"

### Step 2: By Property Tab

1. Create four sub-view buttons/tabs:
   - "Construction Financing"
   - "Permanent Financing"
   - "Equity"
   - "Contingent Liabilities"

2. For each sub-view:
   - Create a card/table
   - Use the appropriate API query
   - Enable inline editing for fields with CRUD access
   - Show "N/A" or blank for external fields
   - Add drill-down to detail level

### Step 3: Search By Bank Tab

1. Create a filter/search for banks
2. Display bank summary using `getBankSummary(bankId)`
3. Enable drill-down to see individual deals
4. Show aggregated metrics

### Step 4: Search By Equity Tab

1. Create a filter/search for equity partners
2. Display investor summary using `getEquityInvestorSummary(equityPartnerId)`
3. Enable drill-down to see individual deals
4. Show aggregated metrics

### Step 5: Enable Editing

1. For each field with CRUD access:
   - Make cell editable
   - On save, call appropriate API update function
   - Show success/error feedback
   - Refresh data after update

2. For creating new records:
   - Add "New" button
   - Open form/modal
   - Call create API function
   - Refresh data after create

3. For deleting records:
   - Add delete button/icon
   - Confirm deletion
   - Call delete API function
   - Refresh data after delete

---

## 📝 Example: Editing a Loan

```javascript
// User edits Construction Loan Amount in the dashboard
async function updateConstructionLoanAmount(loanId, newAmount) {
  try {
    // Get current loan data
    const loan = await getLoanById(loanId);
    
    // Update the amount
    const updated = await updateLoan(loanId, {
      ...loan.data,
      LoanAmount: newAmount
    });
    
    // Refresh the view
    await refreshConstructionFinancingView();
    
    return { success: true, data: updated.data };
  } catch (error) {
    console.error('Error updating loan:', error);
    return { success: false, error: error.message };
  }
}
```

---

## 🔍 Data Validation

### Required Fields:
- **Loan:** `ProjectId`, `LoanPhase`
- **Participation:** `ProjectId`, `BankId`
- **Equity Commitment:** `ProjectId`, `EquityPartnerId`, `Amount`

### Validation Rules:
- `LoanAmount` must be > 0
- `ExposureAmount` must be > 0
- `FundingDate` must be valid date
- `ProjectId` must exist in `core.Project`
- `BankId` must exist in `core.Bank`
- `EquityPartnerId` must exist in `core.EquityPartner`

---

## 📊 Summary Table: What's in DB vs External

| Field Category | In Database | External Source | Calculated |
|---------------|-------------|----------------|------------|
| **Project Info** | ✅ ProjectName, City, State, Stage | ❌ Project Cost, Property Value | ❌ |
| **Construction Loan** | ✅ Lender, Amount, Closing Date, Maturity, Index, Spread | ❌ Project Cost | ❌ LTC |
| **Permanent Loan** | ✅ Lender, Amount, Close Date, Maturity, Interest Rate | ❌ Property Value | ❌ LTV, Term |
| **Equity Basic** | ✅ Investor, Amount, Funding Date | ❌ Pref Group, Pref Amount, Common Equity, Interest Rate, Kicker | ❌ Last Dollar, LTC |
| **Contingent Liabilities** | ✅ All Guaranty % and $ (Stoa Holdings, Toby, Ryan, Saun), Covenants, Construction Loan Info | ❌ None | ❌ None |
| **Bank Summary** | ✅ Bank Name, Exposure, Hold Limit | ❌ Debt Yield, Project Cost | ❌ Capacity, Last Dollar, LTC |
| **Equity Summary** | ✅ Investor Name, Exposure | ❌ Project Cost | ❌ Last Dollar, LTC |

---

## 🚀 Quick Start Checklist

- [ ] Set up three main tabs (By Property, Search By Bank, Search By Equity)
- [ ] Create four sub-views for By Property tab (Construction Financing, Permanent Financing, Equity, Contingent Liabilities)
- [ ] Implement API queries for each view
- [ ] Add filters/search functionality
- [ ] Enable CRUD operations for database fields
- [ ] Add external data source integration for missing fields
- [ ] Implement calculations (LTC, LTV, Last Dollar, etc.)
- [ ] Add drill-down functionality
- [ ] Add data validation
- [ ] Add error handling
- [ ] Test all CRUD operations
- [ ] Add loading states and user feedback

---

## 📚 API Reference

All API functions are available in `api-client.js`. Import or copy the functions you need:

```javascript
// Example usage
import { 
  getLoansByProject, 
  updateLoan, 
  getEquityCommitmentsByProject,
  getParticipationsByProject 
} from './api-client.js';
```

---

## ⚠️ Important Notes

1. **Deal-Centric:** Always filter by `ProjectId` first, then drill down
2. **No Fabrication:** Never create fake data for fields not in database
3. **External Sources:** Clearly label fields that come from external sources
4. **Calculations:** Document calculation formulas for derived fields
5. **CRUD Access:** Only enable editing for fields with full CRUD support
6. **Data Refresh:** Always refresh views after create/update/delete operations
