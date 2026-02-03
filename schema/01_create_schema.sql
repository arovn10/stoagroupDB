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
    Address     NVARCHAR(500) NULL, -- Full address
    Units       INT NULL,          -- Planned/underwritten units
    
    -- Product type
    ProductType NVARCHAR(50) NULL,  -- Heights, Prototype, Flats, Land, Other
    
    -- Stage
    Stage       NVARCHAR(50) NULL,   -- Prospective, Under Contract, Commercial Land - Listed, Under Construction, Lease-Up, Stabilized, Liquidated, Dead, HoldCo
    
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
    IMSInvestorProfileId NVARCHAR(50) NULL,
    
    PartnerType     NVARCHAR(20) NULL,  -- Entity or Individual
    
    -- Investor Representative Contact (references core.Person)
    InvestorRepId   INT NULL,  -- FK to core.Person
    
    Notes           NVARCHAR(MAX) NULL,
    
    CONSTRAINT CK_EquityPartner_PartnerType CHECK (PartnerType IS NULL OR PartnerType IN ('Entity', 'Individual')),
    CONSTRAINT FK_EquityPartner_InvestorRep FOREIGN KEY (InvestorRepId) REFERENCES core.Person(PersonId)
);

-- People (guarantors, contacts)
CREATE TABLE core.Person (
    PersonId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Person PRIMARY KEY,
    FullName NVARCHAR(255) NOT NULL,
    Email    NVARCHAR(255) NULL,
    Phone    NVARCHAR(50) NULL,
    Title    NVARCHAR(100) NULL,   -- Optional; for disambiguation (e.g. "Ryan Nash (2)" or title)
    Notes    NVARCHAR(MAX) NULL
);

-- Pre-Con Managers (Land Development)
CREATE TABLE core.PreConManager (
    PreConManagerId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PreConManager PRIMARY KEY,
    FullName NVARCHAR(255) NOT NULL,
    Email    NVARCHAR(255) NULL,
    Phone    NVARCHAR(50) NULL,
    CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt DATETIME2(0) NULL
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
    FixedOrFloating NVARCHAR(20) NULL,  -- Fixed or Floating (selection: Fixed, Floating)
    IndexName      NVARCHAR(50) NULL,  -- For Construction: Prime or SOFR (NULL for Fixed)
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
    
    FinancingType NVARCHAR(30) NULL,  -- Construction or Permanent
    TestNumber INT NOT NULL,  -- 1, 2, or 3
    
    TestDate              DATE NULL,
    ProjectedInterestRate NVARCHAR(50) NULL,  -- Store as entered
    Requirement          DECIMAL(10,2) NULL, -- e.g., 1.25
    ProjectedValue       NVARCHAR(50) NULL,   -- Store as entered (sometimes not numeric)
    IsCompleted          BIT NOT NULL DEFAULT 0,  -- Toggle to track if test has been completed
    
    CONSTRAINT FK_DSCR_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT FK_DSCR_Loan    FOREIGN KEY (LoanId) REFERENCES banking.Loan(LoanId),
    CONSTRAINT CK_DSCRTest_FinancingType CHECK (FinancingType IS NULL OR FinancingType IN ('Construction', 'Permanent')),
    CONSTRAINT UQ_DSCR_Project_Test UNIQUE (ProjectId, TestNumber)
);

-- ============================================================
-- BANKING: COVENANTS (DSCR, Occupancy, Liquidity Requirement, Other)
-- ============================================================
CREATE TABLE banking.Covenant (
    CovenantId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Covenant PRIMARY KEY,
    ProjectId  INT NOT NULL,
    LoanId     INT NULL,
    
    FinancingType NVARCHAR(30) NULL,  -- Construction or Permanent
    CovenantType NVARCHAR(50) NOT NULL,  -- DSCR, Occupancy, Liquidity Requirement, Other
    
    -- Fields for DSCR covenants
    DSCRTestDate          DATE NULL,
    ProjectedInterestRate NVARCHAR(50) NULL,
    DSCRRequirement       NVARCHAR(100) NULL,
    ProjectedDSCR         NVARCHAR(50) NULL,
    
    -- Fields for Occupancy covenants
    OccupancyCovenantDate DATE NULL,
    OccupancyRequirement  NVARCHAR(100) NULL,
    ProjectedOccupancy    NVARCHAR(50) NULL,  -- Store as entered: "76.5%"
    
    -- Fields for Liquidity Requirement covenants
    LiquidityRequirementLendingBank DECIMAL(18,2) NULL,
    
    -- Fields for Other covenants (legacy/general)
    CovenantDate    DATE NULL,
    Requirement    NVARCHAR(100) NULL,      -- Store as entered
    ProjectedValue NVARCHAR(50) NULL,     -- For general use
    
    Notes NVARCHAR(MAX) NULL,
    IsCompleted    BIT NOT NULL DEFAULT 0,  -- Toggle to track if covenant has been completed
    
    CONSTRAINT FK_Covenant_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT FK_Covenant_Loan    FOREIGN KEY (LoanId) REFERENCES banking.Loan(LoanId),
    CONSTRAINT CK_Covenant_FinancingType CHECK (FinancingType IS NULL OR FinancingType IN ('Construction', 'Permanent'))
);

