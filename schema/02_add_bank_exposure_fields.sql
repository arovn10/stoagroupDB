-- ============================================================
-- ADD BANK EXPOSURE FIELDS
-- Adds fields from Banking Dashboard Exposure data
-- ============================================================

SET NOCOUNT ON;

-- Add missing fields to core.Bank table
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Bank') AND name = 'HQState')
BEGIN
    ALTER TABLE core.Bank ADD HQState NVARCHAR(50) NULL;
    PRINT 'Added HQState column to core.Bank';
END
ELSE
    PRINT 'HQState column already exists in core.Bank';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Bank') AND name = 'HoldLimit')
BEGIN
    ALTER TABLE core.Bank ADD HoldLimit DECIMAL(18,2) NULL;
    PRINT 'Added HoldLimit column to core.Bank';
END
ELSE
    PRINT 'HoldLimit column already exists in core.Bank';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Bank') AND name = 'PerDealLimit')
BEGIN
    ALTER TABLE core.Bank ADD PerDealLimit DECIMAL(18,2) NULL;
    PRINT 'Added PerDealLimit column to core.Bank';
END
ELSE
    PRINT 'PerDealLimit column already exists in core.Bank';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Bank') AND name = 'Deposits')
BEGIN
    ALTER TABLE core.Bank ADD Deposits DECIMAL(18,2) NULL;
    PRINT 'Added Deposits column to core.Bank';
END
ELSE
    PRINT 'Deposits column already exists in core.Bank';

PRINT '';
PRINT 'Bank exposure fields added successfully!';
PRINT '';
PRINT 'New fields:';
PRINT '  - HQState (NVARCHAR(50)) - Headquarters state';
PRINT '  - HoldLimit (DECIMAL(18,2)) - Maximum total exposure limit';
PRINT '  - PerDealLimit (DECIMAL(18,2)) - Maximum exposure per deal';
PRINT '  - Deposits (DECIMAL(18,2)) - Deposit amount with bank';
PRINT '';
PRINT 'Note: # of Projects and Total Exposure are calculated fields';
PRINT '      (can be computed from banking.Participation table)';
PRINT '      Deposit/Loan ratio = Deposits / Total Exposure';
