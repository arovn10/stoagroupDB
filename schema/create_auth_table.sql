-- ============================================================
-- CREATE AUTHENTICATION TABLE FOR CAPITAL MARKETS USERS
-- Stores username/password for banking dashboard access
-- ============================================================

SET NOCOUNT ON;

-- Create auth schema if it doesn't exist
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'auth')
    EXEC('CREATE SCHEMA auth');
GO

-- Create User table
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'User' AND schema_id = SCHEMA_ID('auth'))
BEGIN
    CREATE TABLE auth.[User] (
        UserId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_User PRIMARY KEY,
        Username NVARCHAR(255) NOT NULL CONSTRAINT UQ_User_Username UNIQUE,
        PasswordHash NVARCHAR(255) NOT NULL,  -- bcrypt hash
        Email NVARCHAR(255) NULL,
        FullName NVARCHAR(255) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        LastLoginAt DATETIME2(0) NULL,
        UpdatedAt DATETIME2(0) NULL
    );
    
    PRINT 'Created auth.User table';
END
ELSE
BEGIN
    PRINT 'auth.User table already exists';
END
GO

-- Create index for username lookups
IF NOT EXISTS (
    SELECT 1 
    FROM sys.indexes 
    WHERE name = 'IX_User_Username' 
    AND object_id = OBJECT_ID('auth.User')
)
BEGIN
    CREATE INDEX IX_User_Username ON auth.[User](Username);
    PRINT 'Created index IX_User_Username';
END
ELSE
BEGIN
    PRINT 'Index IX_User_Username already exists';
END
GO

PRINT '';
PRINT 'Authentication table created successfully!';
PRINT 'Next: Run the seed script to create initial users.';
PRINT '';
