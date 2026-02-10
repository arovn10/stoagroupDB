-- ============================================================
-- REVIEWS: Online review tracking (Google, Apartment Ratings, etc.)
-- Stores all reviews with category/sentiment/common_phrase from ETL logic.
-- Dedupe by Property + reviewer + review_date_original + content hash.
-- ============================================================

SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'reviews')
    EXEC('CREATE SCHEMA reviews');

-- PropertyReviewConfig: which properties are in scope and their Google Maps URL (admin can edit link + include flag)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PropertyReviewConfig' AND schema_id = SCHEMA_ID('reviews'))
BEGIN
    CREATE TABLE reviews.PropertyReviewConfig (
        PropertyReviewConfigId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PropertyReviewConfig PRIMARY KEY,
        ProjectId INT NOT NULL,
        GoogleMapsUrl NVARCHAR(2000) NULL,
        IncludeInReviewsReport BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        UpdatedAt DATETIME2(0) NULL,
        CONSTRAINT FK_PropertyReviewConfig_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId) ON DELETE CASCADE,
        CONSTRAINT UQ_PropertyReviewConfig_Project UNIQUE (ProjectId)
    );
    CREATE INDEX IX_PropertyReviewConfig_ProjectId ON reviews.PropertyReviewConfig(ProjectId);
    CREATE INDEX IX_PropertyReviewConfig_IncludeInReports ON reviews.PropertyReviewConfig(IncludeInReviewsReport);
    PRINT 'Created reviews.PropertyReviewConfig';
END
GO

-- Review: one row per review; duplicate detection via ReviewDedupeKey
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Review' AND schema_id = SCHEMA_ID('reviews'))
BEGIN
    CREATE TABLE reviews.Review (
        ReviewId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Review PRIMARY KEY,
        ProjectId INT NULL,
        -- Core fields (match Domo/manifest)
        Property NVARCHAR(255) NOT NULL,
        Review_Text NVARCHAR(MAX) NULL,
        rating DECIMAL(5,2) NULL,
        reviewer_name NVARCHAR(500) NULL,
        review_date DATE NULL,
        review_date_original NVARCHAR(200) NULL,
        review_year INT NULL,
        review_month INT NULL,
        review_month_name NVARCHAR(50) NULL,
        review_day_of_week NVARCHAR(20) NULL,
        scraped_at DATETIME2(0) NULL,
        source NVARCHAR(100) NULL,
        extraction_method NVARCHAR(100) NULL,
        property_url NVARCHAR(2000) NULL,
        request_ip NVARCHAR(100) NULL,
        request_timestamp DATETIME2(0) NULL,
        category NVARCHAR(200) NULL,
        sentiment NVARCHAR(50) NULL,
        common_phrase NVARCHAR(200) NULL,
        Location NVARCHAR(500) NULL,
        Total_Units INT NULL,
        Birth_Order INT NULL,
        Rank INT NULL,
        ReviewDedupeKey AS (
            HASHBYTES('SHA2_256',
                CONVERT(NVARCHAR(4000),
                    ISNULL(Property,N'') + N'|' + ISNULL(reviewer_name,N'') + N'|' + ISNULL(review_date_original,N'') + N'|' + LEFT(ISNULL(Review_Text,N''), 900)
                )
            )
        ) PERSISTED,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT FK_Review_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId),
        CONSTRAINT UQ_Review_Dedupe UNIQUE (ReviewDedupeKey)
    );
    CREATE INDEX IX_Review_ProjectId ON reviews.Review(ProjectId);
    CREATE INDEX IX_Review_Property ON reviews.Review(Property);
    CREATE INDEX IX_Review_scraped_at ON reviews.Review(scraped_at);
    CREATE INDEX IX_Review_review_date ON reviews.Review(review_date);
    CREATE INDEX IX_Review_sentiment ON reviews.Review(sentiment);
    CREATE INDEX IX_Review_category ON reviews.Review(category);
    PRINT 'Created reviews.Review';
END
ELSE
BEGIN
    -- Add ProjectId if missing (for existing installs)
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('reviews.Review') AND name = 'ProjectId')
    BEGIN
        ALTER TABLE reviews.Review ADD ProjectId INT NULL;
        ALTER TABLE reviews.Review ADD CONSTRAINT FK_Review_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId);
        CREATE INDEX IX_Review_ProjectId ON reviews.Review(ProjectId);
        PRINT 'Added reviews.Review.ProjectId';
    END
END
GO
