-- Boss Feedback #4: Permanent debt and loan extensions/modifications
-- New entity: banking.LoanModification (restructures, modifications, extensions)

IF NOT EXISTS (SELECT 1 FROM sys.tables t
  INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
  WHERE s.name = 'banking' AND t.name = 'LoanModification')
BEGIN
  CREATE TABLE banking.LoanModification (
    LoanModificationId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LoanModification PRIMARY KEY,
    ProjectId  INT NOT NULL,
    LoanId     INT NULL,  -- Optional: tie to specific loan

    Type        NVARCHAR(50) NOT NULL,   -- e.g. Restructure, Modification, Extension, Permanent Debt
    Description NVARCHAR(500) NULL,      -- e.g. "Redstone Debt Restructure", "Settlers Loan modification at mini-perm"
    EffectiveDate DATE NULL,

    Notes NVARCHAR(MAX) NULL,

    CONSTRAINT FK_LoanModification_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
    CONSTRAINT FK_LoanModification_Loan    FOREIGN KEY (LoanId) REFERENCES banking.Loan(LoanId)
  );

  CREATE INDEX IX_LoanModification_Project ON banking.LoanModification(ProjectId);
  CREATE INDEX IX_LoanModification_Loan    ON banking.LoanModification(LoanId);

  PRINT 'Created banking.LoanModification';
END
ELSE
  PRINT 'banking.LoanModification already exists';
