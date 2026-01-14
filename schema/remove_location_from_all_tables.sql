-- ============================================================
-- REMOVE LOCATION COLUMN FROM ALL TABLES
-- Dynamically finds and removes Location column from any table that has it
-- Safe to run multiple times (idempotent)
-- ============================================================
-- Location is redundant - use City, State, Region, and Address instead
-- ============================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

PRINT '============================================================';
PRINT 'Removing Location column from ALL tables';
PRINT '============================================================';
PRINT '';

DECLARE @TablesProcessed INT = 0;
DECLARE @TablesRemoved INT = 0;
DECLARE @Sql NVARCHAR(MAX);
DECLARE @SchemaName NVARCHAR(128);
DECLARE @TableName NVARCHAR(128);
DECLARE @FullTableName NVARCHAR(255);

-- Cursor to find all tables with Location column
DECLARE location_cursor CURSOR FOR
SELECT 
    SCHEMA_NAME(t.schema_id) AS SchemaName,
    t.name AS TableName,
    QUOTENAME(SCHEMA_NAME(t.schema_id)) + '.' + QUOTENAME(t.name) AS FullTableName
FROM sys.tables t
INNER JOIN sys.columns c ON c.object_id = t.object_id
WHERE c.name = 'Location'
  AND SCHEMA_NAME(t.schema_id) IN ('core', 'banking', 'pipeline', 'audit', 'auth')
ORDER BY SCHEMA_NAME(t.schema_id), t.name;

OPEN location_cursor;
FETCH NEXT FROM location_cursor INTO @SchemaName, @TableName, @FullTableName;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @TablesProcessed = @TablesProcessed + 1;
    
    PRINT 'Processing: ' + @FullTableName;
    
    -- Check if column still exists (might have been removed by previous run)
    IF EXISTS (
        SELECT 1 
        FROM sys.columns 
        WHERE object_id = OBJECT_ID(@FullTableName) 
        AND name = 'Location'
    )
    BEGIN
        -- Build dynamic SQL to drop the column
        SET @Sql = N'ALTER TABLE ' + @FullTableName + N' DROP COLUMN Location;';
        
        BEGIN TRY
            EXEC sp_executesql @Sql;
            SET @TablesRemoved = @TablesRemoved + 1;
            PRINT '   ✓ Removed Location column from ' + @FullTableName;
        END TRY
        BEGIN CATCH
            PRINT '   ✗ ERROR removing Location from ' + @FullTableName + ': ' + ERROR_MESSAGE();
        END CATCH
    END
    ELSE
    BEGIN
        PRINT '   ✓ Location column does not exist in ' + @FullTableName + ' (already removed)';
    END
    
    FETCH NEXT FROM location_cursor INTO @SchemaName, @TableName, @FullTableName;
END

CLOSE location_cursor;
DEALLOCATE location_cursor;

PRINT '';
PRINT '============================================================';
PRINT 'Location Column Removal Summary';
PRINT '============================================================';
PRINT 'Tables processed: ' + CAST(@TablesProcessed AS VARCHAR(10));
PRINT 'Columns removed: ' + CAST(@TablesRemoved AS VARCHAR(10));
PRINT '';

-- Verify no Location columns remain
DECLARE @RemainingCount INT;
SELECT @RemainingCount = COUNT(*)
FROM sys.tables t
INNER JOIN sys.columns c ON c.object_id = t.object_id
WHERE c.name = 'Location'
  AND SCHEMA_NAME(t.schema_id) IN ('core', 'banking', 'pipeline', 'audit', 'auth');

IF @RemainingCount = 0
BEGIN
    PRINT '✓ SUCCESS: No Location columns remain in any tables!';
    PRINT '';
    PRINT 'All Location columns have been removed.';
    PRINT 'Use City, State, Region, and Address fields instead.';
END
ELSE
BEGIN
    PRINT '⚠ WARNING: ' + CAST(@RemainingCount AS VARCHAR(10)) + ' Location column(s) still exist:';
    
    DECLARE remaining_cursor CURSOR FOR
    SELECT 
        SCHEMA_NAME(t.schema_id) + '.' + t.name AS TableName
    FROM sys.tables t
    INNER JOIN sys.columns c ON c.object_id = t.object_id
    WHERE c.name = 'Location'
      AND SCHEMA_NAME(t.schema_id) IN ('core', 'banking', 'pipeline', 'audit', 'auth');
    
    OPEN remaining_cursor;
    FETCH NEXT FROM remaining_cursor INTO @TableName;
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        PRINT '   - ' + @TableName;
        FETCH NEXT FROM remaining_cursor INTO @TableName;
    END
    
    CLOSE remaining_cursor;
    DEALLOCATE remaining_cursor;
END

PRINT '';
PRINT '============================================================';
PRINT 'Script completed!';
PRINT '============================================================';
PRINT '';
