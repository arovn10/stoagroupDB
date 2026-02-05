-- One-time backfill: create I/O Maturity covenant for any loan that has IOMaturityDate but no I/O Maturity covenant yet.
-- (Sync was previously only creating I/O Maturity for Construction; now we create for any phase. This fixes existing Permanent loans.)

SET NOCOUNT ON;

INSERT INTO banking.Covenant (ProjectId, LoanId, CovenantType, CovenantDate, Requirement, IsCompleted)
SELECT l.ProjectId, l.LoanId, N'I/O Maturity',
       l.IOMaturityDate,
       CASE WHEN l.LoanPhase = 'Construction' THEN N'Construction I/O Maturity' ELSE N'I/O Maturity' END,
       0
FROM banking.Loan l
WHERE l.IOMaturityDate IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM banking.Covenant c
    WHERE c.LoanId = l.LoanId AND c.CovenantType = N'I/O Maturity'
  );

DECLARE @Inserted INT = @@ROWCOUNT;
PRINT 'Inserted ' + CAST(@Inserted AS NVARCHAR(10)) + ' I/O Maturity covenant(s) for loans that had IOMaturityDate but no covenant.';
