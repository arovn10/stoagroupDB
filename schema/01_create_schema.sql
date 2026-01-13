-- ============================================================
-- STOA SINGLE SOURCE OF TRUTH DATABASE
-- ProjectID is the anchor - everything ties to it
-- Stores ONLY original/master datapoints (no calculations)
-- ============================================================
-- NOTE: If tables already exist, run clear_all_tables.sql first
-- ============================================================

SET NOCOUNT ON;

-- Create schemas
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'core')    EXEC('CREATE SCHEMA core');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'banking') EXEC('CREATE SCHEMA banking');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'pipeline')EXEC('CREATE SCHEMA pipeline');

-- ============================================================
-- CORE: PROJECT (Source of Truth Anchor)
-- ============================================================
CREATE TABLE core.Project (
    ProjectId   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Project PRIMARY KEY,
    ProjectName NVARCHAR(255) NOT NULL CONSTRAINT UQ_Project_ProjectName UNIQUE,
    
    -- Basic info
    City        NVARCHAR(100) NULL,
    State       NVARCHAR(50) NULL,
    Region      NVARCHAR(50) NULL,  -- Gulf Coast, Carolinas, etc.
    Location    NVARCHAR(255) NULL, -- Full location text
    Units       INT NULL,          -- Planned/underwritten units
    
    -- Product type
    ProductType NVARCHAR(50) NULL,  -- Heights, Waters, Flats, Other
    
    -- Stage
    Stage       NVARCHAR(50) NULL,   -- Prospective, Under Contract, Under Construction, Lease-Up, Stabilized, Liquidated
    
    -- Estimated dates (targets/plans - actuals come from Procore)
    EstimatedConstructionStartDate DATE NULL,  -- Estimated start date (actual comes from Procore)
    
    -- Timestamps
    CreatedAt   DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt   DATETIME2(0) NULL
);

-- ============================================================
-- CORE: REFERENCE TABLES
-- ============================================================

-- Banks/Lenders
CREATE TABLE core.Bank (
    BankId   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Bank PRIMARY KEY,
    BankName NVARCHAR(255) NOT NULL CONSTRAINT UQ_Bank_Name UNIQUE,
    City     NVARCHAR(100) NULL,
    State    NVARCHAR(50) NULL,
    Notes    NVARCHAR(MAX) NULL
);

-- Equity Partners
CREATE TABLE core.EquityPartner (
    EquityPartnerId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_EquityPartner PRIMARY KEY,
    PartnerName     NVARCHAR(255) NOT NULL CONSTRAINT UQ_EquityPartner_Name UNIQUE,
    Notes           NVARCHAR(MAX) NULL
);

-- People (guarantors, contacts)
CREATE TABLE core.Person (
    PersonId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Person PRIMARY KEY,
    FullName NVARCHAR(255) NOT NULL,
    Email    NVARCHAR(255) NULL,
    Phone    NVARCHAR(50) NULL
);

