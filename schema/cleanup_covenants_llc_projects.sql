-- LLC projects do not get covenants: remove all covenants for projects whose name contains "LLC".

SET NOCOUNT ON;

DELETE FROM banking.Covenant
WHERE ProjectId IN (
  SELECT ProjectId FROM core.Project
  WHERE ProjectName IS NOT NULL AND ProjectName LIKE N'%LLC%'
);

DECLARE @Deleted INT = @@ROWCOUNT;
PRINT 'Removed ' + CAST(@Deleted AS NVARCHAR(10)) + ' covenant(s) for LLC projects.';
