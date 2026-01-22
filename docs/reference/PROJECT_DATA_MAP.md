# Project Data Map - Department Structure

## 🎯 Purpose
This document maps how a single **Project** (with its unique `ProjectId`) connects to all departments and their data. Use this to create Excel files or understand the data hierarchy.

---

## 📊 THE PYRAMID: Project as the Anchor

```
                    ┌─────────────────────┐
                    │   CORE.PROJECT       │
                    │   (ProjectId)        │
                    │   Source of Truth    │
                    └──────────┬──────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
        ┌───────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
        │   BANKING    │ │  PIPELINE   │ │   CORE      │
        │  Department  │ │  Department │ │  Reference  │
        └──────────────┘ └─────────────┘ └─────────────┘
```

---

## 🏗️ LEVEL 1: CORE PROJECT (The Anchor)

**Table:** `core.Project`
**Primary Key:** `ProjectId` (INT, Auto-increment)
**Unique Constraint:** `ProjectName`

### Project Fields:
- `ProjectId` - **THE ANCHOR** (used by all departments)
- `ProjectName` - Unique name (e.g., "The Waters at Hammond")
- `City`, `State`, `Region`, `Location`
- `Units` - Planned/underwritten units
- `ProductType` - Heights, Prototype, Flats, Land, Other
- `Stage` - Prospective, Under Contract, Commercial Land - Listed, Under Construction, Lease-Up, Stabilized, Liquidated, Dead
- `EstimatedConstructionStartDate`
- `CreatedAt`, `UpdatedAt`

**Key Point:** Every other table references `ProjectId` to link to this project.

---

## 🏦 LEVEL 2: BANKING DEPARTMENT

All banking tables use `ProjectId` to link to the project.

### 2.1 Loans (`banking.Loan`)
**Links to Project:** `ProjectId` (FK)
**Links to Bank:** `LenderId` → `core.Bank.BankId`

**What Banking Tracks:**
- Construction loans, permanent financing, mini-perm, land loans
- Loan amounts, closing dates, maturity dates
- Interest rates, spreads, indexes (SOFR, WSJ Prime)
- Construction milestones (completion, lease-up)
- Permanent financing details

**Key Fields:**
- `LoanId` (Primary Key)
- `ProjectId` (Foreign Key to Project)
- `LenderId` (Foreign Key to Bank)
- `LoanType`, `LoanPhase`, `LoanAmount`
- `FixedOrFloating`, `IndexName`, `Spread`
- `LoanClosingDate`, `MaturityDate`
- `ConstructionCompletionDate`, `LeaseUpCompletedDate`

**Relationship:** One Project can have **multiple Loans** (construction, permanent, etc.)

---

### 2.2 DSCR Tests (`banking.DSCRTest`)
**Links to Project:** `ProjectId` (FK)
**Links to Loan:** `LoanId` → `banking.Loan.LoanId` (optional)

**What Banking Tracks:**
- 1st, 2nd, 3rd DSCR test dates and requirements
- Projected interest rates for each test
- Required DSCR ratios (e.g., 1.25x, 1.15x)
- Projected DSCR values

**Key Fields:**
- `DSCRTestId` (Primary Key)
- `ProjectId` (Foreign Key to Project)
- `LoanId` (Foreign Key to Loan, optional)
- `TestNumber` (1, 2, or 3)
- `TestDate`, `ProjectedInterestRate`
- `Requirement`, `ProjectedValue`

**Relationship:** One Project typically has **1-3 DSCR Tests** (unique per TestNumber)

---

### 2.3 Participations (`banking.Participation`)
**Links to Project:** `ProjectId` (FK)
**Links to Loan:** `LoanId` → `banking.Loan.LoanId` (optional)
**Links to Bank:** `BankId` → `core.Bank.BankId`

**What Banking Tracks:**
- Bank participation splits (who owns what % of the loan)
- Participation percentages and exposure amounts
- Whether participation is paid off

**Key Fields:**
- `ParticipationId` (Primary Key)
- `ProjectId` (Foreign Key to Project)
- `LoanId` (Foreign Key to Loan, optional)
- `BankId` (Foreign Key to Bank)
- `ParticipationPercent` (e.g., "32.0%")
- `ExposureAmount`, `PaidOff`

**Relationship:** One Project can have **multiple Participations** (one per participating bank)