-- ============================================================
-- BANKING: LOANS (Construction, Permanent, Mini-Perm, etc.)
-- ============================================================
CREATE TABLE banking.Loan (
    LoanId   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Loan PRIMARY KEY,
    ProjectId INT NOT NULL,
    
    -- Loan identification
    BirthOrder INT NULL,  -- From Banking Dashboard (6, 10, 11, etc.)
    LoanType NVARCHAR(100) NULL,  -- LOC - Construction, RLOC - Land, Owner Occupied Office, etc.
    Borrower NVARCHAR(255) NULL,
    LoanPhase NVARCHAR(30) NOT NULL,  -- Construction, Permanent, MiniPerm, Land, Other
    FinancingStage NVARCHAR(50) NULL,  -- Under Contract Model, Bank Package Model, Construction Loan, Permanent Loan, Liquidated
    
    -- Lender
    LenderId INT NULL,  -- FK to core.Bank
    
    -- Amounts and dates
    LoanAmount      DECIMAL(18,2) NULL,
    LoanClosingDate DATE NULL,
    MaturityDate    DATE NULL,
    
    -- Rate terms
    FixedOrFloating NVARCHAR(20) NULL,  -- Fixed, Floating
    IndexName      NVARCHAR(50) NULL,  -- SOFR, WSJ Prime, N/A
    Spread         NVARCHAR(50) NULL,  -- Store as entered: "2.75%", "0.50%"
    InterestRate   NVARCHAR(100) NULL, -- For fixed rates or complex expressions
    
    -- Mini-Perm (if applicable)
    MiniPermMaturity     DATE NULL,
    MiniPermInterestRate NVARCHAR(100) NULL,
    
    -- Perm-Phase (if applicable - for construction loans that convert to perm)
    PermPhaseMaturity     DATE NULL,
    PermPhaseInterestRate NVARCHAR(100) NULL,
    
    -- Construction milestones (text as entered - May-23, Dec-25, etc.)
    -- NOTE: These are TARGET dates, not actuals. Actuals come from Procore.
    ConstructionCompletionDate NVARCHAR(20) NULL,
    LeaseUpCompletedDate      NVARCHAR(20) NULL,
    IOMaturityDate            DATE NULL,
    
    -- Permanent Financing (if this is a permanent loan)
    PermanentCloseDate       DATE NULL,
    PermanentLoanAmount      DECIMAL(18,2) NULL,
    
    Notes NVARCHAR(MAX) NULL,
    
    CONSTRAINT FK_Loan_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT FK_Loan_Lender  FOREIGN KEY (LenderId) REFERENCES core.Bank(BankId),
    CONSTRAINT CK_Loan_Phase CHECK (LoanPhase IN ('Construction', 'Permanent', 'MiniPerm', 'Land', 'Other'))
);

CREATE INDEX IX_Loan_Project ON banking.Loan(ProjectId);
CREATE INDEX IX_Loan_Lender  ON banking.Loan(LenderId);

-- ============================================================
-- BANKING: DSCR TESTS (1st, 2nd, 3rd test dates and requirements)
-- ============================================================
CREATE TABLE banking.DSCRTest (
    DSCRTestId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DSCRTest PRIMARY KEY,
    ProjectId  INT NOT NULL,
    LoanId     INT NULL,  -- Optional: tie to specific loan
    
    TestNumber INT NOT NULL,  -- 1, 2, or 3
    
    TestDate              DATE NULL,
    ProjectedInterestRate NVARCHAR(50) NULL,  -- Store as entered
    Requirement          DECIMAL(10,2) NULL, -- e.g., 1.25
    ProjectedValue       NVARCHAR(50) NULL,   -- Store as entered (sometimes not numeric)
    
    CONSTRAINT FK_DSCR_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT FK_DSCR_Loan    FOREIGN KEY (LoanId) REFERENCES banking.Loan(LoanId),
    CONSTRAINT UQ_DSCR_Project_Test UNIQUE (ProjectId, TestNumber)
);

-- ============================================================
-- BANKING: COVENANTS (Occupancy, Liquidity, etc.)
-- ============================================================
CREATE TABLE banking.Covenant (
    CovenantId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Covenant PRIMARY KEY,
    ProjectId  INT NOT NULL,
    LoanId     INT NULL,
    
    CovenantType NVARCHAR(50) NOT NULL,  -- Occupancy, Liquidity, Other
    
    CovenantDate    DATE NULL,
    Requirement    NVARCHAR(100) NULL,      -- Store as entered
    ProjectedValue NVARCHAR(50) NULL,     -- For occupancy %, etc.
    
    Notes NVARCHAR(MAX) NULL,
    
    CONSTRAINT FK_Covenant_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT FK_Covenant_Loan    FOREIGN KEY (LoanId) REFERENCES banking.Loan(LoanId)
);

