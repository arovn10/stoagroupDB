-- Land Development Contacts: contact book for field use with follow-up tracking.
-- LAND_DEVELOPMENT_CONTACTS_BACKEND.md

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'LandDevelopmentContact' AND schema_id = SCHEMA_ID('pipeline'))
BEGIN
  CREATE TABLE pipeline.LandDevelopmentContact (
    LandDevelopmentContactId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LandDevelopmentContact PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL,
    Email NVARCHAR(255) NULL,
    PhoneNumber NVARCHAR(100) NULL,
    OfficeAddress NVARCHAR(500) NULL,
    Type NVARCHAR(50) NULL,  -- 'Land Owner', 'Developer', 'Broker'
    Notes NVARCHAR(MAX) NULL,
    City NVARCHAR(100) NULL,
    State NVARCHAR(50) NULL,
    DateOfContact DATE NULL,
    FollowUpTimeframeDays INT NULL,
    CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    ModifiedAt DATETIME2(0) NULL,
    CONSTRAINT CK_LandDevelopmentContact_Type CHECK (Type IS NULL OR Type IN ('Land Owner', 'Developer', 'Broker'))
  );
  CREATE INDEX IX_LandDevelopmentContact_Type ON pipeline.LandDevelopmentContact(Type);
  CREATE INDEX IX_LandDevelopmentContact_City ON pipeline.LandDevelopmentContact(City);
  CREATE INDEX IX_LandDevelopmentContact_State ON pipeline.LandDevelopmentContact(State);
  CREATE INDEX IX_LandDevelopmentContact_DateOfContact ON pipeline.LandDevelopmentContact(DateOfContact);
  PRINT 'Created pipeline.LandDevelopmentContact table';
END
ELSE
  PRINT 'pipeline.LandDevelopmentContact table already exists';
