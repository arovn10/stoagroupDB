-- Banking contacts: same pattern as Land Development – core.Person + banking extension.
-- Core fields (FullName, Email, Phone, Title, Notes) in core.Person; banking-specific Role and Notes in extension.
-- Role: Banker, Broker, Developer, Other.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'BankingContactExtension' AND schema_id = SCHEMA_ID('banking'))
BEGIN
  CREATE TABLE banking.BankingContactExtension (
    ContactId INT NOT NULL CONSTRAINT PK_BankingContactExtension PRIMARY KEY,
    Role NVARCHAR(50) NULL,
    Notes NVARCHAR(MAX) NULL,
    CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    ModifiedAt DATETIME2(0) NULL,
    CONSTRAINT FK_BankingContactExtension_Person FOREIGN KEY (ContactId) REFERENCES core.Person(PersonId) ON DELETE CASCADE,
    CONSTRAINT CK_BankingContactExtension_Role CHECK (Role IS NULL OR Role IN ('Banker', 'Broker', 'Developer', 'Other'))
  );
  CREATE INDEX IX_BankingContactExtension_Role ON banking.BankingContactExtension(Role);
  PRINT 'Created banking.BankingContactExtension (ContactId = core.Person.PersonId)';
END
ELSE
  PRINT 'banking.BankingContactExtension already exists';