-- ============================================================
-- BANKING: LIQUIDITY REQUIREMENTS
-- ============================================================
CREATE TABLE banking.LiquidityRequirement (
    LiquidityRequirementId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LiquidityRequirement PRIMARY KEY,
    ProjectId               INT NOT NULL,
    LoanId                  INT NULL,
    
    TotalAmount       DECIMAL(18,2) NULL,
    LendingBankAmount DECIMAL(18,2) NULL,
    
    Notes NVARCHAR(MAX) NULL,
    
    CONSTRAINT FK_Liquidity_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT FK_Liquidity_Loan   FOREIGN KEY (LoanId) REFERENCES banking.Loan(LoanId),
    CONSTRAINT UQ_Liquidity_Project UNIQUE (ProjectId)
);

-- ============================================================
-- BANKING: PARTICIPATIONS (Bank participation splits)
-- ============================================================
CREATE TABLE banking.Participation (
    ParticipationId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Participation PRIMARY KEY,
    ProjectId       INT NOT NULL,
    LoanId          INT NULL,
    BankId          INT NOT NULL,
    
    ParticipationPercent NVARCHAR(50) NULL,  -- Store as entered: "32.0%", "50%"
    ExposureAmount       DECIMAL(18,2) NULL,
    PaidOff              BIT NULL,
    
    Notes NVARCHAR(MAX) NULL,
    
    CONSTRAINT FK_Part_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT FK_Part_Loan    FOREIGN KEY (LoanId) REFERENCES banking.Loan(LoanId),
    CONSTRAINT FK_Part_Bank    FOREIGN KEY (BankId) REFERENCES core.Bank(BankId)
);

CREATE INDEX IX_Part_Project ON banking.Participation(ProjectId);
CREATE INDEX IX_Part_Bank    ON banking.Participation(BankId);

-- ============================================================
-- BANKING: CONTINGENT LIABILITIES (Guarantees)
-- ============================================================
CREATE TABLE banking.Guarantee (
    GuaranteeId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Guarantee PRIMARY KEY,
    ProjectId   INT NOT NULL,
    LoanId     INT NULL,
    PersonId   INT NOT NULL,
    
    GuaranteePercent DECIMAL(10,4) NULL,
    GuaranteeAmount  DECIMAL(18,2) NULL,
    
    Notes NVARCHAR(MAX) NULL,
    
    CONSTRAINT FK_Guarantee_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT FK_Guarantee_Loan    FOREIGN KEY (LoanId) REFERENCES banking.Loan(LoanId),
    CONSTRAINT FK_Guarantee_Person  FOREIGN KEY (PersonId) REFERENCES core.Person(PersonId)
);

-- ============================================================
-- BANKING: TARGETED BANKS (Relationship/capacity notes)
-- ============================================================
CREATE TABLE banking.BankTarget (
    BankTargetId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_BankTarget PRIMARY KEY,
    BankId       INT NOT NULL,
    
    AssetsText        NVARCHAR(200) NULL,
    City              NVARCHAR(100) NULL,
    State             NVARCHAR(50) NULL,
    ExposureWithStoa  DECIMAL(18,2) NULL,
    ContactText       NVARCHAR(4000) NULL,
    Comments          NVARCHAR(MAX) NULL,
    
    CONSTRAINT FK_BankTarget_Bank FOREIGN KEY (BankId) REFERENCES core.Bank(BankId),
    CONSTRAINT UQ_BankTarget_Bank UNIQUE (BankId)
);

-- ============================================================
-- EQUITY: EQUITY COMMITMENTS
-- ============================================================
CREATE TABLE banking.EquityCommitment (
    EquityCommitmentId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_EquityCommitment PRIMARY KEY,
    ProjectId          INT NOT NULL,
    EquityPartnerId   INT NULL,
    
    EquityType         NVARCHAR(50) NULL,  -- Pref, Common
    LeadPrefGroup      NVARCHAR(255) NULL,
    FundingDate        DATE NULL,
    Amount             DECIMAL(18,2) NULL,
    InterestRate       NVARCHAR(50) NULL,
    AnnualMonthly      NVARCHAR(50) NULL,
    BackEndKicker      NVARCHAR(255) NULL,
    LastDollar         BIT NULL,
    
    Notes NVARCHAR(MAX) NULL,
    
    CONSTRAINT FK_Equity_Project  FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT FK_Equity_Partner FOREIGN KEY (EquityPartnerId) REFERENCES core.EquityPartner(EquityPartnerId)
);

