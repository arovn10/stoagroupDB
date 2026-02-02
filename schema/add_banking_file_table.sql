-- ============================================================
-- Banking Files: per-project file uploads for Banking Dashboard
-- (Loan agreements, amendments, banking-only documents.)
-- Keyed by ProjectId (same as Row in banking context).
-- ============================================================

SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'BankingFile' AND schema_id = SCHEMA_ID('banking'))
BEGIN
    CREATE TABLE banking.BankingFile (
        BankingFileId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_BankingFile PRIMARY KEY,
        ProjectId INT NOT NULL,
        FileName NVARCHAR(255) NOT NULL,
        ContentType NVARCHAR(100) NULL,
        FileSizeBytes BIGINT NULL,
        StoragePath NVARCHAR(1000) NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        CreatedByUserId INT NULL,
        CONSTRAINT FK_BankingFile_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId) ON DELETE CASCADE
    );
    CREATE INDEX IX_BankingFile_ProjectId ON banking.BankingFile(ProjectId);
    PRINT 'Created banking.BankingFile table';
END
ELSE
BEGIN
    PRINT 'banking.BankingFile table already exists';
END
GO
