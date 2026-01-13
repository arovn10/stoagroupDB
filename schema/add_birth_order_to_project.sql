-- ============================================================
-- Add BirthOrder to core.Project
-- Birth Order is a CORE attribute that identifies projects
-- ============================================================

-- Add BirthOrder column to core.Project if it doesn't exist
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('core.Project') 
    AND name = 'BirthOrder'
)
BEGIN
    ALTER TABLE core.Project
    ADD BirthOrder INT NULL;
    
    PRINT 'Added BirthOrder column to core.Project';
END
ELSE
BEGIN
    PRINT 'BirthOrder column already exists in core.Project';
END
GO

-- Create index for faster lookups
IF NOT EXISTS (
    SELECT 1 
    FROM sys.indexes 
    WHERE name = 'IX_Project_BirthOrder' 
    AND object_id = OBJECT_ID('core.Project')
)
BEGIN
    CREATE INDEX IX_Project_BirthOrder ON core.Project(BirthOrder);
    PRINT 'Created index IX_Project_BirthOrder';
END
ELSE
BEGIN
    PRINT 'Index IX_Project_BirthOrder already exists';
END
GO

-- Migrate existing BirthOrder data from banking.Loan to core.Project
-- This takes the BirthOrder from the primary construction loan for each project
UPDATE p
SET p.BirthOrder = l.BirthOrder
FROM core.Project p
INNER JOIN (
    SELECT 
        ProjectId,
        BirthOrder,
        ROW_NUMBER() OVER (PARTITION BY ProjectId ORDER BY 
            CASE WHEN LoanPhase = 'Construction' THEN 0 
                 WHEN LoanPhase = 'Land' THEN 1 
                 ELSE 2 END,
            LoanId
        ) AS rn
    FROM banking.Loan
    WHERE BirthOrder IS NOT NULL
) l ON p.ProjectId = l.ProjectId AND l.rn = 1
WHERE p.BirthOrder IS NULL;

PRINT 'Migrated BirthOrder data from banking.Loan to core.Project';
GO
