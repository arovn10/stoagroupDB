-- ============================================================
-- Deal file subsections (per deal/project)
-- Banking dashboard: Load docs, Underwriting (only these shown in Banking UI)
-- Land development: Land, Design and Permits, Comp Validation, Contractor, Legal, Underwriting
-- This script allows all sections in DB so both Banking and Land Dev can store files.
-- Run as a single script (multiple batches). GO is required so Section is visible before adding the constraint.
-- ============================================================

SET NOCOUNT ON;

-- Step 1: Add Section column if it does not exist (must be in its own batch so constraint can reference it)
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('banking.BankingFile') AND name = 'Section'
)
BEGIN
  ALTER TABLE banking.BankingFile
  ADD Section NVARCHAR(80) NULL;
  PRINT 'Added column banking.BankingFile.Section.';
END
GO

-- Step 2: Add or replace the check constraint (Section is now visible)
SET NOCOUNT ON;

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_BankingFile_Section')
  ALTER TABLE banking.BankingFile DROP CONSTRAINT CK_BankingFile_Section;

ALTER TABLE banking.BankingFile
ADD CONSTRAINT CK_BankingFile_Section CHECK (
  Section IS NULL
  OR Section IN (
    N'Load docs',
    N'Underwriting',
    N'Land',
    N'Design and Permits',
    N'Comp Validation',
    N'Contractor',
    N'Legal'
  )
);
PRINT 'CK_BankingFile_Section applied.';
GO

-- Step 3: Create index if it does not exist
SET NOCOUNT ON;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('banking.BankingFile') AND name = 'IX_BankingFile_ProjectId_Section'
)
BEGIN
  CREATE INDEX IX_BankingFile_ProjectId_Section ON banking.BankingFile(ProjectId, Section);
  PRINT 'Created index IX_BankingFile_ProjectId_Section.';
END
GO
