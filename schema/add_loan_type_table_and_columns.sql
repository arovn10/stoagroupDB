-- Loan Creation Wizard: reference table for loan types (HUD, Conventional, etc.) and optional LoanCategory on Loan.
-- Run after 01_create_schema (banking.Loan exists).
-- Deploy this before deploying the API that uses GET/POST loan-types and LoanTypeId/LoanCategory on loans.

SET NOCOUNT ON;

-- 1. Create banking.LoanType if not exists
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE schema_id = SCHEMA_ID('banking') AND name = 'LoanType')
BEGIN
  CREATE TABLE banking.LoanType (
    LoanTypeId   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LoanType PRIMARY KEY,
    LoanTypeName NVARCHAR(200) NOT NULL,
    Notes        NVARCHAR(MAX) NULL,
    DisplayOrder INT NULL,
    IsActive     BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_LoanType_Name UNIQUE (LoanTypeName)
  );
  PRINT 'Created banking.LoanType';
END
ELSE
  PRINT 'banking.LoanType already exists';

-- 2. Add LoanTypeId to banking.Loan (FK to reference table; existing LoanType column remains for free text)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('banking.Loan') AND name = 'LoanTypeId')
BEGIN
  ALTER TABLE banking.Loan ADD LoanTypeId INT NULL;
  ALTER TABLE banking.Loan ADD CONSTRAINT FK_Loan_LoanType FOREIGN KEY (LoanTypeId) REFERENCES banking.LoanType(LoanTypeId);
  PRINT 'Added LoanTypeId to banking.Loan';
END
ELSE
  PRINT 'LoanTypeId already exists on banking.Loan';

-- 3. Add LoanCategory (Refinance, Restructure, Completely New) for wizard
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('banking.Loan') AND name = 'LoanCategory')
BEGIN
  ALTER TABLE banking.Loan ADD LoanCategory NVARCHAR(50) NULL;
  PRINT 'Added LoanCategory to banking.Loan';
END
ELSE
  PRINT 'LoanCategory already exists on banking.Loan';
