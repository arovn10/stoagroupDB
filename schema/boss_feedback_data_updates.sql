-- Boss Feedback #7, #8, #9: Data updates
-- Run after applying schema. Idempotent where possible.

SET NOCOUNT ON;

-- #7: Heights at Waterpointe - add project if missing
IF NOT EXISTS (SELECT 1 FROM core.Project WHERE ProjectName = N'Heights at Waterpointe')
BEGIN
  INSERT INTO core.Project (ProjectName, Region)
  VALUES (N'Heights at Waterpointe', N'Gulf Coast');
  PRINT 'Inserted project: Heights at Waterpointe';
END
ELSE
  PRINT 'Heights at Waterpointe already exists';

-- #8: The Waters at Crosspointe -> The Flats at Crosspointe
UPDATE core.Project
SET ProjectName = N'The Flats at Crosspointe'
WHERE ProjectName = N'The Waters at Crosspointe';
IF @@ROWCOUNT > 0
  PRINT 'Renamed project: The Waters at Crosspointe -> The Flats at Crosspointe';
ELSE
  PRINT 'No project named The Waters at Crosspointe (already updated or not present)';

-- #9: West Village region -> Gulf Coast (match by name containing "West Village")
UPDATE core.Project
SET Region = N'Gulf Coast'
WHERE Region = N'Lafayette'
  AND (ProjectName LIKE N'%West Village%' OR ProjectName = N'West Village');
IF @@ROWCOUNT > 0
  PRINT 'Updated West Village region to Gulf Coast';
ELSE
  PRINT 'No West Village project with region Lafayette found (already updated or not present)';

PRINT 'Boss feedback data updates complete.';
