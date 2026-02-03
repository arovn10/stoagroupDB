-- Boss Feedback #10: Deal Pipeline Lenders form – Address, ContactName, ContactEmail, ContactPhone

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Bank') AND name = 'Address')
BEGIN
  ALTER TABLE core.Bank ADD Address NVARCHAR(500) NULL;
  PRINT 'Added Address to core.Bank';
END
ELSE
  PRINT 'Address already exists on core.Bank';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Bank') AND name = 'ContactName')
BEGIN
  ALTER TABLE core.Bank ADD ContactName NVARCHAR(255) NULL;
  PRINT 'Added ContactName to core.Bank';
END
ELSE
  PRINT 'ContactName already exists on core.Bank';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Bank') AND name = 'ContactEmail')
BEGIN
  ALTER TABLE core.Bank ADD ContactEmail NVARCHAR(255) NULL;
  PRINT 'Added ContactEmail to core.Bank';
END
ELSE
  PRINT 'ContactEmail already exists on core.Bank';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Bank') AND name = 'ContactPhone')
BEGIN
  ALTER TABLE core.Bank ADD ContactPhone NVARCHAR(50) NULL;
  PRINT 'Added ContactPhone to core.Bank';
END
ELSE
  PRINT 'ContactPhone already exists on core.Bank';
