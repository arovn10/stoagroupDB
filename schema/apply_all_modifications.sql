-- ============================================================
-- COMPREHENSIVE DATABASE MODIFICATIONS SCRIPT
-- Applies all necessary schema changes to the database
-- Safe to run multiple times (idempotent)
-- ============================================================
-- CORE datapoints: ProjectName, City, State, Region, Address, Units, BirthOrder, Stage
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
PRINT 'Additional modifications:';
PRINT '  ✓ Bank exposure fields (HQState, HoldLimit, PerDealLimit, Deposits)';
PRINT '  ✓ FinancingStage in banking.Loan';
PRINT '  ✓ IMSInvestorProfileId in core.EquityPartner';
PRINT '  ✓ Authentication table (auth.User) for Capital Markets access';
PRINT '';
PRINT 'Next steps:';
PRINT '  1. Run: npm run db:seed-auth-users (in api directory)';
PRINT '  2. Set JWT_SECRET in .env file for production';
PRINT '';
PRINT '============================================================';
