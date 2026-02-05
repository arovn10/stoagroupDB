-- Liquidated = loan treated as paid off: set PaidOff = 1 and ExposureAmount = 0 on all participations for projects whose Stage is Liquidated.
-- Run once to backfill; thereafter the API auto-sets PaidOff and ExposureAmount when Stage is updated to Liquidated.

SET NOCOUNT ON;

UPDATE p
SET p.PaidOff = 1, p.ExposureAmount = 0
FROM banking.Participation p
INNER JOIN core.Project pr ON p.ProjectId = pr.ProjectId
WHERE LTRIM(RTRIM(ISNULL(pr.Stage, N''))) = N'Liquidated';

DECLARE @Updated INT = @@ROWCOUNT;
PRINT 'Set PaidOff = 1 and ExposureAmount = 0 for ' + CAST(@Updated AS NVARCHAR(10)) + ' participation(s) on Liquidated projects.';
