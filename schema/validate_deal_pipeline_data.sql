-- ============================================================
-- VALIDATE DEAL PIPELINE DATA
-- ============================================================
-- Checks which projects exist and shows current vs expected data
-- ============================================================

SET NOCOUNT ON;

PRINT '============================================================';
PRINT 'VALIDATING DEAL PIPELINE DATA';
PRINT '============================================================';
PRINT '';

-- Expected projects
DECLARE @ExpectedProjects TABLE (
    ProjectName NVARCHAR(255),
    Location NVARCHAR(255),
    Region NVARCHAR(50),
    Acreage DECIMAL(18,4),
    Units INT,
    Price DECIMAL(18,2),
    SqFtPrice DECIMAL(18,2),
    ExecutionDate DATE,
    DueDiligenceDate DATE,
    ClosingDate DATE,
    PurchasingEntity NVARCHAR(255),
    Cash BIT,
    OpportunityZone BIT,
    ClosingNotes NVARCHAR(MAX)
);

INSERT INTO @ExpectedProjects VALUES
('The Waters at OWA', 'Foley, AL', 'Gulf Coast', 21, 312, 2012472.00, 2.20, '2024-09-16', '2026-03-31', '2026-04-30', 'SPE', 0, 1, 'Closing to extend 60 days if Seller defaults. Drafted 30 day extension to send to OWA for review.'),
('The Waters at Southpoint', 'Hardeeville, SC', 'Carolinas', 17.733, 288, 7920000.00, 10.25, '2024-07-19', '2025-06-16', '2025-07-16', 'SPE', 0, 1, 'Automatically extends due to Seller Contingencies not being completed prior to Initial Inspection Period expiration. Closing within 30 days of completion notice'),
('The Waters at Bartlett', 'Bartlett, TN', 'Gulf Coast', 25, 324, 4000000.00, 3.67, '2025-02-26', '2026-04-30', '2026-04-30', 'SPE', 0, 0, ''),
('Cahaba Valley Project', 'Birmingham, AL', 'Gulf Coast', 14.46, 280, 4750000.00, 7.54, '2025-05-30', '2026-02-24', '2026-03-26', 'SPE', 0, 0, 'Closing shall take place the later of 30 days from the expiration of the inspection period or within 10 days of receiving construction permits'),
('Greenville Project', 'Greenville, NC', 'Carolinas', 20.38, 324, 3800000.00, 4.28, '2025-06-16', '2025-12-24', '2026-01-22', 'SPE', 0, 0, 'Option to extend for one 30 day period with written notice prior to expiration of initial inspection period and additional earnest money of $50,000'),
('Fort Walton Beach Project', 'Fort Walton Beach, FL', 'Gulf Coast', 7.5, 266, 6900000.00, 21.12, '2025-07-01', '2026-01-28', '2026-01-15', 'SPE', 0, 0, 'Purchaser sall have the right toextend the DD period for up to five additional 30-day period.'),
('The Waters at New Bern', 'New Bern, NC', 'Carolinas', 14.5, 264, 4000000.00, 6.33, '2025-08-21', '2026-01-18', '2026-02-17', 'SPE', 0, 0, 'Option to extend for two forty-five day periods. Purchase must deliver written notice of extension 30 days prior to expiration of inital Inspection Period and fourteen (14) days prior to second extension. Must non-refundable deposit additional earnest money with escrow agent in the amount of $20,0000 prior to commencement of each extension period'),
('Lake Murray', 'Columbia, SC', 'Carolinas', 18.84, 300, 5415000.00, 6.60, '2025-09-30', '2026-03-29', '2026-04-28', 'SPE', 0, 0, 'Purchase has the option to extend Inspection for up to two sixty (60) day periods. Must notify seller 30 days prior to expiration of first Inspection Period. Much depoist additional earnest money in the amount of $10,000 before commencemnt of each extension.'),
('The Waters at SweetBay', 'Panama City, FL', 'Gulf Coast', 12.8, 288, 6000000.00, 10.76, '2025-11-16', '2026-02-12', '2026-03-14', 'SPE', 0, 0, 'Buyer shall have the right to extend the Due Diligence Period for two (2) successive periods of thirty (30) days each by providing written notice to Seller, at least ten (10) days prior to the thenexpiration of the Due Diligence Period, of its election to extend the Due Diligence Period, accompanied by payment to Seller in immediately available funds of a non-refundable fee in the amount of TWENTY-FIVE THOUSAND AND NO/100 DOLLARS ($25,000.00) (each, an "Extension Fee") for each such extension'),
('The Waters at Fayetteville', 'Fayetteville, NC', 'Carolinas', 14.45, 312, 4250000.00, 6.75, '2025-12-08', '2026-03-08', '2026-04-07', 'SPE', 0, 0, 'Purchaser shall have three 30-day extension period options for an additional non-refundable extension fee of $25,000 each that will be applied to the purchase price. Purchaser must send notice of extension 30 days prior to the diligence period expiration.'),
('The Flats at Niceville', 'Niceville, FL', 'Gulf Coast', 8.3, 208, 4570500.00, 12.64, '2026-01-14', '2026-08-12', '2026-09-11', '', 0, 0, '');

-- Check which projects exist
PRINT '📊 PROJECT EXISTENCE CHECK:';
PRINT '';
SELECT 
    ep.ProjectName,
    CASE WHEN p.ProjectId IS NOT NULL THEN '✅ EXISTS' ELSE '❌ NOT FOUND' END AS Status,
    p.ProjectId,
    p.City AS CurrentCity,
    LTRIM(RTRIM(SUBSTRING(ep.Location, 1, CHARINDEX(',', ep.Location) - 1))) AS ExpectedCity,
    p.State AS CurrentState,
    LTRIM(RTRIM(SUBSTRING(ep.Location, CHARINDEX(',', ep.Location) + 1, LEN(ep.Location)))) AS ExpectedState,
    p.Region AS CurrentRegion,
    ep.Region AS ExpectedRegion,
    p.Stage AS CurrentStage
FROM @ExpectedProjects ep
LEFT JOIN core.Project p ON p.ProjectName = ep.ProjectName
ORDER BY ep.ProjectName;

PRINT '';
PRINT '============================================================';
PRINT 'DEAL PIPELINE DATA COMPARISON';
PRINT '============================================================';
PRINT '';

-- Compare DealPipeline data
SELECT 
    ep.ProjectName,
    CASE WHEN dp.DealPipelineId IS NOT NULL THEN '✅ HAS DEAL PIPELINE' ELSE '❌ NO DEAL PIPELINE' END AS DealPipelineStatus,
    -- Current values
    dp.Acreage AS CurrentAcreage,
    ep.Acreage AS ExpectedAcreage,
    dp.LandPrice AS CurrentLandPrice,
    ep.Price AS ExpectedLandPrice,
    dp.SqFtPrice AS CurrentSqFtPrice,
    ep.SqFtPrice AS ExpectedSqFtPrice,
    dp.ExecutionDate AS CurrentExecutionDate,
    ep.ExecutionDate AS ExpectedExecutionDate,
    dp.DueDiligenceDate AS CurrentDueDiligenceDate,
    ep.DueDiligenceDate AS ExpectedDueDiligenceDate,
    dp.ClosingDate AS CurrentClosingDate,
    ep.ClosingDate AS ExpectedClosingDate,
    dp.PurchasingEntity AS CurrentPurchasingEntity,
    ep.PurchasingEntity AS ExpectedPurchasingEntity,
    dp.Cash AS CurrentCash,
    ep.Cash AS ExpectedCash,
    dp.OpportunityZone AS CurrentOpportunityZone,
    ep.OpportunityZone AS ExpectedOpportunityZone
FROM @ExpectedProjects ep
LEFT JOIN core.Project p ON p.ProjectName = ep.ProjectName
LEFT JOIN pipeline.DealPipeline dp ON dp.ProjectId = p.ProjectId
ORDER BY ep.ProjectName;

PRINT '';
PRINT '============================================================';
PRINT 'SUMMARY';
PRINT '============================================================';

DECLARE @TotalExpected INT = (SELECT COUNT(*) FROM @ExpectedProjects);
DECLARE @ProjectsFound INT = (SELECT COUNT(*) FROM @ExpectedProjects ep INNER JOIN core.Project p ON p.ProjectName = ep.ProjectName);
DECLARE @DealPipelinesFound INT = (
    SELECT COUNT(*) 
    FROM @ExpectedProjects ep 
    INNER JOIN core.Project p ON p.ProjectName = ep.ProjectName
    INNER JOIN pipeline.DealPipeline dp ON dp.ProjectId = p.ProjectId
);

PRINT '   - Total expected projects: ' + CAST(@TotalExpected AS NVARCHAR(10));
PRINT '   - Projects found in database: ' + CAST(@ProjectsFound AS NVARCHAR(10));
PRINT '   - DealPipeline records found: ' + CAST(@DealPipelinesFound AS NVARCHAR(10));
PRINT '';

IF @ProjectsFound < @TotalExpected
BEGIN
    PRINT '⚠️  WARNING: Some projects are missing from the database!';
END
ELSE
BEGIN
    PRINT '✅ All projects exist in the database';
END

PRINT '============================================================';
GO