---

### 2.4 Guarantees (`banking.Guarantee`)
**Links to Project:** `ProjectId` (FK)
**Links to Loan:** `LoanId` → `banking.Loan.LoanId` (optional)
**Links to Person:** `PersonId` → `core.Person.PersonId`

**What Banking Tracks:**
- Personal guarantees by guarantors (Toby, Ryan, Saun)
- Guarantee percentages and amounts per person
- Contingent liabilities

**Key Fields:**
- `GuaranteeId` (Primary Key)
- `ProjectId` (Foreign Key to Project)
- `LoanId` (Foreign Key to Loan, optional)
- `PersonId` (Foreign Key to Person - 1=Toby, 2=Ryan, 3=Saun)
- `GuaranteePercent`, `GuaranteeAmount`

**Relationship:** One Project can have **multiple Guarantees** (one per guarantor)

---

### 2.5 Covenants (`banking.Covenant`)
**Links to Project:** `ProjectId` (FK)
**Links to Loan:** `LoanId` → `banking.Loan.LoanId` (optional)

**What Banking Tracks:**
- Loan covenants (occupancy requirements, liquidity, etc.)
- Covenant dates, requirements, and projected values
- Special terms (e.g., "Burn down to 50% Guaranty upon reaching 1.25x DSCR")

**Key Fields:**
- `CovenantId` (Primary Key)
- `ProjectId` (Foreign Key to Project)
- `LoanId` (Foreign Key to Loan, optional)
- `CovenantType` (Occupancy, Liquidity, Other)
- `CovenantDate`, `Requirement`, `ProjectedValue`

**Relationship:** One Project can have **multiple Covenants**

---

### 2.6 Liquidity Requirements (`banking.LiquidityRequirement`)
**Links to Project:** `ProjectId` (FK)
**Links to Loan:** `LoanId` → `banking.Loan.LoanId` (optional)

**What Banking Tracks:**
- Total liquidity requirements
- Lending bank's portion of liquidity requirement

**Key Fields:**
- `LiquidityRequirementId` (Primary Key)
- `ProjectId` (Foreign Key to Project) - **UNIQUE** (one per project)
- `LoanId` (Foreign Key to Loan, optional)
- `TotalAmount`, `LendingBankAmount`

**Relationship:** One Project has **exactly 1 Liquidity Requirement** (or none)

---

### 2.7 Equity Commitments (`banking.EquityCommitment`)
**Links to Project:** `ProjectId` (FK)
**Links to Equity Partner:** `EquityPartnerId` → `core.EquityPartner.EquityPartnerId` (optional)

**What Banking Tracks:**
- Equity partner commitments and funding
- Equity types (Pref, Common), interest rates
- Funding dates, amounts, back-end kickers

**Key Fields:**
- `EquityCommitmentId` (Primary Key)
- `ProjectId` (Foreign Key to Project)
- `EquityPartnerId` (Foreign Key to Equity Partner, optional)
- `EquityType`, `Amount`, `FundingDate`
- `InterestRate`, `BackEndKicker`

**Relationship:** One Project can have **multiple Equity Commitments**

---

### 2.8 Bank Targets (`banking.BankTarget`)
**Links to Bank:** `BankId` → `core.Bank.BankId` (NOT directly to Project)

**What Banking Tracks:**
- Relationship notes and capacity information for banks
- Exposure with Stoa, contacts, comments
- Used for tracking potential lenders

**Key Fields:**
- `BankTargetId` (Primary Key)
- `BankId` (Foreign Key to Bank) - **UNIQUE** (one per bank)
- `ExposureWithStoa`, `ContactText`, `Comments`

**Relationship:** This is **bank-level**, not project-level (one record per bank)

---

## 🏢 LEVEL 2: PIPELINE DEPARTMENT

All pipeline tables use `ProjectId` to link to the project.

### 3.1 Under Contract (`pipeline.UnderContract`)
**Links to Project:** `ProjectId` (FK) - **UNIQUE** (one per project)

**What Pipeline Tracks:**
- Properties under contract (pre-construction)
- Location, acreage, units, price
- Execution date, due diligence date, closing date
- Purchasing entity, cash flag, opportunity zone

