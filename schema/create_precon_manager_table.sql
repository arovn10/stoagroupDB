-- ============================================================
-- CORE: PRE-CON MANAGER TABLE
-- ============================================================
-- Separate datapoint for Pre-Con Managers (Land Development)
-- Not tied to core.Person contacts
-- ============================================================

SET NOCOUNT ON;

-- Create PreConManager table
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
    
    -- Create index
    CREATE INDEX IX_PreConManager_FullName ON core.PreConManager(FullName);
    
    PRINT '✓ Created core.PreConManager table';
END
ELSE
BEGIN
    PRINT '✓ core.PreConManager table already exists';
END
GO
