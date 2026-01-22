-- ============================================================
-- COMPREHENSIVE DATABASE MODIFICATIONS SCRIPT
-- Applies all necessary schema changes to the database
-- Safe to run multiple times (idempotent)
-- ============================================================
-- CORE datapoints: ProjectName, City, State, Region, Address, Units, BirthOrder, Stage
-- Note: Location column removed (redundant - use City, State, Region, Address instead)
-- ============================================================

SET NOCOUNT ON;
PRINT '============================================================';
PRINT 'Starting comprehensive database modifications...';
PRINT '============================================================';
PRINT '';

-- ============================================================
-- 0. VERIFY ALL CORE DATAPOINTS EXIST IN core.Project
-- ============================================================
PRINT '0. Verifying all CORE datapoints in core.Project...';

-- ProjectName (should already exist - required field)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Project') AND name = 'ProjectName')
    PRINT '   ✓ ProjectName exists';
ELSE
    PRINT '   ✗ ERROR: ProjectName missing! This is a required field.';

-- City (should already exist, but add if missing)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Project') AND name = 'City')
    PRINT '   ✓ City exists';
ELSE
BEGIN
    ALTER TABLE core.Project ADD City NVARCHAR(100) NULL;
    PRINT '   ✓ Added City column to core.Project';
END

-- State (should already exist, but add if missing)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Project') AND name = 'State')
    PRINT '   ✓ State exists';
ELSE
BEGIN
    ALTER TABLE core.Project ADD State NVARCHAR(50) NULL;
    PRINT '   ✓ Added State column to core.Project';
END

-- Region (should already exist, but add if missing)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Project') AND name = 'Region')
    PRINT '   ✓ Region exists';
ELSE
BEGIN
    ALTER TABLE core.Project ADD Region NVARCHAR(50) NULL;
    PRINT '   ✓ Added Region column to core.Project';
END

-- Address (CORE datapoint - add if missing)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Project') AND name = 'Address')
    PRINT '   ✓ Address exists';
ELSE
BEGIN
    ALTER TABLE core.Project ADD Address NVARCHAR(500) NULL;
    PRINT '   ✓ Added Address column to core.Project';
END

-- Units (should already exist, but add if missing)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Project') AND name = 'Units')
    PRINT '   ✓ Units exists';
ELSE
BEGIN
    ALTER TABLE core.Project ADD Units INT NULL;
    PRINT '   ✓ Added Units column to core.Project';
END

-- BirthOrder (CORE datapoint - will be added in section 2)
PRINT '   → BirthOrder will be verified in section 2';

-- Stage (should already exist, but add if missing)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Project') AND name = 'Stage')
    PRINT '   ✓ Stage exists';
ELSE
BEGIN
    ALTER TABLE core.Project ADD Stage NVARCHAR(50) NULL;
    PRINT '   ✓ Added Stage column to core.Project';
END
GO

-- ============================================================
-- 1. ADD BIRTH ORDER TO core.Project (CORE datapoint)
-- ============================================================
PRINT '';
PRINT '1. Checking BirthOrder field in core.Project...';

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('core.Project') 
    AND name = 'BirthOrder'
)
BEGIN
    ALTER TABLE core.Project
    ADD BirthOrder INT NULL;
    
    PRINT '   ✓ Added BirthOrder column to core.Project';
END
ELSE
BEGIN
    PRINT '   ✓ BirthOrder column already exists in core.Project';
END
GO

-- Create index for BirthOrder if it doesn't exist
IF NOT EXISTS (
    SELECT 1 
    FROM sys.indexes 
    WHERE name = 'IX_Project_BirthOrder' 
    AND object_id = OBJECT_ID('core.Project')
)
BEGIN
    CREATE INDEX IX_Project_BirthOrder ON core.Project(BirthOrder);
    PRINT '   ✓ Created index IX_Project_BirthOrder';
END
ELSE
BEGIN
    PRINT '   ✓ Index IX_Project_BirthOrder already exists';
END
GO

