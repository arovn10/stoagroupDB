-- Add Latitude and Longitude to pipeline.DealPipeline (from KMZ attachments).
-- Run on existing DBs. New installs: 01_create_schema.sql already includes these.
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'pipeline' AND TABLE_NAME = 'DealPipeline' AND COLUMN_NAME = 'Latitude')
  ALTER TABLE pipeline.DealPipeline ADD Latitude DECIMAL(18,8) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'pipeline' AND TABLE_NAME = 'DealPipeline' AND COLUMN_NAME = 'Longitude')
  ALTER TABLE pipeline.DealPipeline ADD Longitude DECIMAL(18,8) NULL;

PRINT 'Deal pipeline Latitude/Longitude columns added.';