**Key Fields:**
- `UnderContractId` (Primary Key)
- `ProjectId` (Foreign Key to Project) - **UNIQUE**
- `Location`, `Region`, `Acreage`, `Units`
- `Price`, `PricePerSF`
- `ExecutionDate`, `DueDiligenceDate`, `ClosingDate`
- `PurchasingEntity`, `CashFlag`, `OpportunityZone`

**Relationship:** One Project has **exactly 1 Under Contract record** (or none)

---

### 3.2 Commercial Listed (`pipeline.CommercialListed`)
**Links to Project:** `ProjectId` (FK) - **UNIQUE** (one per project)

**What Pipeline Tracks:**
- Commercial land that is listed for sale
- Listing date, acreage, price, status
- Owner, purchasing entity, broker

**Key Fields:**
- `CommercialListedId` (Primary Key)
- `ProjectId` (Foreign Key to Project) - **UNIQUE**
- `Location`, `ListedDate`, `Acreage`, `Price`
- `Status`, `DueDiligenceDate`, `ClosingDate`
- `Owner`, `PurchasingEntity`, `Broker`

**Relationship:** One Project has **exactly 1 Commercial Listed record** (or none)

---

### 3.3 Commercial Acreage (`pipeline.CommercialAcreage`)
**Links to Project:** `ProjectId` (FK) - **UNIQUE** (one per project)

**What Pipeline Tracks:**
- Commercial acreage details
- Location, acreage, square footage, building footprint

**Key Fields:**
- `CommercialAcreageId` (Primary Key)
- `ProjectId` (Foreign Key to Project) - **UNIQUE**
- `Location`, `Acreage`, `SquareFootage`, `BuildingFootprintSF`

**Relationship:** One Project has **exactly 1 Commercial Acreage record** (or none)

---

### 3.4 Closed Property (`pipeline.ClosedProperty`)
**Links to Project:** `ProjectId` (FK) - **UNIQUE** (one per project)

**What Pipeline Tracks:**
- Closed/liquidated properties
- Closing date, location, address, acreage, units
- Price, price per SF, act of sale

**Key Fields:**
- `ClosedPropertyId` (Primary Key)
- `ProjectId` (Foreign Key to Project) - **UNIQUE**
- `Status`, `ClosingDate`, `Location`, `Address`
- `Acreage`, `Units`, `Price`, `PricePerSF`
- `ActOfSale`, `DueDiligenceDate`, `PurchasingEntity`, `CashFlag`

**Relationship:** One Project has **exactly 1 Closed Property record** (or none)

---

## 📚 LEVEL 2: CORE REFERENCE TABLES

These are **reference/lookup tables** used by Banking and Pipeline departments.

### 4.1 Banks (`core.Bank`)
**NOT linked to Project** - This is a reference table

**What Core Tracks:**
- Master list of all banks/lenders
- Bank name, city, state, notes

**Key Fields:**
- `BankId` (Primary Key)
- `BankName` (Unique)
- `City`, `State`, `Notes`

**Used By:**
- `banking.Loan.LenderId` → references `BankId`
- `banking.Participation.BankId` → references `BankId`
- `banking.BankTarget.BankId` → references `BankId`

---

### 4.2 Persons (`core.Person`)
**NOT linked to Project** - This is a reference table

**What Core Tracks:**
- Master list of people (guarantors, contacts)
- Full name, email, phone

**Key Fields:**
- `PersonId` (Primary Key)
- `FullName`, `Email`, `Phone`

**Used By:**
- `banking.Guarantee.PersonId` → references `PersonId` (1=Toby, 2=Ryan, 3=Saun)

---

### 4.3 Equity Partners (`core.EquityPartner`)
**NOT linked to Project** - This is a reference table

**What Core Tracks:**
- Master list of equity partners/investors
- Partner name, notes

**Key Fields:**
- `EquityPartnerId` (Primary Key)
- `PartnerName` (Unique)
- `Notes`

**Used By:**
- `banking.EquityCommitment.EquityPartnerId` → references `EquityPartnerId`

---

## 📋 EXCEL FILE STRUCTURE GUIDE

Use this structure to create Excel files for ChatGPT or manual data entry:

### Sheet 1: Projects (Master List)
| ProjectId | ProjectName | City | State | Region | Units | ProductType | Stage |
|-----------|-------------|------|-------|--------|-------|-------------|-------|
| 1 | The Waters at Hammond | Hammond | LA | Gulf Coast | 312 | Waters | Stabilized |

### Sheet 2: Banking - Loans
| LoanId | ProjectId | LoanType | LoanPhase | LenderId | LoanAmount | LoanClosingDate | Spread |
|--------|-----------|----------|-----------|----------|------------|-----------------|--------|
| 1 | 1 | LOC - Construction | Construction | 3 | 31520000 | 2020-09-24 | 0.50% |

### Sheet 3: Banking - Participations
| ParticipationId | ProjectId | LoanId | BankId | ParticipationPercent | ExposureAmount | PaidOff |
|----------------|-----------|--------|--------|---------------------|----------------|---------|
| 1 | 1 | 1 | 3 | 44.5% | 14019970 | FALSE |

### Sheet 4: Banking - Guarantees
| GuaranteeId | ProjectId | LoanId | PersonId | GuaranteePercent | GuaranteeAmount |
|------------|-----------|--------|----------|------------------|-----------------|
| 1 | 1 | 1 | 1 | 100 | 45337 |

### Sheet 5: Banking - DSCR Tests
| DSCRTestId | ProjectId | LoanId | TestNumber | TestDate | Requirement | ProjectedValue |
|------------|-----------|--------|------------|----------|-------------|----------------|
| 1 | 1 | 1 | 1 | 2024-09-24 | 1.00 | N/A |

### Sheet 6: Banking - Covenants
| CovenantId | ProjectId | LoanId | CovenantType | CovenantDate | Requirement | ProjectedValue |
|-----------|-----------|--------|--------------|--------------|-------------|----------------|
| 1 | 1 | 1 | Occupancy | 2024-03-31 | 50% | 76.5% |

### Sheet 7: Banking - Liquidity Requirements
| LiquidityRequirementId | ProjectId | LoanId | TotalAmount | LendingBankAmount |
|------------------------|-----------|--------|-------------|-------------------|
| 1 | 1 | 1 | 5000000 | 1000000 |

### Sheet 8: Banking - Equity Commitments
| EquityCommitmentId | ProjectId | EquityPartnerId | EquityType | Amount | FundingDate |
|-------------------|-----------|-----------------|------------|--------|-------------|
| 1 | 1 | 1 | Pref | 5000000 | 2020-09-24 |

### Sheet 9: Pipeline - Under Contract
| UnderContractId | ProjectId | Location | Acreage | Units | Price | ExecutionDate |
|-----------------|-----------|----------|---------|-------|-------|---------------|
| 1 | 1 | Hammond, LA | 15.5 | 312 | 50000000 | 2019-01-15 |

### Sheet 10: Pipeline - Commercial Listed
| CommercialListedId | ProjectId | Location | ListedDate | Acreage | Price | Status |
|-------------------|-----------|----------|------------|---------|-------|--------|
| 1 | 1 | Hammond, LA | 2018-12-01 | 15.5 | 50000000 | Listed |

### Sheet 11: Pipeline - Commercial Acreage
| CommercialAcreageId | ProjectId | Location | Acreage | SquareFootage |
|-------------------|-----------|----------|---------|---------------|
| 1 | 1 | Hammond, LA | 15.5 | 675180 |

### Sheet 12: Pipeline - Closed Property
| ClosedPropertyId | ProjectId | Status | ClosingDate | Location | Units | Price |
|-----------------|-----------|--------|-------------|----------|-------|-------|
| 1 | 1 | Multifamily | 2019-01-15 | Hammond, LA | 312 | 50000000 |

### Sheet 13: Reference - Banks
| BankId | BankName | City | State |
|--------|----------|------|-------|
| 1 | b1Bank | Baton Rouge | LA |
| 2 | First Horizon Bank | Memphis | TN |

### Sheet 14: Reference - Persons
| PersonId | FullName | Email | Phone |
|----------|----------|-------|-------|
| 1 | Toby Easterly | toby@stoa.com | ... |
| 2 | Ryan Nash | ryan@stoa.com | ... |
| 3 | Saun Sullivan | saun@stoa.com | ... |

### Sheet 15: Reference - Equity Partners
| EquityPartnerId | PartnerName | Notes |
|----------------|-------------|-------|
| 1 | Partner A | ... |

---

## 🔗 RELATIONSHIP SUMMARY