-- Migrate existing BirthOrder data from banking.Loan to core.Project
-- This takes the BirthOrder from the primary construction loan for each project
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Loan' AND schema_id = SCHEMA_ID('banking'))
BEGIN
    UPDATE p
    SET p.BirthOrder = l.BirthOrder
    FROM core.Project p
    INNER JOIN (
        SELECT 
            ProjectId,
            BirthOrder,
            ROW_NUMBER() OVER (PARTITION BY ProjectId ORDER BY 
                CASE WHEN LoanPhase = 'Construction' THEN 0 
                     WHEN LoanPhase = 'Land' THEN 1 
                     ELSE 2 END,
                LoanId
            ) AS rn
        FROM banking.Loan
        WHERE BirthOrder IS NOT NULL
    ) l ON p.ProjectId = l.ProjectId AND l.rn = 1
    WHERE p.BirthOrder IS NULL;
    
    PRINT '   ✓ Migrated BirthOrder data from banking.Loan to core.Project';
END
GO

-- ============================================================
-- 2. ADD BANK EXPOSURE FIELDS TO core.Bank
-- ============================================================
PRINT '';
PRINT '2. Checking bank exposure fields in core.Bank...';

-- HQState
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Bank') AND name = 'HQState')
BEGIN
    ALTER TABLE core.Bank ADD HQState NVARCHAR(50) NULL;
    PRINT '   ✓ Added HQState column to core.Bank';
END
ELSE
    PRINT '   ✓ HQState column already exists in core.Bank';

-- HoldLimit
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Bank') AND name = 'HoldLimit')
BEGIN
    ALTER TABLE core.Bank ADD HoldLimit DECIMAL(18,2) NULL;
    PRINT '   ✓ Added HoldLimit column to core.Bank';
END
ELSE
    PRINT '   ✓ HoldLimit column already exists in core.Bank';

-- PerDealLimit
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Bank') AND name = 'PerDealLimit')
BEGIN
    ALTER TABLE core.Bank ADD PerDealLimit DECIMAL(18,2) NULL;
    PRINT '   ✓ Added PerDealLimit column to core.Bank';
END
ELSE
    PRINT '   ✓ PerDealLimit column already exists in core.Bank';

-- Deposits
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Bank') AND name = 'Deposits')
BEGIN
    ALTER TABLE core.Bank ADD Deposits DECIMAL(18,2) NULL;
    PRINT '   ✓ Added Deposits column to core.Bank';
END
ELSE
    PRINT '   ✓ Deposits column already exists in core.Bank';
GO

-- ============================================================
-- 3. ADD FINANCING STAGE TO banking.Loan
-- ============================================================
PRINT '';
PRINT '3. Checking FinancingStage field in banking.Loan...';

IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('banking.Loan') 
    AND name = 'FinancingStage'
)
BEGIN
    ALTER TABLE banking.Loan
    ADD FinancingStage NVARCHAR(50) NULL;
    
    PRINT '   ✓ Added FinancingStage column to banking.Loan';
END
ELSE
BEGIN
    PRINT '   ✓ FinancingStage column already exists in banking.Loan';
END
GO

-- Update existing loans based on LoanPhase
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Loan' AND schema_id = SCHEMA_ID('banking'))
BEGIN
    UPDATE banking.Loan
    SET FinancingStage = CASE 
        WHEN LoanPhase = 'Construction' THEN 'Construction Loan'
        WHEN LoanPhase = 'Permanent' THEN 'Permanent Loan'
        WHEN LoanPhase = 'MiniPerm' THEN 'Construction Loan'
        WHEN LoanPhase = 'Land' THEN 'Construction Loan'
        ELSE 'Construction Loan'
    END
    WHERE FinancingStage IS NULL;
    
    PRINT '   ✓ Updated existing loans with default FinancingStage values';
END
GO

-- ============================================================
-- 4. ADD IMS INVESTOR PROFILE ID TO core.EquityPartner
-- ============================================================
PRINT '';
PRINT '4. Checking IMSInvestorProfileId field in core.EquityPartner...';

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('core.EquityPartner') 
    AND name = 'IMSInvestorProfileId'
)
BEGIN
    ALTER TABLE core.EquityPartner
    ADD IMSInvestorProfileId NVARCHAR(50) NULL;
    
    PRINT '   ✓ Added IMSInvestorProfileId column to core.EquityPartner';
