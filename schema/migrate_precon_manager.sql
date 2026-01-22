-- ============================================================
-- MIGRATION: PreConManager from core.Person to core.PreConManager
-- ============================================================
-- This script migrates PreConManager data from core.Person to the new core.PreConManager table
-- Safe to run multiple times (idempotent)
-- ============================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

PRINT '============================================================';
PRINT 'MIGRATING PRECON MANAGER TO SEPARATE TABLE';
PRINT '============================================================';
PRINT '';

BEGIN TRY
    -- Step 1: Create PreConManager table if it doesn't exist
    PRINT 'STEP 1: Creating core.PreConManager table...';
    
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PreConManager' AND schema_id = SCHEMA_ID('core'))
    BEGIN
        CREATE TABLE core.PreConManager (
            PreConManagerId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PreConManager PRIMARY KEY,
            FullName NVARCHAR(255) NOT NULL,
            Email    NVARCHAR(255) NULL,
            Phone    NVARCHAR(50) NULL,
            CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
            UpdatedAt DATETIME2(0) NULL
        );
        
        CREATE INDEX IX_PreConManager_FullName ON core.PreConManager(FullName);
        
        PRINT '   ✓ Created core.PreConManager table';
    END
    ELSE
    BEGIN
        PRINT '   ✓ core.PreConManager table already exists';
    END
    PRINT '';

    -- Step 2: Migrate PreConManager data from core.Person
    PRINT 'STEP 2: Migrating PreConManager data from core.Person...';
    PRINT '';
    
    -- Find all unique PreConManagers from DealPipeline
    INSERT INTO core.PreConManager (FullName, Email, Phone)
    SELECT DISTINCT
        p.FullName,
        p.Email,
        p.Phone
    FROM pipeline.DealPipeline dp
    INNER JOIN core.Person p ON dp.PreConManagerId = p.PersonId
    WHERE dp.PreConManagerId IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 
          FROM core.PreConManager pm 
          WHERE pm.FullName = p.FullName
      );
    
    DECLARE @MigratedCount INT = @@ROWCOUNT;
    PRINT '   ✓ Migrated ' + CAST(@MigratedCount AS NVARCHAR(10)) + ' PreConManager record(s)';
    PRINT '';

    -- Step 3: Update DealPipeline to use new PreConManagerId
    PRINT 'STEP 3: Updating DealPipeline to reference new PreConManager table...';
    PRINT '';
    
    -- First, drop the old foreign key constraint
    IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_DP_PreConManager')
    BEGIN
        ALTER TABLE pipeline.DealPipeline DROP CONSTRAINT FK_DP_PreConManager;
        PRINT '   ✓ Dropped old FK_DP_PreConManager constraint';
    END
    
    -- Update PreConManagerId values to match new table
    UPDATE dp
    SET dp.PreConManagerId = pm.PreConManagerId
    FROM pipeline.DealPipeline dp
    INNER JOIN core.Person p ON dp.PreConManagerId = p.PersonId
    INNER JOIN core.PreConManager pm ON p.FullName = pm.FullName
    WHERE dp.PreConManagerId IS NOT NULL;
    
    DECLARE @UpdatedCount INT = @@ROWCOUNT;
    PRINT '   ✓ Updated ' + CAST(@UpdatedCount AS NVARCHAR(10)) + ' DealPipeline record(s)';
    PRINT '';

    -- Step 4: Add new foreign key constraint
    PRINT 'STEP 4: Adding new foreign key constraint...';
    
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_DP_PreConManager')
    BEGIN
        ALTER TABLE pipeline.DealPipeline
        ADD CONSTRAINT FK_DP_PreConManager 
        FOREIGN KEY (PreConManagerId) REFERENCES core.PreConManager(PreConManagerId);
        PRINT '   ✓ Added new FK_DP_PreConManager constraint';
    END
    ELSE
    BEGIN
        PRINT '   ✓ FK_DP_PreConManager constraint already exists';
    END
    PRINT '';

    -- Summary
    PRINT '============================================================';
    PRINT 'MIGRATION SUMMARY';
    PRINT '============================================================';
    PRINT '   - PreConManagers migrated: ' + CAST(@MigratedCount AS NVARCHAR(10));
    PRINT '   - DealPipeline records updated: ' + CAST(@UpdatedCount AS NVARCHAR(10));
    PRINT '';
    PRINT '✅ Migration completed successfully!';
    PRINT '============================================================';
    PRINT '';

END TRY
BEGIN CATCH
    PRINT '❌ ERROR during migration:';
    PRINT '   ' + ERROR_MESSAGE();
    PRINT '';
    PRINT '   Error Number: ' + CAST(ERROR_NUMBER() AS NVARCHAR(10));
    PRINT '   Error Line: ' + CAST(ERROR_LINE() AS NVARCHAR(10));
    THROW;
END CATCH
GO

-- Verification
PRINT 'Verification:';
SELECT 
    COUNT(*) AS TotalPreConManagers,
    COUNT(DISTINCT FullName) AS UniqueNames
FROM core.PreConManager;

SELECT 
    COUNT(*) AS DealPipelinesWithPreConManager
FROM pipeline.DealPipeline
WHERE PreConManagerId IS NOT NULL;
GO
