-- ============================================================
-- ADD "HoldCo" STAGE AND APPLY TO LLC PROJECTS
-- ============================================================
-- Adds "HoldCo" as a special stage for holding company LLCs
-- Applies to: 210 E Morris Ave, LLC, Amor Fati, LLC, 
--             Bauerle Rd Land, LLC, Icarus Development, LLC
-- ============================================================

SET NOCOUNT ON;

PRINT '============================================================';
PRINT 'ADDING "HoldCo" STAGE TO LLC PROJECTS';
PRINT '============================================================';
PRINT '';

DECLARE @UpdatedCount INT = 0;

-- Update LLC projects to "HoldCo" stage
UPDATE core.Project
SET Stage = 'HoldCo',
    UpdatedAt = SYSDATETIME()
WHERE ProjectName IN (
    '210 E Morris Ave, LLC',
    'Amor Fati, LLC',
    'Bauerle Rd Land, LLC',
    'Icarus Development, LLC'
)
AND (Stage IS NULL OR Stage != 'HoldCo');

SET @UpdatedCount = @@ROWCOUNT;

PRINT 'Updated ' + CAST(@UpdatedCount AS NVARCHAR(10)) + ' project(s) to "HoldCo" stage';
PRINT '';

-- Show results
SELECT 
    ProjectId,
    ProjectName,
    City,
    State,
    Region,
    ProductType,
    Stage,
    UpdatedAt
FROM core.Project
WHERE ProjectName IN (
    '210 E Morris Ave, LLC',
    'Amor Fati, LLC',
    'Bauerle Rd Land, LLC',
    'Icarus Development, LLC'
)
ORDER BY ProjectName;

PRINT '';
PRINT '============================================================';
PRINT 'VALIDATION';
PRINT '============================================================';
PRINT '';

DECLARE @TotalExpected INT = 4;
DECLARE @ProjectsFound INT;
DECLARE @HoldCoCount INT;

SELECT @ProjectsFound = COUNT(*)
FROM core.Project
WHERE ProjectName IN (
    '210 E Morris Ave, LLC',
    'Amor Fati, LLC',
    'Bauerle Rd Land, LLC',
    'Icarus Development, LLC'
);

SELECT @HoldCoCount = COUNT(*)
FROM core.Project
WHERE ProjectName IN (
    '210 E Morris Ave, LLC',
    'Amor Fati, LLC',
    'Bauerle Rd Land, LLC',
    'Icarus Development, LLC'
)
AND Stage = 'HoldCo';

PRINT '   - Projects expected: ' + CAST(@TotalExpected AS NVARCHAR(10));
PRINT '   - Projects found: ' + CAST(@ProjectsFound AS NVARCHAR(10));
PRINT '   - Projects with HoldCo stage: ' + CAST(@HoldCoCount AS NVARCHAR(10));
PRINT '';

IF @HoldCoCount = @TotalExpected
BEGIN
    PRINT '✅ All LLC projects successfully updated to "HoldCo" stage';
END
ELSE
BEGIN
    PRINT '⚠️  Warning: Not all projects were updated. Please check the results above.';
END

PRINT '';
PRINT 'Complete!';
GO
