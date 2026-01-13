-- ============================================================
-- Add FinancingStage to banking.Loan
-- ============================================================
-- Financing Stage values:
--   Under Contract Model
--   Bank Package Model
--   Construction Loan
--   Permanent Loan
--   Liquidated

IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('banking.Loan') 
    AND name = 'FinancingStage'
)
BEGIN
    ALTER TABLE banking.Loan
    ADD FinancingStage NVARCHAR(50) NULL;
    
    PRINT 'Added FinancingStage column to banking.Loan';
END
ELSE
BEGIN
    PRINT 'FinancingStage column already exists';
END
GO

-- Update existing loans based on LoanPhase
UPDATE banking.Loan
SET FinancingStage = CASE 
    WHEN LoanPhase = 'Construction' THEN 'Construction Loan'
    WHEN LoanPhase = 'Permanent' THEN 'Permanent Loan'
    WHEN LoanPhase = 'MiniPerm' THEN 'Construction Loan'
    WHEN LoanPhase = 'Land' THEN 'Construction Loan'
    ELSE 'Construction Loan'
END
WHERE FinancingStage IS NULL;
GO

PRINT 'Updated existing loans with default FinancingStage values';
GO
