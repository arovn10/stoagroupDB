-- ============================================================
-- PIPELINE: DEAL PIPELINE (Land Development Deal Tracker)
-- ============================================================
-- Tracks deals from Prospective → Under Contract → Commercial Land - Listed → Under Construction → Lease-Up → Stabilized → Liquidated
-- Stage is stored in core.Project.Stage (controlled by Land Development)
-- This table stores all deal-specific tracking fields from Asana
-- ============================================================

SET NOCOUNT ON;

-- Create DealPipeline table
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DealPipeline' AND schema_id = SCHEMA_ID('pipeline'))
BEGIN
    CREATE TABLE pipeline.DealPipeline (
        DealPipelineId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DealPipeline PRIMARY KEY,
        ProjectId INT NOT NULL,
        
        -- Asana tracking fields
        Bank NVARCHAR(255) NULL,  -- Bank name (can link to core.Bank later)
        StartDate DATE NULL,  -- Start Date from Asana
        UnitCount INT NULL,  -- Unit Count from Asana
        PreConManagerId INT NULL,  -- Pre-Con Manager (FK to core.PreConManager)
        ConstructionLoanClosingDate DATE NULL,  -- Construction Loan Closing date
        Notes NVARCHAR(MAX) NULL,  -- Notes/description
        Priority NVARCHAR(20) NULL,  -- Priority: High, Medium, Low
        
        -- Land Development specific fields (from Asana tracker)
        Acreage DECIMAL(18,4) NULL,
        LandPrice DECIMAL(18,2) NULL,  -- Price
        SqFtPrice DECIMAL(18,2) NULL,  -- Sq. Ft. Price (calculated or stored)
        ExecutionDate DATE NULL,  -- Execution Date
        DueDiligenceDate DATE NULL,  -- Due Diligence date
        ClosingDate DATE NULL,  -- Closing date
        PurchasingEntity NVARCHAR(255) NULL,
        Cash BIT NULL,  -- Cash flag
        OpportunityZone BIT NULL,  -- Opportunity Zone flag
        ClosingNotes NVARCHAR(MAX) NULL,  -- Extension Option / Closing Notes
        
        -- Asana metadata (for tracking/sync)
        AsanaTaskGid NVARCHAR(100) NULL,  -- Asana task GID for sync
        AsanaProjectGid NVARCHAR(100) NULL,  -- Asana project GID
        
        -- Timestamps
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        UpdatedAt DATETIME2(0) NULL,
        
        CONSTRAINT FK_DP_Project FOREIGN KEY (ProjectId) REFERENCES core.Project(ProjectId) ON DELETE CASCADE,
        CONSTRAINT FK_DP_PreConManager FOREIGN KEY (PreConManagerId) REFERENCES core.PreConManager(PreConManagerId),
        CONSTRAINT UQ_DP_Project UNIQUE (ProjectId),  -- One deal pipeline entry per project
        CONSTRAINT CK_DP_Priority CHECK (Priority IS NULL OR Priority IN ('High', 'Medium', 'Low'))
    );
    
    -- Create indexes
    CREATE INDEX IX_DealPipeline_ProjectId ON pipeline.DealPipeline(ProjectId);
    CREATE INDEX IX_DealPipeline_Bank ON pipeline.DealPipeline(Bank);
    CREATE INDEX IX_DealPipeline_PreConManagerId ON pipeline.DealPipeline(PreConManagerId);
    CREATE INDEX IX_DealPipeline_StartDate ON pipeline.DealPipeline(StartDate);
    CREATE INDEX IX_DealPipeline_AsanaTaskGid ON pipeline.DealPipeline(AsanaTaskGid);
    
    PRINT '✓ Created pipeline.DealPipeline table';
END
ELSE
BEGIN
    PRINT '✓ pipeline.DealPipeline table already exists';
END
GO