END
ELSE
BEGIN
    PRINT '   ✓ IMSInvestorProfileId column already exists in core.EquityPartner';
END
GO

-- Create index for IMSInvestorProfileId if it doesn't exist
IF NOT EXISTS (
    SELECT 1 
    FROM sys.indexes 
    WHERE name = 'IX_EquityPartner_IMSInvestorProfileId' 
    AND object_id = OBJECT_ID('core.EquityPartner')
)
BEGIN
    CREATE INDEX IX_EquityPartner_IMSInvestorProfileId 
    ON core.EquityPartner(IMSInvestorProfileId);
    
    PRINT '   ✓ Created index IX_EquityPartner_IMSInvestorProfileId';
END
ELSE
BEGIN
    PRINT '   ✓ Index IX_EquityPartner_IMSInvestorProfileId already exists';
END
GO

-- ============================================================
-- 6. CREATE REFERENCE TABLES FOR PRODUCT TYPES AND REGIONS
-- ============================================================
PRINT '';
PRINT '6. Checking reference tables (ProductType, Region)...';

-- Product Type table
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ProductType' AND schema_id = SCHEMA_ID('core'))
BEGIN
    CREATE TABLE core.ProductType (
        ProductTypeId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ProductType PRIMARY KEY,
        ProductTypeName NVARCHAR(50) NOT NULL CONSTRAINT UQ_ProductType_Name UNIQUE,
        DisplayOrder INT NULL DEFAULT 0,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        UpdatedAt DATETIME2(0) NULL,
        Notes NVARCHAR(MAX) NULL
    );
    
    PRINT '   ✓ Created core.ProductType table';
    
    -- Insert default product types
    INSERT INTO core.ProductType (ProductTypeName, DisplayOrder) VALUES
        ('Heights', 1),
        ('Prototype', 2),
        ('Flats', 3),
        ('Land', 4),
        ('Other', 5);
    
    PRINT '   ✓ Inserted default product types';
END
ELSE
BEGIN
    PRINT '   ✓ core.ProductType table already exists';
END
GO

-- Region table
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Region' AND schema_id = SCHEMA_ID('core'))
BEGIN
    CREATE TABLE core.Region (
        RegionId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Region PRIMARY KEY,
        RegionName NVARCHAR(50) NOT NULL CONSTRAINT UQ_Region_Name UNIQUE,
        DisplayOrder INT NULL DEFAULT 0,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        UpdatedAt DATETIME2(0) NULL,
        Notes NVARCHAR(MAX) NULL
    );
    
    PRINT '   ✓ Created core.Region table';
    
    -- Insert default regions
    INSERT INTO core.Region (RegionName, DisplayOrder) VALUES
        ('Gulf Coast', 1),
        ('Carolinas', 2);
    
    PRINT '   ✓ Inserted default regions';
END
ELSE
BEGIN
    PRINT '   ✓ core.Region table already exists';
END
GO

-- ============================================================
-- 7. REMOVE LOCATION COLUMN (REDUNDANT)
-- ============================================================
PRINT '';
PRINT '7. Removing Location column from core.Project...';

IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('core.Project') 
    AND name = 'Location'
)
BEGIN
    ALTER TABLE core.Project DROP COLUMN Location;
    PRINT '   ✓ Removed Location column from core.Project';
END
ELSE
BEGIN
    PRINT '   ✓ Location column does not exist (already removed)';
END
GO

-- ============================================================
-- 8. UPDATE PIPELINE.UNDERCONTRACT FOR LAND DEVELOPMENT
-- ============================================================
PRINT '';
PRINT '8. Updating pipeline.UnderContract for Land Development...';

-- Remove redundant columns (Location, Region, Units) - pull from CORE instead
IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.UnderContract') 
    AND name = 'Location'
)
BEGIN
    ALTER TABLE pipeline.UnderContract DROP COLUMN Location;
    PRINT '   ✓ Removed Location column (use City/State from core.Project)';
END
ELSE
BEGIN
    PRINT '   ✓ Location column does not exist';
END
GO

IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.UnderContract') 
    AND name = 'Region'
)
BEGIN
    ALTER TABLE pipeline.UnderContract DROP COLUMN Region;
    PRINT '   ✓ Removed Region column (use core.Region table)';
END
ELSE
BEGIN
    PRINT '   ✓ Region column does not exist';
END
GO

IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.UnderContract') 
    AND name = 'Units'
)
BEGIN
    ALTER TABLE pipeline.UnderContract DROP COLUMN Units;
    PRINT '   ✓ Removed Units column (use Units from core.Project)';
END
ELSE
BEGIN
    PRINT '   ✓ Units column does not exist';
END
GO

-- Rename columns for clarity
IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.UnderContract') 
    AND name = 'Price'
)
BEGIN
    EXEC sp_rename 'pipeline.UnderContract.Price', 'LandPrice', 'COLUMN';
    PRINT '   ✓ Renamed Price to LandPrice';
END
ELSE IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.UnderContract') 
    AND name = 'LandPrice'
)
BEGIN
    PRINT '   ✓ LandPrice column already exists';
END
GO

IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.UnderContract') 
    AND name = 'PricePerSF'
)
BEGIN
    EXEC sp_rename 'pipeline.UnderContract.PricePerSF', 'SqFtPrice', 'COLUMN';
    PRINT '   ✓ Renamed PricePerSF to SqFtPrice';
END
ELSE IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.UnderContract') 
    AND name = 'SqFtPrice'
)
BEGIN
    PRINT '   ✓ SqFtPrice column already exists';
END
GO

IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.UnderContract') 
    AND name = 'CashFlag'
)
BEGIN
    EXEC sp_rename 'pipeline.UnderContract.CashFlag', 'Cash', 'COLUMN';
    PRINT '   ✓ Renamed CashFlag to Cash';
END
ELSE IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.UnderContract') 
    AND name = 'Cash'
)
BEGIN
    PRINT '   ✓ Cash column already exists';
END
GO

IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.UnderContract') 
    AND name = 'ExtensionNotes'
)
BEGIN
    EXEC sp_rename 'pipeline.UnderContract.ExtensionNotes', 'ClosingNotes', 'COLUMN';
    PRINT '   ✓ Renamed ExtensionNotes to ClosingNotes';
END
ELSE IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.UnderContract') 
    AND name = 'ClosingNotes'
)
BEGIN
    PRINT '   ✓ ClosingNotes column already exists';
END
GO

-- ============================================================
-- 9. UPDATE PIPELINE.COMMERCIALLISTED FOR LAND DEVELOPMENT
-- ============================================================
PRINT '';
PRINT '9. Updating pipeline.CommercialListed for Land Development...';

-- Remove redundant columns (Location) - pull from CORE instead
IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.CommercialListed') 
    AND name = 'Location'
)
BEGIN
    ALTER TABLE pipeline.CommercialListed DROP COLUMN Location;
    PRINT '   ✓ Removed Location column (use City/State from core.Project)';
END
ELSE
BEGIN
    PRINT '   ✓ Location column does not exist';
END
GO

-- Rename columns for clarity
IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.CommercialListed') 
    AND name = 'Price'
)
BEGIN
    EXEC sp_rename 'pipeline.CommercialListed.Price', 'LandPrice', 'COLUMN';
    PRINT '   ✓ Renamed Price to LandPrice';
END
ELSE IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.CommercialListed') 
    AND name = 'LandPrice'
)
BEGIN
    PRINT '   ✓ LandPrice column already exists';
END
GO

IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.CommercialListed') 
    AND name = 'Status'
)
BEGIN
    EXEC sp_rename 'pipeline.CommercialListed.Status', 'ListingStatus', 'COLUMN';
    PRINT '   ✓ Renamed Status to ListingStatus';
END
ELSE IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.CommercialListed') 
    AND name = 'ListingStatus'
)
BEGIN
    PRINT '   ✓ ListingStatus column already exists';
END
GO

-- ============================================================
-- 10. UPDATE PIPELINE.COMMERCIALACREAGE FOR LAND DEVELOPMENT
-- ============================================================
PRINT '';
PRINT '10. Updating pipeline.CommercialAcreage for Land Development...';

