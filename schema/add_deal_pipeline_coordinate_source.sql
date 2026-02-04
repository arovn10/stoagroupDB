-- Land Development Pipeline: CoordinateSource for Lat/Long priority (KMZ > Manual > Procore).
-- LAND_DEVELOPMENT_PIPELINE_BACKEND guide.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'pipeline' AND TABLE_NAME = 'DealPipeline' AND COLUMN_NAME = 'CoordinateSource')
BEGIN
  ALTER TABLE pipeline.DealPipeline ADD CoordinateSource NVARCHAR(20) NULL;  -- 'KMZ', 'Manual', 'Procore'
  PRINT 'Added CoordinateSource to pipeline.DealPipeline';
END
ELSE
  PRINT 'CoordinateSource already exists on pipeline.DealPipeline';
