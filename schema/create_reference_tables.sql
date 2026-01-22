-- ============================================================
-- CREATE REFERENCE TABLES FOR PRODUCT TYPES AND REGIONS
-- These are CORE reference tables that can be edited via API
-- Used for dropdowns in property core editor
-- ============================================================

SET NOCOUNT ON;

-- ============================================================
-- PRODUCT TYPE TABLE
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ProductType' AND schema_id = SCHEMA_ID('core'))
BEGIN
    CREATE TABLE core.ProductType (
        ProductTypeId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ProductType PRIMARY KEY,
        ProductTypeName NVARCHAR(50) NOT NULL CONSTRAINT UQ_ProductType_Name UNIQUE,
        DisplayOrder INT NULL DEFAULT 0,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        UpdatedAt DATETIME2(0) NULL,
        Notes NVARCHAR(MAX) NULL
    );
    
    PRINT 'Created core.ProductType table';
    
    -- Insert default product types
    INSERT INTO core.ProductType (ProductTypeName, DisplayOrder) VALUES
        ('Heights', 1),
        ('Prototype', 2),
        ('Flats', 3),
        ('Land', 4),
        ('Other', 5);
    
    PRINT 'Inserted default product types';
END
ELSE
BEGIN
    PRINT 'core.ProductType table already exists';
END
GO

-- ============================================================
-- REGION TABLE
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Region' AND schema_id = SCHEMA_ID('core'))
BEGIN
    CREATE TABLE core.Region (
        RegionId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Region PRIMARY KEY,
        RegionName NVARCHAR(50) NOT NULL CONSTRAINT UQ_Region_Name UNIQUE,
        DisplayOrder INT NULL DEFAULT 0,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        UpdatedAt DATETIME2(0) NULL,
        Notes NVARCHAR(MAX) NULL
    );
    
    PRINT 'Created core.Region table';
    
    -- Insert default regions
    INSERT INTO core.Region (RegionName, DisplayOrder) VALUES
        ('Gulf Coast', 1),
        ('Carolinas', 2);
    
    PRINT 'Inserted default regions';
END
ELSE
BEGIN
    PRINT 'core.Region table already exists';
END
GO

PRINT '';
PRINT 'Reference tables created successfully!';
PRINT 'These tables can now be managed via API endpoints.';
PRINT '';
