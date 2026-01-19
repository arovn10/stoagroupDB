-- ============================================================
-- ADD FinancingType TO BANKING.PARTICIPATION
-- FinancingType should be 'Construction' or 'Permanent'
-- ============================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

PRINT '============================================================';
PRINT 'Adding FinancingType to banking.Participation';
PRINT '============================================================';
PRINT '';

BEGIN TRY
    -- ============================================================
    -- 1. ADD FinancingType COLUMN
    -- ============================================================
    PRINT '1. Adding FinancingType column...';
    
    IF NOT EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID('banking.Participation')
        AND name = 'FinancingType'
    )
    BEGIN
        ALTER TABLE banking.Participation
        ADD FinancingType NVARCHAR(30) NULL;
        
        PRINT '   ✓ Added FinancingType column';
    END
    ELSE
    BEGIN
        PRINT '   ✓ FinancingType column already exists';
    END
    PRINT '';
    
    -- ============================================================
    -- 2. ADD CHECK CONSTRAINT
    -- ============================================================
    PRINT '2. Adding CHECK constraint for FinancingType...';
    
    IF NOT EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE name = 'CK_Participation_FinancingType'
    )
    BEGIN
        ALTER TABLE banking.Participation
        ADD CONSTRAINT CK_Participation_FinancingType
        CHECK (FinancingType IS NULL OR FinancingType IN ('Construction', 'Permanent'));
        
        PRINT '   ✓ CHECK constraint added successfully!';
    END
    ELSE
    BEGIN
        PRINT '   ✓ CHECK constraint CK_Participation_FinancingType already exists';
    END
    PRINT '';
    
    -- ============================================================
    -- 3. SET DEFAULT TO 'Construction' FOR ALL EXISTING RECORDS
    -- ============================================================
    PRINT '3. Setting default FinancingType to ''Construction'' for all existing participations...';
    
    -- First, set based on Loan Phase if LoanId exists
    UPDATE p
    SET p.FinancingType = 
        CASE 
            WHEN l.LoanPhase = 'Construction' THEN 'Construction'
            WHEN l.LoanPhase = 'Permanent' THEN 'Permanent'
            ELSE 'Construction'
        END,
        p.UpdatedAt = SYSDATETIME()
    FROM banking.Participation p
    LEFT JOIN banking.Loan l ON p.LoanId = l.LoanId
    WHERE p.FinancingType IS NULL;
    
    -- Then, set any remaining NULLs to 'Construction'
    UPDATE banking.Participation
    SET FinancingType = 'Construction',
        UpdatedAt = SYSDATETIME()
    WHERE FinancingType IS NULL;
    
    DECLARE @UpdatedCount INT = @@ROWCOUNT;
    PRINT '   ✓ Set FinancingType to ''Construction'' for all existing participations';
    PRINT '';
    
    PRINT '============================================================';
    PRINT 'FinancingType added successfully!';
    PRINT '============================================================';
    PRINT '';
    PRINT 'FinancingType options: Construction, Permanent';
    PRINT '';

END TRY
BEGIN CATCH
    PRINT '❌ ERROR during FinancingType addition: ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO

-- Verification
PRINT 'Verifying current FinancingType values:';
SELECT
    CASE
        WHEN FinancingType IS NULL THEN 'NULL'
        ELSE FinancingType
    END AS FinancingTypeValue,
    COUNT(*) AS NumberOfParticipations
FROM banking.Participation
GROUP BY FinancingType
ORDER BY FinancingType;
GO