-- ============================================================
-- BANKING: LIQUIDITY REQUIREMENTS
-- ============================================================
CREATE TABLE banking.LiquidityRequirement (
    LiquidityRequirementId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LiquidityRequirement PRIMARY KEY,
    ProjectId               INT NOT NULL,
    LoanId                  INT NULL,
    
    FinancingType NVARCHAR(30) NULL,  -- Construction or Permanent
    TotalAmount       DECIMAL(18,2) NULL,
    LendingBankAmount DECIMAL(18,2) NULL,
    
    Notes NVARCHAR(MAX) NULL,
    IsCompleted    BIT NOT NULL DEFAULT 0,  -- Toggle to track if liquidity requirement has been completed
    
    CONSTRAINT FK_Liquidity_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT FK_Liquidity_Loan   FOREIGN KEY (LoanId) REFERENCES banking.Loan(LoanId),
    CONSTRAINT CK_LiquidityRequirement_FinancingType CHECK (FinancingType IS NULL OR FinancingType IN ('Construction', 'Permanent')),
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
    
    FinancingType       NVARCHAR(30) NULL,  -- Construction or Permanent
    ParticipationPercent NVARCHAR(50) NULL,  -- Store as entered: "32.0%", "50%"
    ExposureAmount       DECIMAL(18,2) NULL,
    PaidOff              BIT NULL,
    
    Notes NVARCHAR(MAX) NULL,
    
    CONSTRAINT FK_Part_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT FK_Part_Loan    FOREIGN KEY (LoanId) REFERENCES banking.Loan(LoanId),
    CONSTRAINT FK_Part_Bank    FOREIGN KEY (BankId) REFERENCES core.Bank(BankId),
    CONSTRAINT CK_Participation_FinancingType CHECK (FinancingType IS NULL OR FinancingType IN ('Construction', 'Permanent'))
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
    
    FinancingType NVARCHAR(30) NULL,  -- Construction or Permanent
    GuaranteePercent DECIMAL(10,4) NULL,
    GuaranteeAmount  DECIMAL(18,2) NULL,
    
    Notes NVARCHAR(MAX) NULL,
    
    CONSTRAINT FK_Guarantee_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT FK_Guarantee_Loan    FOREIGN KEY (LoanId) REFERENCES banking.Loan(LoanId),
    CONSTRAINT FK_Guarantee_Person  FOREIGN KEY (PersonId) REFERENCES core.Person(PersonId),
    CONSTRAINT CK_Guarantee_FinancingType CHECK (FinancingType IS NULL OR FinancingType IN ('Construction', 'Permanent'))
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
    EquityPartnerId   INT NULL,  -- Lead investor
    
    EquityType         NVARCHAR(50) NULL,  -- Preferred Equity, Common Equity, Profits Interest, Stoa Loan
    LeadPrefGroup      NVARCHAR(255) NULL,
    FundingDate        DATE NULL,
    Amount             DECIMAL(18,2) NULL,
    InterestRate       NVARCHAR(50) NULL,
    AnnualMonthly      NVARCHAR(50) NULL,
    BackEndKicker      NVARCHAR(255) NULL,
    LastDollar         BIT NULL,
    
    Notes NVARCHAR(MAX) NULL,
    
    CONSTRAINT FK_Equity_Project  FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT FK_Equity_Partner FOREIGN KEY (EquityPartnerId) REFERENCES core.EquityPartner(EquityPartnerId),
    CONSTRAINT CK_EquityCommitment_EquityType CHECK (EquityType IS NULL OR EquityType IN ('Preferred Equity', 'Common Equity', 'Profits Interest', 'Stoa Loan'))
);

