-- Land Development Contacts (updated model): individuals = core.Person; land-dev details in extension.
-- LAND_DEVELOPMENT_CONTACTS_BACKEND copy.md

-- Extension table: one row per core.Person that has land-dev attributes. Core fields (Name, Email, Phone) live in core.Person.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'LandDevelopmentContactExtension' AND schema_id = SCHEMA_ID('pipeline'))
BEGIN
  CREATE TABLE pipeline.LandDevelopmentContactExtension (
    ContactId INT NOT NULL CONSTRAINT PK_LandDevelopmentContactExtension PRIMARY KEY,
    OfficeAddress NVARCHAR(500) NULL,
    Type NVARCHAR(50) NULL,
    Notes NVARCHAR(MAX) NULL,
    City NVARCHAR(100) NULL,
    State NVARCHAR(50) NULL,
    DateOfContact DATE NULL,
    FollowUpTimeframeDays INT NULL,
    CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    ModifiedAt DATETIME2(0) NULL,
    CONSTRAINT FK_LandDevExtension_Person FOREIGN KEY (ContactId) REFERENCES core.Person(PersonId) ON DELETE CASCADE,
    CONSTRAINT CK_LandDevExtension_Type CHECK (Type IS NULL OR Type IN ('Land Owner', 'Developer', 'Broker'))
  );
  CREATE INDEX IX_LandDevelopmentContactExtension_Type ON pipeline.LandDevelopmentContactExtension(Type);
  CREATE INDEX IX_LandDevelopmentContactExtension_City ON pipeline.LandDevelopmentContactExtension(City);
  CREATE INDEX IX_LandDevelopmentContactExtension_State ON pipeline.LandDevelopmentContactExtension(State);
  CREATE INDEX IX_LandDevelopmentContactExtension_DateOfContact ON pipeline.LandDevelopmentContactExtension(DateOfContact);
  PRINT 'Created pipeline.LandDevelopmentContactExtension (ContactId = core.Person.PersonId)';
END
ELSE
  PRINT 'pipeline.LandDevelopmentContactExtension already exists';

-- Remove legacy standalone table if present (replaced by core.Person + extension)
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'LandDevelopmentContact' AND schema_id = SCHEMA_ID('pipeline'))
BEGIN
  DROP TABLE pipeline.LandDevelopmentContact;
  PRINT 'Dropped legacy pipeline.LandDevelopmentContact (replaced by core.Person + LandDevelopmentContactExtension)';
END
