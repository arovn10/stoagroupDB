-- ============================================================
-- ADD IsCompleted BOOLEAN TO ALL COVENANT TABLES
-- Adds IsCompleted toggle to track completion status
-- ============================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

PRINT '============================================================';
PRINT 'Adding IsCompleted column to banking covenant tables';
PRINT '============================================================';
PRINT '';

BEGIN TRY
    -- ============================================================
    -- 1. ADD IsCompleted TO banking.Covenant
    -- ============================================================
    PRINT '1. Adding IsCompleted to banking.Covenant...';
    
    IF NOT EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID('banking.Covenant')
        AND name = 'IsCompleted'
    )
    BEGIN
        ALTER TABLE banking.Covenant
        ADD IsCompleted BIT NOT NULL DEFAULT 0;
        
        PRINT '   ✓ Added IsCompleted column (default: 0/false)';
    END
    ELSE
    BEGIN
        PRINT '   ✓ IsCompleted column already exists';
    END
    
    PRINT '';
    
    -- ============================================================
    -- 2. ADD IsCompleted TO banking.DSCRTest
    -- ============================================================
    PRINT '2. Adding IsCompleted to banking.DSCRTest...';
    
    IF NOT EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID('banking.DSCRTest')
        AND name = 'IsCompleted'
    )
    BEGIN
        ALTER TABLE banking.DSCRTest
        ADD IsCompleted BIT NOT NULL DEFAULT 0;
        
        PRINT '   ✓ Added IsCompleted column (default: 0/false)';
    END
    ELSE
    BEGIN
        PRINT '   ✓ IsCompleted column already exists';
    END
    
    PRINT '';
    
    -- ============================================================
    -- 3. ADD IsCompleted TO banking.LiquidityRequirement
    -- ============================================================
    PRINT '3. Adding IsCompleted to banking.LiquidityRequirement...';
    
    IF NOT EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID('banking.LiquidityRequirement')
        AND name = 'IsCompleted'
    )
    BEGIN
        ALTER TABLE banking.LiquidityRequirement
        ADD IsCompleted BIT NOT NULL DEFAULT 0;
        
        PRINT '   ✓ Added IsCompleted column (default: 0/false)';
    END
    ELSE
    BEGIN
        PRINT '   ✓ IsCompleted column already exists';
    END
    
    PRINT '';
    PRINT '============================================================';
    PRINT 'IsCompleted columns added successfully!';
    PRINT '============================================================';
    PRINT '';
    PRINT 'All existing records default to IsCompleted = 0 (false)';
    PRINT 'You can now toggle completion status via API or direct SQL';
    
END TRY
BEGIN CATCH
    PRINT '';
    PRINT '❌ ERROR: ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO
