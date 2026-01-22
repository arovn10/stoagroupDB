-- ============================================================
-- UPDATE DEAL PIPELINE DATA FROM PROVIDED DEALS
-- ============================================================
-- Validates and updates DealPipeline records with provided data
-- Sets Stage to "Under Contract" for all deals
-- ============================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

PRINT '============================================================';
PRINT 'UPDATING DEAL PIPELINE DATA';
PRINT '============================================================';
PRINT '';

BEGIN TRY
    -- Create temporary table with provided data
    CREATE TABLE #DealData (
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

    -- Insert provided data
    INSERT INTO #DealData VALUES
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

    PRINT '📊 VALIDATION: Checking which projects exist...';
    PRINT '';

    -- Check which projects exist
    SELECT 
        dd.ProjectName,
        CASE WHEN p.ProjectId IS NOT NULL THEN '✅ EXISTS' ELSE '❌ NOT FOUND' END AS Status,
        p.ProjectId,
        p.City,
        p.State,
        p.Region,
        p.Stage
    FROM #DealData dd
    LEFT JOIN core.Project p ON p.ProjectName = dd.ProjectName
    ORDER BY dd.ProjectName;

    PRINT '';
    PRINT '============================================================';
    PRINT 'UPDATING PROJECTS AND DEAL PIPELINE DATA';
    PRINT '============================================================';
    PRINT '';

    -- Update Projects and DealPipeline
    DECLARE @UpdatedCount INT = 0;
    DECLARE @NotFoundCount INT = 0;

    DECLARE @ProjectName NVARCHAR(255);
    DECLARE @Location NVARCHAR(255);
    DECLARE @Region NVARCHAR(50);
    DECLARE @Acreage DECIMAL(18,4);
    DECLARE @Units INT;
    DECLARE @Price DECIMAL(18,2);
    DECLARE @SqFtPrice DECIMAL(18,2);
    DECLARE @ExecutionDate DATE;
    DECLARE @DueDiligenceDate DATE;
    DECLARE @ClosingDate DATE;
    DECLARE @PurchasingEntity NVARCHAR(255);
    DECLARE @Cash BIT;
    DECLARE @OpportunityZone BIT;
    DECLARE @ClosingNotes NVARCHAR(MAX);
    DECLARE @ProjectId INT;
    DECLARE @City NVARCHAR(100);
    DECLARE @State NVARCHAR(50);

    DECLARE deal_cursor CURSOR FOR
    SELECT ProjectName, Location, Region, Acreage, Units, Price, SqFtPrice, 
           ExecutionDate, DueDiligenceDate, ClosingDate, PurchasingEntity, 
           Cash, OpportunityZone, ClosingNotes
    FROM #DealData;

    OPEN deal_cursor;
    FETCH NEXT FROM deal_cursor INTO @ProjectName, @Location, @Region, @Acreage, @Units, 
                                     @Price, @SqFtPrice, @ExecutionDate, @DueDiligenceDate, 
                                     @ClosingDate, @PurchasingEntity, @Cash, @OpportunityZone, @ClosingNotes;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Parse Location (City, State)
        SET @City = LTRIM(RTRIM(SUBSTRING(@Location, 1, CHARINDEX(',', @Location) - 1)));
        SET @State = LTRIM(RTRIM(SUBSTRING(@Location, CHARINDEX(',', @Location) + 1, LEN(@Location))));

        -- Find Project
        SELECT @ProjectId = ProjectId 
        FROM core.Project 
        WHERE ProjectName = @ProjectName;

        IF @ProjectId IS NOT NULL
        BEGIN
            -- Update Project (City, State, Region, Units, Stage)
            UPDATE core.Project
            SET City = @City,
                State = @State,
                Region = @Region,
                Units = @Units,
                Stage = 'Under Contract',
                UpdatedAt = SYSDATETIME()
            WHERE ProjectId = @ProjectId;

            -- Update or Insert DealPipeline
            IF EXISTS (SELECT 1 FROM pipeline.DealPipeline WHERE ProjectId = @ProjectId)
            BEGIN
                UPDATE pipeline.DealPipeline
                SET Acreage = @Acreage,
                    LandPrice = @Price,
                    SqFtPrice = @SqFtPrice,
                    ExecutionDate = @ExecutionDate,
                    DueDiligenceDate = @DueDiligenceDate,
                    ClosingDate = @ClosingDate,
                    PurchasingEntity = @PurchasingEntity,
                    Cash = @Cash,
                    OpportunityZone = @OpportunityZone,
                    ClosingNotes = @ClosingNotes,
                    UpdatedAt = SYSDATETIME()
                WHERE ProjectId = @ProjectId;

                PRINT '✅ Updated: ' + @ProjectName;
            END
            ELSE
            BEGIN
                INSERT INTO pipeline.DealPipeline (
                    ProjectId, Acreage, LandPrice, SqFtPrice, ExecutionDate,
                    DueDiligenceDate, ClosingDate, PurchasingEntity, Cash,
                    OpportunityZone, ClosingNotes
                )
                VALUES (
                    @ProjectId, @Acreage, @Price, @SqFtPrice, @ExecutionDate,
                    @DueDiligenceDate, @ClosingDate, @PurchasingEntity, @Cash,
                    @OpportunityZone, @ClosingNotes
                );

                PRINT '✅ Created DealPipeline for: ' + @ProjectName;
            END

            SET @UpdatedCount = @UpdatedCount + 1;
        END
        ELSE
        BEGIN
            PRINT '❌ NOT FOUND: ' + @ProjectName;
            SET @NotFoundCount = @NotFoundCount + 1;
        END

        FETCH NEXT FROM deal_cursor INTO @ProjectName, @Location, @Region, @Acreage, @Units, 
                                         @Price, @SqFtPrice, @ExecutionDate, @DueDiligenceDate, 
                                         @ClosingDate, @PurchasingEntity, @Cash, @OpportunityZone, @ClosingNotes;
    END

    CLOSE deal_cursor;
    DEALLOCATE deal_cursor;

    DROP TABLE #DealData;

    PRINT '';
    PRINT '============================================================';
    PRINT 'UPDATE SUMMARY';
    PRINT '============================================================';
    PRINT '   - Projects updated: ' + CAST(@UpdatedCount AS NVARCHAR(10));
    PRINT '   - Projects not found: ' + CAST(@NotFoundCount AS NVARCHAR(10));
    PRINT '';
    PRINT '✅ Update completed!';
    PRINT '============================================================';

END TRY
BEGIN CATCH
    IF CURSOR_STATUS('global', 'deal_cursor') >= 0
    BEGIN
        CLOSE deal_cursor;
        DEALLOCATE deal_cursor;
    END
    
    IF OBJECT_ID('tempdb..#DealData') IS NOT NULL
        DROP TABLE #DealData;

    PRINT '❌ ERROR:';
    PRINT '   ' + ERROR_MESSAGE();
    PRINT '   Error Number: ' + CAST(ERROR_NUMBER() AS NVARCHAR(10));
    PRINT '   Error Line: ' + CAST(ERROR_LINE() AS NVARCHAR(10));
    THROW;
END CATCH
GO

-- Verification: Show updated data
PRINT '';
PRINT 'VERIFICATION: Updated DealPipeline records';
SELECT 
    p.ProjectName,
    p.City,
    p.State,
    p.Region,
    p.Units,
    p.Stage,
    dp.Acreage,
    dp.LandPrice,
    dp.SqFtPrice,
    dp.ExecutionDate,
    dp.DueDiligenceDate,
    dp.ClosingDate,
    dp.PurchasingEntity,
    dp.Cash,
    dp.OpportunityZone,
    LEFT(dp.ClosingNotes, 50) AS ClosingNotesPreview
FROM pipeline.DealPipeline dp
INNER JOIN core.Project p ON dp.ProjectId = p.ProjectId
WHERE p.ProjectName IN (
    'The Waters at OWA', 'The Waters at Southpoint', 'The Waters at Bartlett',
    'Cahaba Valley Project', 'Greenville Project', 'Fort Walton Beach Project',
    'The Waters at New Bern', 'Lake Murray', 'The Waters at SweetBay',
    'The Waters at Fayetteville', 'The Flats at Niceville'
)
ORDER BY p.ProjectName;
GO
