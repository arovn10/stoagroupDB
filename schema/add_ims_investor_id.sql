-- Add IMS Investor Profile ID field to EquityPartner table
-- This allows mapping IMS investor IDs to investor names

-- Add the column if it doesn't exist
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('core.EquityPartner') 
    AND name = 'IMSInvestorProfileId'
)
BEGIN
    ALTER TABLE core.EquityPartner
    ADD IMSInvestorProfileId NVARCHAR(50) NULL;
    
    -- Create index for faster lookups
    CREATE INDEX IX_EquityPartner_IMSInvestorProfileId 
    ON core.EquityPartner(IMSInvestorProfileId);
    
    PRINT 'Added IMSInvestorProfileId column to core.EquityPartner';
END
ELSE
BEGIN
    PRINT 'IMSInvestorProfileId column already exists';
END
GO