### One Project Can Have:
- **Multiple Loans** (construction, permanent, mini-perm, land)
- **1-3 DSCR Tests** (one per test number)
- **Multiple Participations** (one per participating bank)
- **Multiple Guarantees** (one per guarantor/person)
- **Multiple Covenants**
- **1 Liquidity Requirement** (or none)
- **Multiple Equity Commitments**
- **1 Under Contract record** (or none)
- **1 Commercial Listed record** (or none)
- **1 Commercial Acreage record** (or none)
- **1 Closed Property record** (or none)

### Reference Tables (Not Project-Specific):
- **Banks** - Used by Loans, Participations, BankTargets
- **Persons** - Used by Guarantees
- **Equity Partners** - Used by Equity Commitments

---

## 🎯 KEY TAKEAWAYS FOR EXCEL CREATION

1. **ProjectId is the anchor** - Every department table has a `ProjectId` column
2. **One-to-Many relationships** - Most banking tables allow multiple records per project
3. **One-to-One relationships** - Pipeline tables are typically one record per project
4. **Reference tables** - Banks, Persons, Equity Partners are lookup tables (not project-specific)
5. **Foreign Keys** - Use IDs from reference tables (BankId, PersonId, etc.) in related tables

---

## 📝 PROMPT FOR CHATGPT

Use this prompt to have ChatGPT create the Excel file:

```
Create an Excel file with the following structure for a real estate project management database:

1. Sheet 1: Projects (Master List)
   Columns: ProjectId, ProjectName, City, State, Region, Units, ProductType, Stage, EstimatedConstructionStartDate

2. Sheet 2: Banking - Loans
   Columns: LoanId, ProjectId, LoanType, LoanPhase, LenderId, LoanAmount, LoanClosingDate, MaturityDate, FixedOrFloating, IndexName, Spread

3. Sheet 3: Banking - Participations
   Columns: ParticipationId, ProjectId, LoanId, BankId, ParticipationPercent, ExposureAmount, PaidOff

4. Sheet 4: Banking - Guarantees
   Columns: GuaranteeId, ProjectId, LoanId, PersonId, GuaranteePercent, GuaranteeAmount

5. Sheet 5: Banking - DSCR Tests
   Columns: DSCRTestId, ProjectId, LoanId, TestNumber, TestDate, ProjectedInterestRate, Requirement, ProjectedValue

6. Sheet 6: Banking - Covenants
   Columns: CovenantId, ProjectId, LoanId, CovenantType, CovenantDate, Requirement, ProjectedValue

7. Sheet 7: Banking - Liquidity Requirements
   Columns: LiquidityRequirementId, ProjectId, LoanId, TotalAmount, LendingBankAmount

8. Sheet 8: Banking - Equity Commitments
   Columns: EquityCommitmentId, ProjectId, EquityPartnerId, EquityType, Amount, FundingDate

9. Sheet 9: Pipeline - Under Contract
   Columns: UnderContractId, ProjectId, Location, Acreage, Units, Price, ExecutionDate

10. Sheet 10: Pipeline - Commercial Listed
    Columns: CommercialListedId, ProjectId, Location, ListedDate, Acreage, Price, Status

11. Sheet 11: Pipeline - Commercial Acreage
    Columns: CommercialAcreageId, ProjectId, Location, Acreage, SquareFootage

12. Sheet 12: Pipeline - Closed Property
    Columns: ClosedPropertyId, ProjectId, Status, ClosingDate, Location, Units, Price

13. Sheet 13: Reference - Banks
    Columns: BankId, BankName, City, State

14. Sheet 14: Reference - Persons
    Columns: PersonId, FullName, Email, Phone

15. Sheet 15: Reference - Equity Partners
    Columns: EquityPartnerId, PartnerName, Notes

Important Notes:
- ProjectId is the anchor - all department tables link to it
- Use ProjectId to connect data across sheets
- Reference tables (Banks, Persons, Equity Partners) are lookup tables
- Include sample data showing relationships
- Add data validation where appropriate (e.g., PersonId 1-3 for guarantors)
```

---

## ✅ SUMMARY

**The Pyramid:**
- **TOP:** `core.Project` (ProjectId) - The anchor
- **MIDDLE:** Banking Department (8 tables) + Pipeline Department (4 tables)
- **BOTTOM:** Core Reference Tables (3 tables) - Used by Banking/Pipeline

**Every department tracks their own data under one ProjectId!**