-- Related Parties (investors involved but not the lead)
CREATE TABLE banking.EquityCommitmentRelatedParty (
    EquityCommitmentRelatedPartyId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_EquityCommitmentRelatedParty PRIMARY KEY,
    EquityCommitmentId              INT NOT NULL,
    RelatedPartyId                  INT NOT NULL,  -- FK to core.EquityPartner
    
    CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    
    CONSTRAINT FK_EquityCommitmentRelatedParty_Commitment FOREIGN KEY (EquityCommitmentId) REFERENCES banking.EquityCommitment(EquityCommitmentId) ON DELETE CASCADE,
    CONSTRAINT FK_EquityCommitmentRelatedParty_Partner FOREIGN KEY (RelatedPartyId) REFERENCES core.EquityPartner(EquityPartnerId),
    CONSTRAINT UQ_EquityCommitmentRelatedParty UNIQUE (EquityCommitmentId, RelatedPartyId)
);

CREATE INDEX IX_EquityCommitmentRelatedParty_EquityCommitmentId ON banking.EquityCommitmentRelatedParty(EquityCommitmentId);
CREATE INDEX IX_EquityCommitmentRelatedParty_RelatedPartyId ON banking.EquityCommitmentRelatedParty(RelatedPartyId);

-- ============================================================
-- PIPELINE: UNDER CONTRACT (Land Development - Stoa Properties Tracker)
-- ============================================================
-- Note: CORE attributes (ProjectName, City, State, Region, Units) are pulled from core.Project
--       Region is pulled from core.Region table
--       Only Land Development specific attributes are stored here
CREATE TABLE pipeline.UnderContract (
    UnderContractId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UnderContract PRIMARY KEY,
    ProjectId       INT NOT NULL,
    
    -- Land Development specific attributes (no redundant CORE data)
    Acreage         DECIMAL(18,4) NULL,
    LandPrice       DECIMAL(18,2) NULL,  -- Land purchase price
    SqFtPrice       DECIMAL(18,2) NULL,  -- Calculated: LandPrice / (Acreage * 43560)
    
    ExecutionDate   DATE NULL,           -- Date contract executed
    DueDiligenceDate DATE NULL,          -- Date due diligence ends
    ClosingDate     DATE NULL,           -- Closing date
    
    PurchasingEntity NVARCHAR(255) NULL,
    Cash             BIT NULL,           -- Boolean: paying cash
    OpportunityZone  BIT NULL,           -- Boolean: in opportunity zone
    ClosingNotes     NVARCHAR(MAX) NULL,  -- Extension option / closing notes
    
    CONSTRAINT FK_UC_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT UQ_UC_Project UNIQUE (ProjectId)
);

-- ============================================================
-- PIPELINE: COMMERCIAL LAND LISTED (Land Development)
-- ============================================================
-- Note: CORE attributes (ProjectName, City, State) are pulled from core.Project
--       Only Land Development specific attributes are stored here
CREATE TABLE pipeline.CommercialListed (
    CommercialListedId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CommercialListed PRIMARY KEY,
    ProjectId          INT NOT NULL,
    
    -- Land Development specific attributes (no redundant CORE data)
    ListedDate         DATE NULL,           -- Date land was listed
    Acreage            DECIMAL(18,4) NULL,
    LandPrice          DECIMAL(18,2) NULL,  -- Listing price
    ListingStatus      NVARCHAR(50) NULL,    -- Available, Under Contract, Sold
    DueDiligenceDate   DATE NULL,            -- Date due diligence is closing
    ClosingDate        DATE NULL,             -- Closing date for listed land
    
    Owner              NVARCHAR(255) NULL,
    PurchasingEntity   NVARCHAR(255) NULL,
    Broker             NVARCHAR(255) NULL,
    Notes              NVARCHAR(MAX) NULL,
    
    CONSTRAINT FK_CL_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT UQ_CL_Project UNIQUE (ProjectId)
);

