-- ============================================================
-- LEASING VELOCITY: schema and tables for Domo dataset storage
-- Sync from dashboard: once per day per dataset, or when data hash changes
-- ============================================================

SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'leasing')
  EXEC('CREATE SCHEMA leasing');

-- ============================================================
-- Sync tracking: one row per dataset alias; sync once per day unless data changed
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'leasing' AND t.name = 'SyncLog')
CREATE TABLE leasing.SyncLog (
  SyncLogId     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_leasing_SyncLog PRIMARY KEY,
  DatasetAlias  NVARCHAR(64) NOT NULL CONSTRAINT UQ_leasing_SyncLog_Alias UNIQUE,
  LastSyncAt    DATETIME2(0) NOT NULL,
  LastSyncDate  DATE NOT NULL,           -- calendar date of last sync
  LastDataHash  NVARCHAR(64) NULL,       -- hash of payload; if different on same day, allow one more sync
  LastRowCount  INT NULL,
  UpdatedAt     DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

-- ============================================================
-- leasing (alias: leasing) - Property, Units, LeasesNeeded, 7/28-day velocity, MonthOf, BatchTimestamp
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'leasing' AND t.name = 'Leasing')
CREATE TABLE leasing.Leasing (
  Id             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_leasing_Leasing PRIMARY KEY,
  Property       NVARCHAR(255) NULL,
  Units          INT NULL,
  LeasesNeeded   INT NULL,
  NewLeasesCurrentGrossRent FLOAT NULL,
  LeasingVelocity7Day       FLOAT NULL,
  LeasingVelocity28Day      FLOAT NULL,
  MonthOf        NVARCHAR(50) NULL,
  BatchTimestamp NVARCHAR(100) NULL,
  SyncedAt       DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

-- ============================================================
-- MMRData - MMR / box score dataset
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'leasing' AND t.name = 'MMRData')
CREATE TABLE leasing.MMRData (
  Id                                 INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_leasing_MMRData PRIMARY KEY,
  Property                           NVARCHAR(255) NULL,
  Location                           NVARCHAR(255) NULL,
  TotalUnits                         INT NULL,
  OccupancyPercent                   FLOAT NULL,
  CurrentLeasedPercent               FLOAT NULL,
  MI                                 INT NULL,
  MO                                 INT NULL,
  FirstVisit                         INT NULL,
  Applied                            INT NULL,
  Canceled                           INT NULL,
  Denied                             INT NULL,
  T12LeasesExpired                   INT NULL,
  T12LeasesRenewed                   INT NULL,
  Delinquent                         INT NULL,
  OccupiedRent                       FLOAT NULL,
  BudgetedRent                       FLOAT NULL,
  CurrentMonthIncome                 FLOAT NULL,
  BudgetedIncome                     FLOAT NULL,
  MoveInRent                         FLOAT NULL,
  OccUnits                           INT NULL,
  Week3EndDate                       NVARCHAR(50) NULL,
  Week3MoveIns                        INT NULL,
  Week3MoveOuts                       INT NULL,
  Week3OccUnits                       INT NULL,
  Week3OccPercent                     FLOAT NULL,
  Week4EndDate                        NVARCHAR(50) NULL,
  Week4MoveIns                        INT NULL,
  Week4MoveOuts                       INT NULL,
  Week4OccUnits                       INT NULL,
  Week4OccPercent                     FLOAT NULL,
  Week7EndDate                        NVARCHAR(50) NULL,
  Week7MoveIns                        INT NULL,
  Week7MoveOuts                       INT NULL,
  Week7OccUnits                       INT NULL,
  Week7OccPercent                     FLOAT NULL,
  InServiceUnits                      INT NULL,
  T12LeaseBreaks                      INT NULL,
  BudgetedOccupancyCurrentMonth        INT NULL,
  BudgetedOccupancyPercentCurrentMonth FLOAT NULL,
  BudgetedLeasedPercentCurrentMonth    FLOAT NULL,
  BudgetedLeasedCurrentMonth           INT NULL,
  ReportDate                          NVARCHAR(50) NULL,
  ConstructionStatus                   NVARCHAR(100) NULL,
  Rank                                 INT NULL,
  PreviousOccupancyPercent             FLOAT NULL,
  PreviousLeasedPercent                FLOAT NULL,
  PreviousDelinquentUnits              INT NULL,
  WeekStart                            NVARCHAR(50) NULL,
  LatestDate                           NVARCHAR(50) NULL,
  City                                 NVARCHAR(100) NULL,
  State                                NVARCHAR(50) NULL,
  Status                               NVARCHAR(50) NULL,
  FinancingStatus                      NVARCHAR(100) NULL,
  ProductType                          NVARCHAR(100) NULL,
  Units                                INT NULL,
  FullAddress                          NVARCHAR(500) NULL,
  Latitude                             FLOAT NULL,
  Longitude                            FLOAT NULL,
  Region                               NVARCHAR(50) NULL,
  LatestConstructionStatus             NVARCHAR(100) NULL,
  BirthOrder                           INT NULL,
  NetLsd                               FLOAT NULL,
  SyncedAt                             DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

-- ============================================================
-- UnitByUnitTradeout (alias: unitbyunittradeout)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'leasing' AND t.name = 'UnitByUnitTradeout')
CREATE TABLE leasing.UnitByUnitTradeout (
  Id                              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_leasing_UnitByUnitTradeout PRIMARY KEY,
  FloorPlan                       NVARCHAR(255) NULL,
  UnitDetailsUnitType             NVARCHAR(100) NULL,
  UnitDetailsBuilding             NVARCHAR(100) NULL,
  UnitDetailsUnit                 NVARCHAR(100) NULL,
  UnitDetailsSqFt                 FLOAT NULL,
  CurrentLeaseRateType            NVARCHAR(100) NULL,
  CurrentLeaseLeaseType           NVARCHAR(100) NULL,
  CurrentLeaseAppSignedDate       NVARCHAR(50) NULL,
  CurrentLeaseLeaseStart          NVARCHAR(50) NULL,
  CurrentLeaseLeaseEnd            NVARCHAR(50) NULL,
  CurrentLeaseTerm                INT NULL,
  CurrentLeasePrem                FLOAT NULL,
  CurrentLeaseGrossRent           FLOAT NULL,
  CurrentLeaseConc                FLOAT NULL,
  CurrentLeaseEffRent             FLOAT NULL,
  PreviousLeaseRateType           NVARCHAR(100) NULL,
  PreviousLeaseLeaseStart         NVARCHAR(50) NULL,
  PreviousLeaseScheduledLeaseEnd  NVARCHAR(50) NULL,
  PreviousLeaseActualLeaseEnd     NVARCHAR(50) NULL,
  PreviousLeaseTerm               INT NULL,
  PreviousLeasePrem               FLOAT NULL,
  PreviousLeaseGrossRent          FLOAT NULL,
  PreviousLeaseConc               FLOAT NULL,
  PreviousLeaseEffRent            FLOAT NULL,
  VacantDays                      INT NULL,
  TermVariance                    FLOAT NULL,
  TradeOutPercentage              FLOAT NULL,
  TradeOutAmount                  FLOAT NULL,
  ReportDate                      NVARCHAR(50) NULL,
  JoinDate                        NVARCHAR(50) NULL,
  MonthOf                         NVARCHAR(50) NULL,
  Property                        NVARCHAR(255) NULL,
  City                            NVARCHAR(100) NULL,
  State                           NVARCHAR(50) NULL,
  Status                          NVARCHAR(50) NULL,
  Units                           INT NULL,
  FullAddress                     NVARCHAR(500) NULL,
  Latitude                        FLOAT NULL,
  Longitude                       FLOAT NULL,
  Region                          NVARCHAR(50) NULL,
  ConstructionStatus              NVARCHAR(100) NULL,
  BirthOrder                      INT NULL,
  SyncedAt                        DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

-- ============================================================
-- PortfolioUnitDetails (alias: portfolioUnitDetails)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'leasing' AND t.name = 'PortfolioUnitDetails')
CREATE TABLE leasing.PortfolioUnitDetails (
  Id                           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_leasing_PortfolioUnitDetails PRIMARY KEY,
  Property                     NVARCHAR(255) NULL,
  UnitNumber                   NVARCHAR(50) NULL,
  FloorPlan                    NVARCHAR(255) NULL,
  UnitDesignation              NVARCHAR(100) NULL,
  SQFT                         FLOAT NULL,
  UnitLeaseStatus              NVARCHAR(255) NULL,
  ResidentNameExternalTenantID NVARCHAR(255) NULL,
  LeaseID                      NVARCHAR(100) NULL,
  MoveIn                       NVARCHAR(50) NULL,
  Notice                       NVARCHAR(50) NULL,
  MoveOut                      NVARCHAR(50) NULL,
  DaysVacant                   INT NULL,
  MakeReady                    NVARCHAR(50) NULL,
  MakeReadyDaystoComplete      INT NULL,
  LeaseStart                   NVARCHAR(50) NULL,
  Leaseend                     NVARCHAR(50) NULL,
  ApplicationDate              NVARCHAR(50) NULL,
  LeaseType                    NVARCHAR(100) NULL,
  MarketRent                   FLOAT NULL,
  LeaseRent                    FLOAT NULL,
  EffectiveRent                 FLOAT NULL,
  Concession                    FLOAT NULL,
  SubsidyRent                  FLOAT NULL,
  Amenities                    NVARCHAR(255) NULL,
  TotalBilling                 FLOAT NULL,
  UnitText                     NVARCHAR(100) NULL,
  firstFloorDesignator         NVARCHAR(50) NULL,
  floor                        NVARCHAR(50) NULL,
  ReportDate                   NVARCHAR(50) NULL,
  BATCHLASTRUN                 NVARCHAR(100) NULL,
  SyncedAt                     DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

-- ============================================================
-- Units (alias: units)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'leasing' AND t.name = 'Units')
CREATE TABLE leasing.Units (
  Id                            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_leasing_Units PRIMARY KEY,
  PropertyName                  NVARCHAR(255) NULL,
  FloorPlan                     NVARCHAR(255) NULL,
  UnitType                      NVARCHAR(100) NULL,
  BldgUnit                      NVARCHAR(100) NULL,
  SqFt                          FLOAT NULL,
  Features                      NVARCHAR(500) NULL,
  Condition                     NVARCHAR(100) NULL,
  Vacated                       NVARCHAR(50) NULL,
  DateAvailable                 NVARCHAR(50) NULL,
  BestPriceTerm                 NVARCHAR(100) NULL,
  Monthlygrossrent              FLOAT NULL,
  Concessions                   NVARCHAR(255) NULL,
  MonthlyEffectiveRent          FLOAT NULL,
  PreviousLeaseTerm             INT NULL,
  PreviousLeaseMonthlyEffectiveRent FLOAT NULL,
  GrossForecastedTradeout       FLOAT NULL,
  ReportDate                    NVARCHAR(50) NULL,
  SyncedAt                      DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

-- ============================================================
-- UnitMix (alias: unitmix)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'leasing' AND t.name = 'UnitMix')
CREATE TABLE leasing.UnitMix (
  Id                          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_leasing_UnitMix PRIMARY KEY,
  PropertyName                NVARCHAR(255) NULL,
  UnitType                    NVARCHAR(100) NULL,
  TotalUnits                  INT NULL,
  SquareFeet                  FLOAT NULL,
  PercentOccupied             FLOAT NULL,
  percentLeased               FLOAT NULL,
  GrossOfferedRent30days      FLOAT NULL,
  GrossInPlaceRent            FLOAT NULL,
  GrossRecentExecutedRent60days FLOAT NULL,
  GrossOfferedRentPSF         FLOAT NULL,
  GrossRecentExecutedRentPSF   FLOAT NULL,
  ReportDate                  NVARCHAR(50) NULL,
  FloorPlan                   NVARCHAR(255) NULL,
  SyncedAt                    DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

-- ============================================================
-- Pricing (alias: pricing)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'leasing' AND t.name = 'Pricing')
CREATE TABLE leasing.Pricing (
  Id                                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_leasing_Pricing PRIMARY KEY,
  Property                            NVARCHAR(255) NULL,
  FloorPlan                           NVARCHAR(255) NULL,
  RateType                            NVARCHAR(100) NULL,
  PostDate                            NVARCHAR(50) NULL,
  EndDate                             NVARCHAR(50) NULL,
  DaysLeft                            INT NULL,
  CapacityActualUnits                 INT NULL,
  CapacitySustainablePercentage       FLOAT NULL,
  CapacitySustainableUnits            INT NULL,
  CurrentInPlaceLeases                INT NULL,
  CurrentInPlaceOcc                   FLOAT NULL,
  CurrentForecastLeases               INT NULL,
  CurrentForecastOcc                  FLOAT NULL,
  RecommendedForecastLeases           INT NULL,
  RecommendedForecastOcc              FLOAT NULL,
  RecommendedForecastChg              FLOAT NULL,
  YesterdayDate                       NVARCHAR(50) NULL,
  YesterdayRent                       FLOAT NULL,
  YesterdayPercentage                 FLOAT NULL,
  AmenityNormModelRent                FLOAT NULL,
  AmenityNormAmenAdj                  FLOAT NULL,
  RecommendationsRecommendedEffRent  FLOAT NULL,
  RecommendationsRecommendedEffPercentage FLOAT NULL,
  RecommendationsChangeRent           FLOAT NULL,
  RecommendationsChangeRev            FLOAT NULL,
  RecommendationsRecentAvgEffRent      FLOAT NULL,
  RecommendationsRecentAvgEffPercentage FLOAT NULL,
  SyncedAt                            DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

-- ============================================================
-- RecentRents (alias: recentrents) - recents / individual leases
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'leasing' AND t.name = 'RecentRents')
CREATE TABLE leasing.RecentRents (
  Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_leasing_RecentRents PRIMARY KEY,
  Property        NVARCHAR(255) NULL,
  FloorPlan       NVARCHAR(255) NULL,
  ApplicationDate NVARCHAR(50) NULL,
  EffectiveDate   NVARCHAR(50) NULL,
  LeaseStart      NVARCHAR(50) NULL,
  LeaseEnd        NVARCHAR(50) NULL,
  GrossRent       FLOAT NULL,
  EffectiveRent   FLOAT NULL,
  ReportDate      NVARCHAR(50) NULL,
  SyncedAt        DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

-- Indexes for common filters (property, report date) - idempotent
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_Leasing_Property' AND object_id = OBJECT_ID('leasing.Leasing'))
  CREATE NONCLUSTERED INDEX IX_leasing_Leasing_Property ON leasing.Leasing(Property);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_MMRData_Property' AND object_id = OBJECT_ID('leasing.MMRData'))
  CREATE NONCLUSTERED INDEX IX_leasing_MMRData_Property ON leasing.MMRData(Property);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_UnitByUnitTradeout_Property' AND object_id = OBJECT_ID('leasing.UnitByUnitTradeout'))
  CREATE NONCLUSTERED INDEX IX_leasing_UnitByUnitTradeout_Property ON leasing.UnitByUnitTradeout(Property);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_PortfolioUnitDetails_Property' AND object_id = OBJECT_ID('leasing.PortfolioUnitDetails'))
  CREATE NONCLUSTERED INDEX IX_leasing_PortfolioUnitDetails_Property ON leasing.PortfolioUnitDetails(Property);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_PortfolioUnitDetails_ReportDate' AND object_id = OBJECT_ID('leasing.PortfolioUnitDetails'))
  CREATE NONCLUSTERED INDEX IX_leasing_PortfolioUnitDetails_ReportDate ON leasing.PortfolioUnitDetails(ReportDate);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_Units_PropertyName' AND object_id = OBJECT_ID('leasing.Units'))
  CREATE NONCLUSTERED INDEX IX_leasing_Units_PropertyName ON leasing.Units(PropertyName);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_UnitMix_PropertyName' AND object_id = OBJECT_ID('leasing.UnitMix'))
  CREATE NONCLUSTERED INDEX IX_leasing_UnitMix_PropertyName ON leasing.UnitMix(PropertyName);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_Pricing_Property' AND object_id = OBJECT_ID('leasing.Pricing'))
  CREATE NONCLUSTERED INDEX IX_leasing_Pricing_Property ON leasing.Pricing(Property);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_RecentRents_Property' AND object_id = OBJECT_ID('leasing.RecentRents'))
  CREATE NONCLUSTERED INDEX IX_leasing_RecentRents_Property ON leasing.RecentRents(Property);
