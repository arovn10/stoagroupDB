-- ============================================================
-- Fix leasing.DashboardSnapshot: remove rows with NULL Id
-- so the API can reliably upsert the single canonical snapshot (Id=1).
-- Run this if you see one row with Id, BuiltAt, Payload all NULL.
-- After running: trigger a snapshot rebuild (POST /api/leasing/rebuild-snapshot
-- or GET /api/leasing/dashboard) so the app inserts Id=1 with Payload and BuiltAt.
-- ============================================================

-- Remove any rows where Id IS NULL (orphans / failed writes)
DELETE FROM leasing.DashboardSnapshot WHERE Id IS NULL;

-- Optional: ensure table has expected structure (Id NOT NULL, Payload, BuiltAt)
-- If your table was created with Id INT NULL or missing BuiltAt NOT NULL, run add_leasing_dashboard_snapshot_table.sql
-- or alter the table to match:
--   ALTER TABLE leasing.DashboardSnapshot ALTER COLUMN Id INT NOT NULL;
--   ALTER TABLE leasing.DashboardSnapshot ALTER COLUMN BuiltAt DATETIME2(0) NOT NULL;
-- (Only if your schema allows it; PK may already enforce Id NOT NULL.)
