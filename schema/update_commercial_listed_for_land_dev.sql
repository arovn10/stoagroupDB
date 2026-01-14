-- ============================================================
-- UPDATE pipeline.CommercialListed FOR LAND DEVELOPMENT
-- Remove redundant fields (Location) - pull from CORE instead
-- Keep only Land Development specific attributes
-- ============================================================

SET NOCOUNT ON;

PRINT 'Updating pipeline.CommercialListed table for Land Development...';

-- Check if Location column exists and remove it (use City/State from CORE instead)
IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.CommercialListed') 
    AND name = 'Location'
)
BEGIN
    ALTER TABLE pipeline.CommercialListed DROP COLUMN Location;
    PRINT '✓ Removed Location column (use City/State from core.Project instead)';
END
ELSE
BEGIN
    PRINT '✓ Location column does not exist (already removed)';
END
GO

-- Rename Price to LandPrice for consistency with UnderContract
IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.CommercialListed') 
    AND name = 'Price'
)
BEGIN
    EXEC sp_rename 'pipeline.CommercialListed.Price', 'LandPrice', 'COLUMN';
    PRINT '✓ Renamed Price to LandPrice';
END
ELSE IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.CommercialListed') 
    AND name = 'LandPrice'
)
BEGIN
    PRINT '✓ LandPrice column already exists';
END
GO

-- Rename Status to ListingStatus for clarity
IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.CommercialListed') 
    AND name = 'Status'
)
BEGIN
    EXEC sp_rename 'pipeline.CommercialListed.Status', 'ListingStatus', 'COLUMN';
    PRINT '✓ Renamed Status to ListingStatus';
END
ELSE IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.CommercialListed') 
    AND name = 'ListingStatus'
)
BEGIN
    PRINT '✓ ListingStatus column already exists';
END
GO

PRINT '';
PRINT 'Commercial Listed table structure updated!';
PRINT 'Removed redundant fields: Location';
PRINT 'Location will now be pulled from core.Project (City, State)';
PRINT '';
PRINT 'Commercial Listed specific fields:';
PRINT '  - ListedDate';
PRINT '  - Acreage';
PRINT '  - LandPrice';
PRINT '  - ListingStatus (Available, Under Contract, Sold)';
PRINT '  - DueDiligenceDate';
PRINT '  - ClosingDate';
PRINT '  - Owner';
PRINT '  - PurchasingEntity';
PRINT '  - Broker';
PRINT '  - Notes';
PRINT '';
