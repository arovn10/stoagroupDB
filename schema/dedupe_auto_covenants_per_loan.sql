-- Dedupe auto-created key-date covenants: keep one per (LoanId, CovenantType), delete the rest.
-- Keeps the row with the smallest CovenantId; deletes all other duplicates (handles trailing spaces / encoding).

SET NOCOUNT ON;

DELETE c
FROM banking.Covenant c
WHERE c.LoanId IS NOT NULL
  AND LTRIM(RTRIM(c.CovenantType)) IN (N'I/O Maturity', N'Loan Maturity', N'Permanent Loan Maturity', N'Mini-Perm Maturity', N'Perm Phase Maturity')
  AND EXISTS (
    SELECT 1 FROM banking.Covenant c2
    WHERE c2.LoanId = c.LoanId
      AND LTRIM(RTRIM(c2.CovenantType)) = LTRIM(RTRIM(c.CovenantType))
      AND c2.CovenantId < c.CovenantId
  );

DECLARE @Deleted INT = @@ROWCOUNT;
PRINT 'Removed ' + CAST(@Deleted AS NVARCHAR(10)) + ' duplicate auto-created covenant(s); kept one per (LoanId, CovenantType).';
