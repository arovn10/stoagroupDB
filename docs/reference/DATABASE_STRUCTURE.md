# STOA Database Structure Visualization

## 🎯 Core Principle
**`core.Project` is the anchor** - Every table in every department links to `ProjectId` as the source of truth.

---

## 📊 Database Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    CORE.PROJECT                             │
│                    (ProjectId)                              │
│                    Source of Truth Anchor                   │
└────────────────────┬────────────────────────────────────────┘
                     │
     ┌───────────────┼───────────────┬───────────────┬───────────────┬───────────────┬───────────────┐
     │               │               │               │               │               │               │
     ▼               ▼               ▼               ▼               ▼               ▼               ▼
┌─────────┐   ┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│Accounting│   │Capital Markets│  │   Land   │  │Construction│ │    HR    │  │ Marketing│  │Operations│
│         │   │& Asset Mgmt  │  │Development│  │           │ │          │  │          │  │          │
└─────────┘   └──────────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

---

## 🏗️ LEVEL 1: CORE PROJECT (The Anchor)

**Table:** `core.Project`  
**Primary Key:** `ProjectId` (INT, Auto-increment)  
**Unique Constraint:** `ProjectName`

### Fields:
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

## 📋 CORE REFERENCE TABLES

These tables are shared across departments and don't link directly to projects:

### `core.Bank`
- `BankId` (PK)
- `BankName` (Unique)
- `City`, `State`
- `HQState`, `HoldLimit`, `PerDealLimit`, `Deposits` (from exposure data)
- `Notes`

### `core.Person`
- `PersonId` (PK)
- `FullName`
- `Email`, `Phone`

### `core.PreConManager`
- `PreConManagerId` (PK)
- `FullName`
- `Email`, `Phone`
- `CreatedAt`, `UpdatedAt`
- Separate datapoint for Pre-Con Managers (Land Development), not tied to contacts

### `core.EquityPartner`
- `EquityPartnerId` (PK)
- `PartnerName` (Unique)
- `Notes`

---

## 💰 ACCOUNTING DEPARTMENT

**Schema:** `accounting` (to be created)  
**Purpose:** Financial tracking, budgets, actuals, P&L

### Tables (Future):
- `accounting.Budget` - Project budgets
- `accounting.Actual` - Actual costs and revenues
- `accounting.Invoice` - Invoices and payments
- `accounting.Expense` - Project expenses
- `accounting.Revenue` - Revenue streams

**Status:** ⚠️ Schema not yet created - placeholder for future implementation

---

## 🏦 CAPITAL MARKETS & ASSET MANAGEMENT DEPARTMENT

**Schema:** `banking` (existing)  
**Purpose:** Loan management, banking relationships, capital structure, guarantees

### Tables:

#### `banking.Loan`
- `LoanId` (PK)
- `ProjectId` (FK → core.Project)
- `LenderId` (FK → core.Bank)
- `BirthOrder`, `LoanType`, `Borrower`, `LoanPhase`
- `LoanAmount`, `LoanClosingDate`, `MaturityDate`
- `FixedOrFloating`, `IndexName`, `Spread`, `InterestRate`
- `MiniPermMaturity`, `MiniPermInterestRate`
- `PermPhaseMaturity`, `PermPhaseInterestRate`
- `ConstructionCompletionDate`, `LeaseUpCompletedDate`, `IOMaturityDate`
- `PermanentCloseDate`, `PermanentLoanAmount`
- `Notes`

#### `banking.DSCRTest`
- `DSCRTestId` (PK)
- `ProjectId` (FK → core.Project)
- `LoanId` (FK → banking.Loan, optional)
- `TestNumber` (1, 2, or 3)
- `TestDate`, `ProjectedInterestRate`, `Requirement`, `ProjectedValue`

#### `banking.Covenant`
- `CovenantId` (PK)
- `ProjectId` (FK → core.Project)
- `LoanId` (FK → banking.Loan, optional)
- `CovenantType` (Occupancy, Liquidity, Other)
- `CovenantDate`, `Requirement`, `ProjectedValue`
- `Notes`

#### `banking.LiquidityRequirement`
- `LiquidityRequirementId` (PK)
- `ProjectId` (FK → core.Project, Unique)
- `LoanId` (FK → banking.Loan, optional)
- `TotalAmount`, `LendingBankAmount`
- `Notes`

#### `banking.Participation`
- `ParticipationId` (PK)
- `ProjectId` (FK → core.Project)
- `LoanId` (FK → banking.Loan, optional)
- `BankId` (FK → core.Bank)
- `ParticipationPercent`, `ExposureAmount`, `PaidOff`
- `Notes`

#### `banking.Guarantee`
- `GuaranteeId` (PK)
- `ProjectId` (FK → core.Project)
- `LoanId` (FK → banking.Loan, optional)
- `PersonId` (FK → core.Person)
- `GuaranteePercent`, `GuaranteeAmount`
- `Notes`

#### `banking.BankTarget`
- `BankTargetId` (PK)
- `BankId` (FK → core.Bank, Unique)
- `AssetsText`, `City`, `State`
- `ExposureWithStoa`, `ContactText`, `Comments`

#### `banking.EquityCommitment`
- `EquityCommitmentId` (PK)
- `ProjectId` (FK → core.Project)
- `EquityPartnerId` (FK → core.EquityPartner, optional)
- `EquityType` (Pref, Common)
- `LeadPrefGroup`, `FundingDate`, `Amount`
- `InterestRate`, `AnnualMonthly`, `BackEndKicker`, `LastDollar`
- `Notes`

**Status:** ✅ Fully implemented

---

## 🏞️ LAND DEVELOPMENT DEPARTMENT

**Schema:** `pipeline` (existing)  
**Purpose:** Deal pipeline, land acquisition, property tracking

### Tables:

#### `pipeline.UnderContract`
- `UnderContractId` (PK)
- `ProjectId` (FK → core.Project, Unique)
- `Location`, `Region`, `Acreage`, `Units`
- `Price`, `PricePerSF`
- `ExecutionDate`, `DueDiligenceDate`, `ClosingDate`
- `PurchasingEntity`, `CashFlag`, `OpportunityZone`
- `ExtensionNotes`

#### `pipeline.CommercialListed`
- `CommercialListedId` (PK)
- `ProjectId` (FK → core.Project, Unique)
- `Location`, `ListedDate`, `Acreage`, `Price`
- `Status`, `DueDiligenceDate`, `ClosingDate`
- `Owner`, `PurchasingEntity`, `Broker`
- `Notes`

#### `pipeline.CommercialAcreage`
- `CommercialAcreageId` (PK)
- `ProjectId` (FK → core.Project, Unique)
- `Location`, `Acreage`, `SquareFootage`, `BuildingFootprintSF`

#### `pipeline.ClosedProperty`
- `ClosedPropertyId` (PK)
- `ProjectId` (FK → core.Project, Unique)
- `Status`, `ClosingDate`, `Location`, `Address`
- `Acreage`, `Units`, `Price`, `PricePerSF`
- `ActOfSale`, `DueDiligenceDate`, `PurchasingEntity`, `CashFlag`

#### `pipeline.DealPipeline`
- `DealPipelineId` (PK)
- `ProjectId` (FK → core.Project, Unique)
- **Asana tracking fields:** `Bank`, `StartDate`, `UnitCount`, `PreConManagerId`, `ConstructionLoanClosingDate`, `Notes`, `Priority`
- **Land Development fields:** `Acreage`, `LandPrice`, `SqFtPrice`, `ExecutionDate`, `DueDiligenceDate`, `ClosingDate`, `PurchasingEntity`, `Cash`, `OpportunityZone`, `ClosingNotes`
- **Asana metadata:** `AsanaTaskGid`, `AsanaProjectGid`
- `CreatedAt`, `UpdatedAt`
- Tracks deals from Prospective → Under Contract → Commercial Land - Listed → Under Construction → Lease-Up → Stabilized → Liquidated
- Stage is stored in `core.Project.Stage` (controlled by Land Development)

**Status:** ✅ Fully implemented

---

## 🏗️ CONSTRUCTION DEPARTMENT

**Schema:** `construction` (to be created)  
**Purpose:** Construction management, Procore integration, progress tracking

### Tables (Future):
- `construction.Phase` - Construction phases (site work, foundation, framing, etc.)
- `construction.Milestone` - Key construction milestones
- `construction.ChangeOrder` - Change orders and modifications
- `construction.Draw` - Construction draws and payments
- `construction.Vendor` - Vendors and contractors
- `construction.Schedule` - Construction schedules and timelines
- `construction.Quality` - Quality control and inspections

**Status:** ⚠️ Schema not yet created - placeholder for future implementation  
**Note:** Actual construction data will come from Procore integration

---

## 👥 HR DEPARTMENT

**Schema:** `hr` (to be created)  
**Purpose:** Human resources, staffing, employee management

### Tables (Future):
- `hr.Employee` - Employee information
- `hr.ProjectAssignment` - Employee assignments to projects
- `hr.TimeEntry` - Time tracking by project
- `hr.Expense` - Employee expenses
- `hr.Performance` - Performance reviews and evaluations

**Status:** ⚠️ Schema not yet created - placeholder for future implementation

---

## 📢 MARKETING DEPARTMENT

**Schema:** `marketing` (to be created)  
**Purpose:** Marketing campaigns, lead generation, branding

### Tables (Future):
- `marketing.Campaign` - Marketing campaigns
- `marketing.Lead` - Lead generation and tracking
- `marketing.Event` - Marketing events and activities
- `marketing.Material` - Marketing materials and assets
- `marketing.Branding` - Branding guidelines and assets

**Status:** ⚠️ Schema not yet created - placeholder for future implementation

---

## ⚙️ OPERATIONS DEPARTMENT

**Schema:** `operations` (to be created)  
**Purpose:** Property operations, maintenance, tenant management

