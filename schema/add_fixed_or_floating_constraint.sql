-- ============================================================
-- ADD CONSTRAINT FOR FixedOrFloating FIELD
-- Ensures FixedOrFloating can only be 'Fixed' or 'Floating'
-- ============================================================

SET NOCOUNT ON;

PRINT '============================================================';
PRINT 'Adding FixedOrFloating constraint';
PRINT '============================================================';
PRINT '';

-- ============================================================
-- 1. NORMALIZE EXISTING DATA
-- ============================================================
PRINT '1. Normalizing existing FixedOrFloating values...';

-- Normalize variations to standard values
UPDATE banking.Loan
SET FixedOrFloating = 'Fixed'
WHERE FixedOrFloating IN ('Fixed', 'FIXED', 'fixed', 'F', 'f');

UPDATE banking.Loan
SET FixedOrFloating = 'Floating'
WHERE FixedOrFloating IN ('Floating', 'FLOATING', 'floating', 'Float', 'FLOAT', 'FL', 'fl');

DECLARE @UpdatedCount INT = @@ROWCOUNT;
PRINT '   ✓ Normalized ' + CAST(@UpdatedCount AS VARCHAR(10)) + ' loan(s)';

-- ============================================================
-- 2. ADD CHECK CONSTRAINT
-- ============================================================
PRINT '';
PRINT '2. Adding CHECK constraint...';

-- Drop existing constraint if it exists
IF EXISTS (
    SELECT 1 
    FROM sys.check_constraints 
    WHERE name = 'CK_Loan_FixedOrFloating'
    AND parent_object_id = OBJECT_ID('banking.Loan')
)
BEGIN
    ALTER TABLE banking.Loan
    DROP CONSTRAINT CK_Loan_FixedOrFloating;
    PRINT '   ✓ Dropped existing constraint';
END

-- Add new constraint: FixedOrFloating must be NULL, 'Fixed', or 'Floating'
ALTER TABLE banking.Loan
ADD CONSTRAINT CK_Loan_FixedOrFloating 
CHECK (
    FixedOrFloating IS NULL 
    OR FixedOrFloating IN ('Fixed', 'Floating')
);

PRINT '   ✓ Added CHECK constraint: FixedOrFloating must be NULL, Fixed, or Floating';
GO

-- ============================================================
-- 3. VERIFY CONSTRAINT
-- ============================================================
PRINT '';
PRINT '3. Verifying constraint...';

DECLARE @InvalidCount INT;
SELECT @InvalidCount = COUNT(*)
FROM banking.Loan
WHERE FixedOrFloating IS NOT NULL
  AND FixedOrFloating NOT IN ('Fixed', 'Floating');

IF @InvalidCount = 0
BEGIN
    PRINT '   ✓ All loans have valid FixedOrFloating values (NULL, Fixed, or Floating)';
END
ELSE
BEGIN
    PRINT '   ⚠ WARNING: ' + CAST(@InvalidCount AS VARCHAR(10)) + ' loan(s) have invalid FixedOrFloating values';
    PRINT '   → These will need to be updated manually';
END
GO

-- ============================================================
-- 4. SHOW CURRENT DISTRIBUTION
-- ============================================================
PRINT '';
PRINT '4. Current FixedOrFloating distribution:';

SELECT 
    FixedOrFloating,
    COUNT(*) as Count
FROM banking.Loan
GROUP BY FixedOrFloating
ORDER BY FixedOrFloating;

GO

PRINT '';
PRINT '============================================================';
PRINT 'FixedOrFloating constraint added successfully!';
PRINT '============================================================';
PRINT '';
PRINT 'FixedOrFloating options:';
PRINT '   - NULL (not specified)';
PRINT '   - Fixed';
PRINT '   - Floating';
PRINT '';
