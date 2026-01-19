-- ============================================================
-- SEED PartnerType FOR ALL EQUITY PARTNERS
-- Sets PartnerType to 'Entity' if PartnerName contains 'LLC', otherwise 'Individual'
-- ============================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

PRINT '============================================================';
PRINT 'Seeding PartnerType for all equity partners';
PRINT '============================================================';
PRINT '';

BEGIN TRY
    -- Check current state
    PRINT '📊 Current State:';
    DECLARE @TotalCount INT;
    DECLARE @NullCount INT;
    DECLARE @EntityCount INT;
    DECLARE @IndividualCount INT;
    
    SELECT 
        @TotalCount = COUNT(*),
        @NullCount = SUM(CASE WHEN PartnerType IS NULL THEN 1 ELSE 0 END),
        @EntityCount = SUM(CASE WHEN PartnerType = 'Entity' THEN 1 ELSE 0 END),
        @IndividualCount = SUM(CASE WHEN PartnerType = 'Individual' THEN 1 ELSE 0 END)
    FROM core.EquityPartner;
    
    PRINT '   - Total Equity Partners: ' + CAST(@TotalCount AS NVARCHAR(10));
    PRINT '   - NULL PartnerType: ' + CAST(@NullCount AS NVARCHAR(10));
    PRINT '   - Already ''Entity'': ' + CAST(@EntityCount AS NVARCHAR(10));
    PRINT '   - Already ''Individual'': ' + CAST(@IndividualCount AS NVARCHAR(10));
    PRINT '';
    
    IF @NullCount = 0
    BEGIN
        PRINT '✅ All equity partners already have PartnerType set!';
        PRINT '';
        PRINT '============================================================';
        PRINT 'No updates needed.';
        PRINT '============================================================';
        RETURN;
    END
    
    -- Update PartnerType based on PartnerName containing 'LLC'
    PRINT '🔄 Setting PartnerType based on PartnerName...';
    PRINT '   - Partners with ''LLC'' in name → ''Entity''';
    PRINT '   - All others → ''Individual''';
    PRINT '';
    
    -- Set to 'Entity' if PartnerName contains 'LLC' (case-insensitive)
    UPDATE core.EquityPartner
    SET PartnerType = 'Entity'
    WHERE PartnerType IS NULL
      AND LOWER(PartnerName) LIKE '%llc%';
    
    DECLARE @EntityUpdated INT = @@ROWCOUNT;
    PRINT '   ✓ Set ' + CAST(@EntityUpdated AS NVARCHAR(10)) + ' partner(s) to ''Entity'' (contains LLC)';
    
    -- Set remaining NULLs to 'Individual'
    UPDATE core.EquityPartner
    SET PartnerType = 'Individual'
    WHERE PartnerType IS NULL;
    
    DECLARE @IndividualUpdated INT = @@ROWCOUNT;
    PRINT '   ✓ Set ' + CAST(@IndividualUpdated AS NVARCHAR(10)) + ' partner(s) to ''Individual''';
    PRINT '';
    
    -- Verify the update
    PRINT '📊 Final State:';
    SELECT 
        @TotalCount = COUNT(*),
        @NullCount = SUM(CASE WHEN PartnerType IS NULL THEN 1 ELSE 0 END),
        @EntityCount = SUM(CASE WHEN PartnerType = 'Entity' THEN 1 ELSE 0 END),
        @IndividualCount = SUM(CASE WHEN PartnerType = 'Individual' THEN 1 ELSE 0 END)
    FROM core.EquityPartner;
    
    PRINT '   - Total Equity Partners: ' + CAST(@TotalCount AS NVARCHAR(10));
    PRINT '   - NULL PartnerType: ' + CAST(@NullCount AS NVARCHAR(10));
    PRINT '   - ''Entity'': ' + CAST(@EntityCount AS NVARCHAR(10));
    PRINT '   - ''Individual'': ' + CAST(@IndividualCount AS NVARCHAR(10));
    PRINT '';
    
    IF @NullCount = 0
    BEGIN
        PRINT '✅ Success! All equity partners now have PartnerType set.';
    END
    ELSE
    BEGIN
        PRINT '⚠️  Warning: ' + CAST(@NullCount AS NVARCHAR(10)) + ' partner(s) still have NULL PartnerType';
    END
    
    PRINT '';
    PRINT '============================================================';
    PRINT 'PartnerType seeding completed!';
    PRINT '============================================================';
    PRINT '';

END TRY
BEGIN CATCH
    PRINT '❌ ERROR during PartnerType seeding: ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO

-- Show sample of updated partners
PRINT 'Sample of updated partners:';
SELECT TOP 10
    EquityPartnerId,
    PartnerName,
    PartnerType,
    CASE 
        WHEN LOWER(PartnerName) LIKE '%llc%' THEN '✓ Contains LLC'
        ELSE 'No LLC'
    END AS Classification
FROM core.EquityPartner
ORDER BY PartnerType, PartnerName;
GO
