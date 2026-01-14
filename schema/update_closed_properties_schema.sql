-- ============================================================
-- UPDATE CLOSED PROPERTIES SCHEMA
-- 1. Rename ClosingDate to LandClosingDate
-- 2. Remove Address column (Address is stored in CORE.Project)
-- 3. Remove Location column (Location is redundant - use City, State, Region, Address from CORE)
-- ============================================================

SET NOCOUNT ON;

PRINT 'Updating pipeline.ClosedProperty schema...';
PRINT '';

-- ============================================================
-- 1. RENAME ClosingDate TO LandClosingDate
-- ============================================================
PRINT '1. Renaming ClosingDate to LandClosingDate...';

IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.ClosedProperty') 
    AND name = 'ClosingDate'
    AND NOT EXISTS (
        SELECT 1 
        FROM sys.columns 
        WHERE object_id = OBJECT_ID('pipeline.ClosedProperty') 
        AND name = 'LandClosingDate'
    )
)
BEGIN
    EXEC sp_rename 'pipeline.ClosedProperty.ClosingDate', 'LandClosingDate', 'COLUMN';
    PRINT '   ✓ Renamed ClosingDate to LandClosingDate';
END
ELSE IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.ClosedProperty') 
    AND name = 'LandClosingDate'
)
BEGIN
    PRINT '   ✓ LandClosingDate column already exists';
END
ELSE
BEGIN
    -- If ClosingDate doesn't exist, add LandClosingDate
    ALTER TABLE pipeline.ClosedProperty
    ADD LandClosingDate DATE NULL;
    PRINT '   ✓ Added LandClosingDate column';
END
GO

-- ============================================================
-- 2. REMOVE Address COLUMN (Address is in CORE.Project)
-- ============================================================
PRINT '';
PRINT '2. Removing Address column (Address is stored in CORE.Project)...';

IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.ClosedProperty') 
    AND name = 'Address'
)
BEGIN
    ALTER TABLE pipeline.ClosedProperty
    DROP COLUMN Address;
    
    PRINT '   ✓ Removed Address column from pipeline.ClosedProperty';
    PRINT '   → Address is now stored in core.Project.Address';
END
ELSE
BEGIN
    PRINT '   ✓ Address column does not exist in pipeline.ClosedProperty (already removed)';
END
GO

-- ============================================================
-- 3. REMOVE Location COLUMN (REDUNDANT - use City, State, Region, Address from CORE)
-- ============================================================
PRINT '';
PRINT '3. Removing Location column (redundant - use City, State, Region, Address from CORE)...';

IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('pipeline.ClosedProperty') 
    AND name = 'Location'
)
BEGIN
    ALTER TABLE pipeline.ClosedProperty
    DROP COLUMN Location;
    
    PRINT '   ✓ Removed Location column from pipeline.ClosedProperty';
    PRINT '   → Location is redundant - use City, State, Region, Address from core.Project';
END
ELSE
BEGIN
    PRINT '   ✓ Location column does not exist in pipeline.ClosedProperty (already removed)';
END
GO

PRINT '';
PRINT 'Closed Properties schema update completed!';
PRINT 'Note: Address is now pulled from core.Project.Address';
PRINT 'Note: Closing Date is now stored as LandClosingDate';
PRINT 'Note: Location removed (redundant - use City, State, Region, Address from CORE)';
PRINT '';
