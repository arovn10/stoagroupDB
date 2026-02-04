-- Boss Morning Feedback: I/O to P&I conversion date + Mini-perm rate structure (same as I/O).
-- BACKEND-GUIDE-BOSS-MORNING-FEEDBACK.md

-- 1. Conversion date: when loan converts from I/O to P&I before maturity
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('banking.Loan') AND name = 'ConversionDate')
BEGIN
  ALTER TABLE banking.Loan ADD ConversionDate DATE NULL;
  PRINT 'Added ConversionDate to banking.Loan (I/O to P&I conversion / P&I start date).';
END
ELSE
  PRINT 'ConversionDate already exists on banking.Loan';

-- 2. Mini-perm rate structure (Fixed/Floating, index, spread, floor, ceiling)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('banking.Loan') AND name = 'MiniPermFixedOrFloating')
BEGIN
  ALTER TABLE banking.Loan ADD MiniPermFixedOrFloating NVARCHAR(20) NULL;  -- Fixed or Floating
  PRINT 'Added MiniPermFixedOrFloating to banking.Loan';
END
ELSE
  PRINT 'MiniPermFixedOrFloating already exists on banking.Loan';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('banking.Loan') AND name = 'MiniPermIndex')
BEGIN
  ALTER TABLE banking.Loan ADD MiniPermIndex NVARCHAR(50) NULL;
  PRINT 'Added MiniPermIndex to banking.Loan';
END
ELSE
  PRINT 'MiniPermIndex already exists on banking.Loan';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('banking.Loan') AND name = 'MiniPermSpread')
BEGIN
  ALTER TABLE banking.Loan ADD MiniPermSpread NVARCHAR(50) NULL;
  PRINT 'Added MiniPermSpread to banking.Loan';
END
ELSE
  PRINT 'MiniPermSpread already exists on banking.Loan';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('banking.Loan') AND name = 'MiniPermRateFloor')
BEGIN
  ALTER TABLE banking.Loan ADD MiniPermRateFloor NVARCHAR(50) NULL;
  PRINT 'Added MiniPermRateFloor to banking.Loan';
END
ELSE
  PRINT 'MiniPermRateFloor already exists on banking.Loan';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('banking.Loan') AND name = 'MiniPermRateCeiling')
BEGIN
  ALTER TABLE banking.Loan ADD MiniPermRateCeiling NVARCHAR(50) NULL;
  PRINT 'Added MiniPermRateCeiling to banking.Loan';
END
ELSE
  PRINT 'MiniPermRateCeiling already exists on banking.Loan';
