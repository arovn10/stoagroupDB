-- ============================================================
-- UPDATE COMMERCIAL LAND PROJECTS TO PRODUCT TYPE "LAND"
-- ============================================================
-- Sets ProductType to "Land" for commercial land projects
-- ============================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

PRINT '============================================================';
PRINT 'UPDATING COMMERCIAL LAND PROJECTS TO PRODUCT TYPE "LAND"';
PRINT '============================================================';
PRINT '';

BEGIN TRY
    -- Projects to update
    DECLARE @ProjectsToUpdate TABLE (
        ProjectName NVARCHAR(255)
    );

    INSERT INTO @ProjectsToUpdate VALUES
    ('Mirage Ave. Crestview, FL 32536'),
    ('Remaining Freeport Retail'),
    ('Remaining Hammond Land'),
    ('Starbucks');

    -- Step 1: Validate which projects exist
    PRINT '📊 VALIDATION: Checking which projects exist...';
    PRINT '';

    SELECT 
        pt.ProjectName,
        CASE WHEN p.ProjectId IS NOT NULL THEN '✅ EXISTS' ELSE '❌ NOT FOUND' END AS Status,
        p.ProjectId,
        p.ProductType AS CurrentProductType,
        'Land' AS NewProductType
    FROM @ProjectsToUpdate pt
    LEFT JOIN core.Project p ON p.ProjectName = pt.ProjectName
    ORDER BY pt.ProjectName;

    PRINT '';
    PRINT '============================================================';
    PRINT 'UPDATING PRODUCT TYPE';
    PRINT '============================================================';
    PRINT '';

    -- Step 2: Update ProductType to "Land"
    UPDATE p
    SET ProductType = 'Land',
        UpdatedAt = SYSDATETIME()
    FROM core.Project p
    INNER JOIN @ProjectsToUpdate pt ON p.ProjectName = pt.ProjectName;

    DECLARE @UpdatedCount INT = @@ROWCOUNT;

    PRINT '✅ Updated ' + CAST(@UpdatedCount AS NVARCHAR(10)) + ' project(s) to ProductType "Land"';
    PRINT '';

    -- Step 3: Show updated projects
    PRINT '============================================================';
    PRINT 'UPDATED PROJECTS';
    PRINT '============================================================';
    PRINT '';

    SELECT 
        p.ProjectName,
        p.City,
        p.State,
        p.Region,
        p.ProductType,
        p.Stage,
        p.UpdatedAt
    FROM core.Project p
    INNER JOIN @ProjectsToUpdate pt ON p.ProjectName = pt.ProjectName
    ORDER BY p.ProjectName;

    -- Summary
    DECLARE @TotalExpected INT = (SELECT COUNT(*) FROM @ProjectsToUpdate);
    DECLARE @ProjectsFound INT = (
        SELECT COUNT(*) 
        FROM @ProjectsToUpdate pt 
        INNER JOIN core.Project p ON p.ProjectName = pt.ProjectName
    );

    PRINT '';
    PRINT '============================================================';
    PRINT 'SUMMARY';
    PRINT '============================================================';
    PRINT '   - Projects expected: ' + CAST(@TotalExpected AS NVARCHAR(10));
    PRINT '   - Projects found: ' + CAST(@ProjectsFound AS NVARCHAR(10));
    PRINT '   - Projects updated: ' + CAST(@UpdatedCount AS NVARCHAR(10));
    PRINT '';

    IF @ProjectsFound < @TotalExpected
    BEGIN
        PRINT '⚠️  WARNING: Some projects were not found in the database!';
        PRINT '   Missing projects:';
        SELECT pt.ProjectName
        FROM @ProjectsToUpdate pt
        LEFT JOIN core.Project p ON p.ProjectName = pt.ProjectName
        WHERE p.ProjectId IS NULL;
    END
    ELSE
    BEGIN
        PRINT '✅ All projects found and updated successfully!';
    END

    PRINT '============================================================';

END TRY
BEGIN CATCH
    PRINT '❌ ERROR:';
    PRINT '   ' + ERROR_MESSAGE();
    PRINT '   Error Number: ' + CAST(ERROR_NUMBER() AS NVARCHAR(10));
    PRINT '   Error Line: ' + CAST(ERROR_LINE() AS NVARCHAR(10));
    THROW;
END CATCH
GO
