-- Retroactive cleanup: delete auto-created key-date covenants whose loan was already deleted in the past.
-- Run once (or periodically) to remove lingering covenants that point to non-existent loans.

SET NOCOUNT ON;

;WITH Orphaned AS (
  SELECT c.CovenantId
  FROM banking.Covenant c
  WHERE c.LoanId IS NOT NULL
    AND c.CovenantType IN (N'I/O Maturity', N'Loan Maturity', N'Permanent Loan Maturity', N'Mini-Perm Maturity', N'Perm Phase Maturity')
    AND NOT EXISTS (SELECT 1 FROM banking.Loan l WHERE l.LoanId = c.LoanId)
)
DELETE FROM banking.Covenant
WHERE CovenantId IN (SELECT CovenantId FROM Orphaned);

DECLARE @Deleted INT = @@ROWCOUNT;
PRINT 'Removed ' + CAST(@Deleted AS NVARCHAR(10)) + ' orphaned auto-created covenant(s) (loan no longer exists).';
