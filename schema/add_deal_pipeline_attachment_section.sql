-- ============================================================
-- Deal Pipeline (Land Development) file subsections per deal
-- Sections: Land, Design and Permits, Comp Validation, Contractor, Legal, Underwriting
-- Run after pipeline.DealPipelineAttachment exists.
-- ============================================================

SET NOCOUNT ON;

-- Step 1: Add Section column if it does not exist
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('pipeline.DealPipelineAttachment') AND name = 'Section'
)
BEGIN
  ALTER TABLE pipeline.DealPipelineAttachment
  ADD Section NVARCHAR(80) NULL;
  PRINT 'Added column pipeline.DealPipelineAttachment.Section.';
END
GO

-- Step 2: Add or replace the check constraint
SET NOCOUNT ON;

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_DealPipelineAttachment_Section')
  ALTER TABLE pipeline.DealPipelineAttachment DROP CONSTRAINT CK_DealPipelineAttachment_Section;

ALTER TABLE pipeline.DealPipelineAttachment
ADD CONSTRAINT CK_DealPipelineAttachment_Section CHECK (
  Section IS NULL
  OR Section IN (
    N'Land',
    N'Design and Permits',
    N'Comp Validation',
    N'Contractor',
    N'Legal',
    N'Underwriting'
  )
);
PRINT 'CK_DealPipelineAttachment_Section applied.';
GO

-- Step 3: Create index if it does not exist
SET NOCOUNT ON;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('pipeline.DealPipelineAttachment') AND name = 'IX_DealPipelineAttachment_DealPipelineId_Section'
)
BEGIN
  CREATE INDEX IX_DealPipelineAttachment_DealPipelineId_Section ON pipeline.DealPipelineAttachment(DealPipelineId, Section);
  PRINT 'Created index IX_DealPipelineAttachment_DealPipelineId_Section.';
END
GO
