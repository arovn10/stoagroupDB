-- ============================================================
-- ADD "LAND" PRODUCT TYPE
-- ============================================================
-- Adds "Land" as a new product type to core.ProductType table
-- Safe to run multiple times (idempotent)
-- ============================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

PRINT '============================================================';
PRINT 'ADDING "LAND" PRODUCT TYPE';
PRINT '============================================================';
PRINT '';

BEGIN TRY
    -- Check if ProductType table exists
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ProductType' AND schema_id = SCHEMA_ID('core'))
    BEGIN
        PRINT '❌ ERROR: core.ProductType table does not exist!';
        PRINT '   Please run schema/create_reference_tables.sql first.';
        PRINT '';
        RETURN;
    END

    -- Check if "Land" already exists
    IF EXISTS (SELECT 1 FROM core.ProductType WHERE ProductTypeName = 'Land')
    BEGIN
        PRINT '✅ Product Type "Land" already exists';
        PRINT '';
        
        -- Show current product types
        SELECT ProductTypeId, ProductTypeName, DisplayOrder, IsActive
        FROM core.ProductType
        ORDER BY DisplayOrder, ProductTypeName;
        
        PRINT '';
        PRINT '============================================================';
        PRINT 'No changes needed - "Land" product type already exists';
        PRINT '============================================================';
    END
    ELSE
    BEGIN
        -- Get max DisplayOrder to add Land at the end
        DECLARE @MaxDisplayOrder INT;
        SELECT @MaxDisplayOrder = ISNULL(MAX(DisplayOrder), 0) FROM core.ProductType;
        
        -- Insert "Land" product type
        INSERT INTO core.ProductType (ProductTypeName, DisplayOrder, IsActive)
        VALUES ('Land', @MaxDisplayOrder + 1, 1);
        
        PRINT '✅ Added "Land" product type';
        PRINT '';
        
        -- Show all product types
        SELECT ProductTypeId, ProductTypeName, DisplayOrder, IsActive
        FROM core.ProductType
        ORDER BY DisplayOrder, ProductTypeName;
        
        PRINT '';
        PRINT '============================================================';
        PRINT '✅ "Land" product type added successfully!';
        PRINT '============================================================';
    END

END TRY
BEGIN CATCH
    PRINT '❌ ERROR:';
    PRINT '   ' + ERROR_MESSAGE();
    PRINT '   Error Number: ' + CAST(ERROR_NUMBER() AS NVARCHAR(10));
    PRINT '   Error Line: ' + CAST(ERROR_LINE() AS NVARCHAR(10));
    THROW;
END CATCH
GO
