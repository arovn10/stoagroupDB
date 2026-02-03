-- Boss Feedback #5: Construction Completion Date source (Procore vs manual)
-- Optional field so UI can show "(from Procore)" when sourced from Procore.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('banking.Loan') AND name = 'ConstructionCompletionSource')
BEGIN
  ALTER TABLE banking.Loan ADD ConstructionCompletionSource NVARCHAR(50) NULL;
  PRINT 'Added ConstructionCompletionSource to banking.Loan';
END
ELSE
  PRINT 'ConstructionCompletionSource already exists on banking.Loan';
