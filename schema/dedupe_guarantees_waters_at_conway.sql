-- Deduplicate guarantees for The Waters at Conway (same Person + Loan kept once).
-- Keeps the row with the smallest GuaranteeId per (LoanId, PersonId); deletes the rest.
-- Uses only LoanId and PersonId so it works even if FinancingType is not on banking.Guarantee.
-- To run for ALL projects: replace "AND g.ProjectId = @ProjectId" with "AND 1=1" and remove the @ProjectId check.

SET NOCOUNT ON;

-- Scope to The Waters at Conway only
DECLARE @ProjectId INT = (SELECT ProjectId FROM core.Project WHERE ProjectName = N'The Waters at Conway');

IF @ProjectId IS NULL
BEGIN
  PRINT 'Project "The Waters at Conway" not found. No rows updated.';
  RETURN;
END

DELETE g
FROM banking.Guarantee g
WHERE g.ProjectId = @ProjectId
  AND EXISTS (
    SELECT 1 FROM banking.Guarantee g2
    WHERE g2.LoanId = g.LoanId
      AND g2.PersonId = g.PersonId
      AND g2.GuaranteeId < g.GuaranteeId
  );

DECLARE @Deleted INT = @@ROWCOUNT;
PRINT 'Removed ' + CAST(@Deleted AS NVARCHAR(10)) + ' duplicate guarantee(s) for The Waters at Conway (kept one per LoanId, PersonId).';
