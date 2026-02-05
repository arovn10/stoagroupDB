-- Permanent Loan Maturity and Perm Phase Maturity are the same thing; keep only Perm Phase Maturity.
-- Delete "Permanent Loan Maturity" covenants where the same loan has a "Perm Phase Maturity" on the same date.

SET NOCOUNT ON;

;WITH Redundant AS (
  SELECT plm.CovenantId
  FROM banking.Covenant plm
  INNER JOIN banking.Covenant pp ON pp.LoanId = plm.LoanId
    AND pp.CovenantType = N'Perm Phase Maturity'
    AND pp.CovenantDate = plm.CovenantDate
  WHERE plm.CovenantType = N'Permanent Loan Maturity'
)
DELETE FROM banking.Covenant
WHERE CovenantId IN (SELECT CovenantId FROM Redundant);

DECLARE @Deleted INT = @@ROWCOUNT;
PRINT 'Removed ' + CAST(@Deleted AS NVARCHAR(10)) + ' redundant Permanent Loan Maturity covenant(s) (same loan+date as Perm Phase Maturity).';