-- ============================================================
-- PIPELINE: COMMERCIAL ACREAGE (Land Development - Land We Own)
-- ============================================================
-- Note: CORE attributes (ProjectName, City, State) are pulled from core.Project
--       Only Land Development specific attributes are stored here
CREATE TABLE pipeline.CommercialAcreage (
    CommercialAcreageId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CommercialAcreage PRIMARY KEY,
    ProjectId           INT NOT NULL,
    
    -- Land Development specific attributes (no redundant CORE data)
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
    LandClosingDate  DATE NULL,  -- Closing date (renamed from ClosingDate)
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

-- ============================================================
-- PIPELINE: BROKER/REFERRAL CONTACT (Land Development)
-- ============================================================
CREATE TABLE pipeline.BrokerReferralContact (
    BrokerReferralContactId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_BrokerReferralContact PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL,
    Email NVARCHAR(255) NULL,
    Phone NVARCHAR(100) NULL,
    CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    ModifiedAt DATETIME2(0) NULL
);

-- ============================================================
-- PIPELINE: DEAL PIPELINE (Land Development Deal Tracker)
-- ============================================================
CREATE TABLE pipeline.DealPipeline (
    DealPipelineId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DealPipeline PRIMARY KEY,
    ProjectId INT NOT NULL,
    
    -- Broker/Referral (optional FK)
    BrokerReferralContactId INT NULL,
    
    -- Asana tracking fields
    Bank NVARCHAR(255) NULL,
    StartDate DATE NULL,
    UnitCount INT NULL,
    PreConManagerId INT NULL,
    ConstructionLoanClosingDate DATE NULL,
    Notes NVARCHAR(MAX) NULL,
    Priority NVARCHAR(20) NULL,
    
    -- Land Development specific fields
    Acreage DECIMAL(18,4) NULL,
    LandPrice DECIMAL(18,2) NULL,
    SqFtPrice DECIMAL(18,2) NULL,
    ExecutionDate DATE NULL,
    DueDiligenceDate DATE NULL,
    ClosingDate DATE NULL,
    PurchasingEntity NVARCHAR(255) NULL,
    Cash BIT NULL,
    OpportunityZone BIT NULL,
    ClosingNotes NVARCHAR(MAX) NULL,
    
    -- Site Tracking Worksheet fields (deal pipeline tracked data points)
    County NVARCHAR(100) NULL,
    ZipCode NVARCHAR(20) NULL,
    MFAcreage DECIMAL(18,4) NULL,
    Zoning NVARCHAR(100) NULL,
    Zoned NVARCHAR(20) NULL,           -- Yes, No, Partially
    ListingStatus NVARCHAR(50) NULL,   -- Listed, Unlisted
    PriceRaw NVARCHAR(100) NULL,       -- Free-form price e.g. "-", "$1.2M", "TBD"
    BrokerReferralSource NVARCHAR(255) NULL,
    RejectedReason NVARCHAR(500) NULL,
    
    -- Location (from KMZ attachments)
    Latitude DECIMAL(18,8) NULL,
    Longitude DECIMAL(18,8) NULL,
    
    -- Asana metadata
    AsanaTaskGid NVARCHAR(100) NULL,
    AsanaProjectGid NVARCHAR(100) NULL,
    
    -- Timestamps
    CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt DATETIME2(0) NULL,
    
    CONSTRAINT FK_DP_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId) ON DELETE CASCADE,
    CONSTRAINT FK_DP_BrokerReferralContact FOREIGN KEY (BrokerReferralContactId) REFERENCES pipeline.BrokerReferralContact(BrokerReferralContactId),
    CONSTRAINT FK_DP_PreConManager FOREIGN KEY (PreConManagerId) REFERENCES core.PreConManager(PreConManagerId),
    CONSTRAINT UQ_DP_Project UNIQUE (ProjectId),
    CONSTRAINT CK_DP_Priority CHECK (Priority IS NULL OR Priority IN ('High', 'Medium', 'Low'))
);

CREATE INDEX IX_DealPipeline_ProjectId ON pipeline.DealPipeline(ProjectId);
CREATE INDEX IX_DealPipeline_BrokerReferralContactId ON pipeline.DealPipeline(BrokerReferralContactId);
CREATE INDEX IX_DealPipeline_Bank ON pipeline.DealPipeline(Bank);
CREATE INDEX IX_DealPipeline_PreConManagerId ON pipeline.DealPipeline(PreConManagerId);
CREATE INDEX IX_DealPipeline_StartDate ON pipeline.DealPipeline(StartDate);
CREATE INDEX IX_DealPipeline_AsanaTaskGid ON pipeline.DealPipeline(AsanaTaskGid);

-- ============================================================
-- PIPELINE: DEAL PIPELINE ATTACHMENTS (files attached to deals)
-- ============================================================
CREATE TABLE pipeline.DealPipelineAttachment (
    DealPipelineAttachmentId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DealPipelineAttachment PRIMARY KEY,
    DealPipelineId INT NOT NULL,
    FileName NVARCHAR(255) NOT NULL,
    StoragePath NVARCHAR(1000) NOT NULL,
    ContentType NVARCHAR(100) NULL,
    FileSizeBytes BIGINT NULL,
    CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_DPA_DealPipeline FOREIGN KEY (DealPipelineId) REFERENCES pipeline.DealPipeline(DealPipelineId) ON DELETE CASCADE
);
CREATE INDEX IX_DealPipelineAttachment_DealPipelineId ON pipeline.DealPipelineAttachment(DealPipelineId);

PRINT 'Schema created successfully. ProjectID is now the source of truth.';