### Tables (Future):
- `operations.Property` - Property operations data
- `operations.Maintenance` - Maintenance requests and work orders
- `operations.Tenant` - Tenant information (from RealPage)
- `operations.Lease` - Lease agreements
- `operations.Occupancy` - Occupancy tracking (from RealPage)
- `operations.NOI` - Net Operating Income (from RealPage)
- `operations.Vendor` - Operations vendors and service providers

**Status:** ⚠️ Schema not yet created - placeholder for future implementation  
**Note:** Actual operations data will come from RealPage integration

---

## 📊 RELATIONSHIP DIAGRAM

```
                    ┌─────────────────┐
                    │  core.Project   │
                    │   (ProjectId)   │
                    └────────┬─────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌──────────────┐   ┌──────────────┐
│   banking     │   │   pipeline   │   │   (future)   │
│   schema      │   │   schema     │   │   schemas    │
└───────────────┘   └──────────────┘   └──────────────┘
        │                    │                    │
        ├─ Loan             ├─ UnderContract     ├─ (Accounting)
        ├─ DSCRTest         ├─ CommercialListed  ├─ (Construction)
        ├─ Covenant         ├─ CommercialAcreage ├─ (HR)
        ├─ LiquidityReq     ├─ ClosedProperty    ├─ (Marketing)
        ├─ Participation    └─ DealPipeline      ├─ (Operations)
        ├─ Participation                         └─ (Operations)
        ├─ Guarantee
        ├─ BankTarget
        └─ EquityCommitment
```

---

## 🔗 FOREIGN KEY RELATIONSHIPS

### Direct Project Links:
- `banking.Loan` → `core.Project.ProjectId`
- `banking.DSCRTest` → `core.Project.ProjectId`
- `banking.Covenant` → `core.Project.ProjectId`
- `banking.LiquidityRequirement` → `core.Project.ProjectId`
- `banking.Participation` → `core.Project.ProjectId`
- `banking.Guarantee` → `core.Project.ProjectId`
- `banking.EquityCommitment` → `core.Project.ProjectId`
- `pipeline.UnderContract` → `core.Project.ProjectId`
- `pipeline.CommercialListed` → `core.Project.ProjectId`
- `pipeline.CommercialAcreage` → `core.Project.ProjectId`
- `pipeline.ClosedProperty` → `core.Project.ProjectId`
- `pipeline.DealPipeline` → `core.Project.ProjectId`

### Secondary Links:
- `banking.Loan` → `core.Bank.BankId` (LenderId)
- `banking.Participation` → `core.Bank.BankId` (BankId)
- `banking.BankTarget` → `core.Bank.BankId`
- `banking.Guarantee` → `core.Person.PersonId`
- `banking.EquityCommitment` → `core.EquityPartner.EquityPartnerId`

### Optional Loan Links:
- `banking.DSCRTest` → `banking.Loan.LoanId` (optional)
- `banking.Covenant` → `banking.Loan.LoanId` (optional)
- `banking.LiquidityRequirement` → `banking.Loan.LoanId` (optional)
- `banking.Participation` → `banking.Loan.LoanId` (optional)
- `banking.Guarantee` → `banking.Loan.LoanId` (optional)

---

## 📈 DATA FLOW

```
External Systems → Database → Domo Dashboards
     │                │              │
     ├─ Procore ─────┼──────────────┤ (Construction data)
     ├─ RealPage ────┼──────────────┤ (Operations data)
     └─ Excel/CSV ───┼──────────────┤ (Manual data entry)
                     │
              core.Project
              (ProjectId anchor)
```

---

## ✅ IMPLEMENTATION STATUS

| Department | Schema | Status | Tables Count |
|------------|--------|--------|--------------|
| **Core** | `core` | ✅ Complete | 4 tables |
| **Capital Markets & Asset Management** | `banking` | ✅ Complete | 8 tables |
| **Land Development** | `pipeline` | ✅ Complete | 5 tables |
| **Accounting** | `accounting` | ⚠️ Planned | 0 tables |
| **Construction** | `construction` | ⚠️ Planned | 0 tables |
| **HR** | `hr` | ⚠️ Planned | 0 tables |
| **Marketing** | `marketing` | ⚠️ Planned | 0 tables |
| **Operations** | `operations` | ⚠️ Planned | 0 tables |

---

## 🎯 KEY PRINCIPLES

1. **ProjectId is the anchor** - Every department table links to `core.Project.ProjectId`
2. **One source of truth** - Database stores original/master data points
3. **No calculations** - Store only raw data, calculate in dashboards
4. **Department isolation** - Each department has its own schema
5. **Reference tables** - Shared lookup tables in `core` schema
6. **Future-ready** - Structure supports expansion to new departments

---

## 📝 NOTES

- All existing data remains in place
- Banking tables are in `banking` schema (Capital Markets & Asset Management)
- Pipeline tables are in `pipeline` schema (Land Development)
- Future departments will follow the same pattern: create schema, add tables linking to `core.Project`
- External integrations (Procore, RealPage) will populate Construction and Operations schemas

---

*Last Updated: Database structure visualization v1.0*