-- ============================================================
-- PIPELINE: UNDER CONTRACT
-- ============================================================
CREATE TABLE pipeline.UnderContract (
    UnderContractId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UnderContract PRIMARY KEY,
    ProjectId       INT NOT NULL,
    
    Location        NVARCHAR(255) NULL,
    Region          NVARCHAR(50) NULL,
    Acreage         DECIMAL(18,4) NULL,
    Units           INT NULL,
    Price           DECIMAL(18,2) NULL,
    PricePerSF      DECIMAL(18,2) NULL,
    
    ExecutionDate   DATE NULL,
    DueDiligenceDate DATE NULL,
    ClosingDate     DATE NULL,
    
    PurchasingEntity NVARCHAR(255) NULL,
    CashFlag         BIT NULL,
    OpportunityZone  BIT NULL,
    ExtensionNotes   NVARCHAR(MAX) NULL,
    
    CONSTRAINT FK_UC_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT UQ_UC_Project UNIQUE (ProjectId)
);

-- ============================================================
-- PIPELINE: COMMERCIAL LAND LISTED
-- ============================================================
CREATE TABLE pipeline.CommercialListed (
    CommercialListedId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CommercialListed PRIMARY KEY,
    ProjectId          INT NOT NULL,
    
    Location           NVARCHAR(255) NULL,
    ListedDate         DATE NULL,
    Acreage            DECIMAL(18,4) NULL,
    Price              DECIMAL(18,2) NULL,
    Status             NVARCHAR(50) NULL,
    DueDiligenceDate   DATE NULL,
    ClosingDate        DATE NULL,
    
    Owner              NVARCHAR(255) NULL,
    PurchasingEntity   NVARCHAR(255) NULL,
    Broker             NVARCHAR(255) NULL,
    Notes              NVARCHAR(MAX) NULL,
    
    CONSTRAINT FK_CL_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT UQ_CL_Project UNIQUE (ProjectId)
);

-- ============================================================
-- PIPELINE: COMMERCIAL ACREAGE
-- ============================================================
CREATE TABLE pipeline.CommercialAcreage (
    CommercialAcreageId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CommercialAcreage PRIMARY KEY,
    ProjectId           INT NOT NULL,
    
    Location            NVARCHAR(255) NULL,
    Acreage             DECIMAL(18,4) NULL,
    SquareFootage       DECIMAL(18,2) NULL,
    BuildingFootprintSF DECIMAL(18,2) NULL,
    
    CONSTRAINT FK_CA_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT UQ_CA_Project UNIQUE (ProjectId)
);

-- ============================================================
-- PIPELINE: CLOSED PROPERTIES
-- ============================================================
CREATE TABLE pipeline.ClosedProperty (
    ClosedPropertyId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ClosedProperty PRIMARY KEY,
    ProjectId        INT NOT NULL,
    
    Status           NVARCHAR(50) NULL,  -- Multifamily, Commercial, etc.
    ClosingDate      DATE NULL,
    Location         NVARCHAR(255) NULL,
    Address          NVARCHAR(500) NULL,
    Acreage          DECIMAL(18,4) NULL,
    Units            INT NULL,
    Price            DECIMAL(18,2) NULL,
    PricePerSF       DECIMAL(18,2) NULL,
    
    ActOfSale        NVARCHAR(255) NULL,
    DueDiligenceDate DATE NULL,
    PurchasingEntity NVARCHAR(255) NULL,
    CashFlag         BIT NULL,
    
    CONSTRAINT FK_CP_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT UQ_CP_Project UNIQUE (ProjectId)
);

PRINT 'Schema created successfully. ProjectID is now the source of truth.';