-- Remove redundant columns (Location) - pull from CORE instead
IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.CommercialAcreage') 
    AND name = 'Location'
)
BEGIN
    ALTER TABLE pipeline.CommercialAcreage DROP COLUMN Location;
    PRINT '   ✓ Removed Location column (use City/State from core.Project)';
END
ELSE
BEGIN
    PRINT '   ✓ Location column does not exist';
END
GO

-- ============================================================
-- SUMMARY
-- ============================================================
PRINT '';
PRINT '============================================================';
PRINT 'All database modifications completed successfully!';
PRINT '============================================================';
PRINT '';
PRINT 'Summary of CORE datapoints in core.Project:';
PRINT '  ✓ ProjectName (unique identifier)';
PRINT '  ✓ City';
PRINT '  ✓ State';
PRINT '  ✓ Region';
PRINT '  ✓ Address';
PRINT '  ✓ Units';
PRINT '  ✓ BirthOrder';
PRINT '  ✓ Stage';
PRINT '';
PRINT 'Removed:';
PRINT '  ✗ Location (redundant - use City, State, Region, Address instead)';
PRINT '';
PRINT 'Additional modifications:';
PRINT '  ✓ Bank exposure fields (HQState, HoldLimit, PerDealLimit, Deposits)';
PRINT '  ✓ FinancingStage in banking.Loan';
PRINT '  ✓ IMSInvestorProfileId in core.EquityPartner';
PRINT '  ✓ Authentication table (auth.User) for Capital Markets access';
PRINT '  ✓ Reference tables: core.ProductType and core.Region (for dropdowns)';
PRINT '';
PRINT 'Reference Tables Created:';
PRINT '  ✓ core.ProductType - Manage product types (Heights, Prototype, Flats, Other)';
PRINT '  ✓ core.Region - Manage regions (Gulf Coast, Carolinas)';
PRINT '  → Use API endpoints to add/edit/delete:';
PRINT '     GET/POST/PUT/DELETE /api/core/product-types';
PRINT '     GET/POST/PUT/DELETE /api/core/regions';
PRINT '';
PRINT 'Land Development Updates:';
PRINT '  ✓ pipeline.UnderContract - Removed redundant fields (Location, Region, Units)';
PRINT '  ✓ Now pulls CORE data from core.Project and core.Region';
PRINT '  ✓ Land Development specific fields: Acreage, LandPrice, SqFtPrice,';
PRINT '    ExecutionDate, DueDiligenceDate, ClosingDate, PurchasingEntity,';
PRINT '    Cash, OpportunityZone, ClosingNotes';
PRINT '  → SqFtPrice is auto-calculated: LandPrice / (Acreage * 43560)';
PRINT '  → Use API endpoints: GET/POST/PUT/DELETE /api/pipeline/under-contracts';
PRINT '';
PRINT '  ✓ pipeline.CommercialListed - Removed redundant fields (Location)';
PRINT '  ✓ Now pulls CORE data from core.Project';
PRINT '  ✓ Land Development specific fields: ListedDate, Acreage, LandPrice,';
PRINT '    ListingStatus (Available, Under Contract, Sold), DueDiligenceDate,';
PRINT '    ClosingDate, Owner, PurchasingEntity, Broker, Notes';
PRINT '  → Use API endpoints: GET/POST/PUT/DELETE /api/pipeline/commercial-listed';
PRINT '';
PRINT '  ✓ pipeline.CommercialAcreage - Removed redundant fields (Location)';
PRINT '  ✓ Now pulls CORE data from core.Project';
PRINT '  ✓ Land Development specific fields: Acreage, SquareFootage, BuildingFootprintSF';
PRINT '  → Use API endpoints: GET/POST/PUT/DELETE /api/pipeline/commercial-acreage';
PRINT '';
PRINT 'Next steps:';
PRINT '  1. Run: npm run db:seed-auth-users (in api directory)';
PRINT '  2. Set JWT_SECRET in .env file for production';
PRINT '  3. Use API to manage ProductTypes and Regions via dropdowns';
PRINT '  4. Use API to manage Land Development deals (Under Contract)';
PRINT '';
PRINT '============================================================';
