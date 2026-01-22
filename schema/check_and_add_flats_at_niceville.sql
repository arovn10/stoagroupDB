-- ============================================================
-- CHECK AND ADD: The Flats at Niceville
-- ============================================================

SET NOCOUNT ON;

DECLARE @ProjectId INT;
DECLARE @ProjectExists BIT = 0;

-- Check if project exists
SELECT @ProjectId = ProjectId
FROM core.Project
WHERE ProjectName = 'The Flats at Niceville';

IF @ProjectId IS NOT NULL
BEGIN
    SET @ProjectExists = 1;
    PRINT 'Project EXISTS';
    PRINT 'ProjectId: ' + CAST(@ProjectId AS NVARCHAR(10));
END
ELSE
BEGIN
    PRINT 'Project NOT FOUND - creating it';
END

-- Create or update Project
IF @ProjectExists = 0
BEGIN
    INSERT INTO core.Project (
        ProjectName,
        City,
        State,
        Region,
        Units,
        ProductType,
        Stage,
        EstimatedConstructionStartDate
    )
    VALUES (
        'The Flats at Niceville',
        'Niceville',
        'FL',
        'Gulf Coast',
        208,
        'Flats',
        'Under Contract',
        '2026-01-14'
    );
    
    SET @ProjectId = SCOPE_IDENTITY();
    PRINT 'Created project with ProjectId: ' + CAST(@ProjectId AS NVARCHAR(10));
END
ELSE
BEGIN
    UPDATE core.Project
    SET 
        City = 'Niceville',
        State = 'FL',
        Region = 'Gulf Coast',
        Units = 208,
        ProductType = COALESCE(ProductType, 'Flats'),
        Stage = COALESCE(Stage, 'Under Contract'),
        EstimatedConstructionStartDate = COALESCE(EstimatedConstructionStartDate, '2026-01-14'),
        UpdatedAt = SYSDATETIME()
    WHERE ProjectId = @ProjectId;
    
    PRINT 'Updated project';
END

-- Check if DealPipeline exists
DECLARE @DealPipelineId INT;
SELECT @DealPipelineId = DealPipelineId
FROM pipeline.DealPipeline
WHERE ProjectId = @ProjectId;

-- Create or update DealPipeline
IF @DealPipelineId IS NOT NULL
BEGIN
    UPDATE pipeline.DealPipeline
    SET 
        Acreage = 8.3,
        LandPrice = 4570500.00,
        SqFtPrice = 12.64,
        ExecutionDate = '2026-01-14',
        DueDiligenceDate = '2026-08-12',
        ClosingDate = '2026-09-11',
        PurchasingEntity = NULL,
        Cash = 0,
        OpportunityZone = 0,
        ClosingNotes = NULL,
        UpdatedAt = SYSDATETIME()
    WHERE DealPipelineId = @DealPipelineId;
    
    PRINT 'Updated DealPipeline record';
END
ELSE
BEGIN
    INSERT INTO pipeline.DealPipeline (
        ProjectId,
        Acreage,
        LandPrice,
        SqFtPrice,
        ExecutionDate,
        DueDiligenceDate,
        ClosingDate,
        PurchasingEntity,
        Cash,
        OpportunityZone,
        ClosingNotes
    )
    VALUES (
        @ProjectId,
        8.3,
        4570500.00,
        12.64,
        '2026-01-14',
        '2026-08-12',
        '2026-09-11',
        NULL,
        0,
        0,
        NULL
    );
    
    PRINT 'Created DealPipeline record';
END

-- Show final result
SELECT 
    p.ProjectId,
    p.ProjectName,
    p.City,
    p.State,
    p.Region,
    p.Units,
    p.ProductType,
    p.Stage,
    dp.DealPipelineId,
    dp.Acreage,
    dp.LandPrice,
    dp.SqFtPrice,
    dp.ExecutionDate,
    dp.DueDiligenceDate,
    dp.ClosingDate
FROM core.Project p
LEFT JOIN pipeline.DealPipeline dp ON dp.ProjectId = p.ProjectId
WHERE p.ProjectName = 'The Flats at Niceville';

PRINT 'Complete!';
GO
