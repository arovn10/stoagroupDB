-- ============================================================
-- ADD PartnerType TO EQUITY PARTNER
-- PartnerType should be 'Entity' or 'Individual'
-- ============================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

PRINT '============================================================';
PRINT 'Adding PartnerType to core.EquityPartner';
PRINT '============================================================';
PRINT '';

BEGIN TRY
    -- ============================================================
    -- 1. ADD PartnerType COLUMN
    -- ============================================================
    PRINT '1. Adding PartnerType column...';
    
    IF NOT EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID('core.EquityPartner')
        AND name = 'PartnerType'
    )
    BEGIN
        ALTER TABLE core.EquityPartner
        ADD PartnerType NVARCHAR(20) NULL;
        PRINT '   ✓ Added PartnerType column';
    END
    ELSE
    BEGIN
        PRINT '   ✓ PartnerType column already exists';
    END
    PRINT '';

END TRY
BEGIN CATCH
    PRINT '❌ ERROR during PartnerType column addition: ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO

-- ============================================================
-- 2. ADD CHECK CONSTRAINT
-- ============================================================
BEGIN TRY
    PRINT '2. Adding CHECK constraint for PartnerType...';
    
    IF NOT EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE name = 'CK_EquityPartner_PartnerType'
    )
    BEGIN
        ALTER TABLE core.EquityPartner
        ADD CONSTRAINT CK_EquityPartner_PartnerType
        CHECK (PartnerType IS NULL OR PartnerType IN ('Entity', 'Individual'));
        PRINT '   ✓ CHECK constraint added successfully!';
    END
    ELSE
    BEGIN
        PRINT '   ✓ CHECK constraint CK_EquityPartner_PartnerType already exists';
    END
    PRINT '';

    PRINT '============================================================';
    PRINT 'PartnerType added successfully!';
    PRINT '============================================================';
    PRINT '';
    PRINT 'PartnerType options: Entity, Individual';
    PRINT '';

END TRY
BEGIN CATCH
    PRINT '❌ ERROR during PartnerType addition: ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO
