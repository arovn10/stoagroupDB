-- Enforce: one Individual equity partner per person (contacts and individual investors are the same table; no duplicate people).
-- Individual partners link to core.Person via InvestorRepId. At most one EquityPartner per Person when PartnerType = 'Individual'.

-- 1. Merge any existing duplicate Individual partners that share the same InvestorRepId (keep lowest EquityPartnerId, reassign refs, delete others).
-- Loop until no Person has more than one Individual partner.
DECLARE @KeepId INT, @MergeId INT, @PersonId INT;

WHILE EXISTS (
  SELECT 1 FROM core.EquityPartner
  WHERE PartnerType = N'Individual' AND InvestorRepId IS NOT NULL
  GROUP BY InvestorRepId
  HAVING COUNT(*) > 1
)
BEGIN
  SELECT TOP 1 @PersonId = InvestorRepId
  FROM core.EquityPartner
  WHERE PartnerType = N'Individual' AND InvestorRepId IS NOT NULL
  GROUP BY InvestorRepId
  HAVING COUNT(*) > 1;

  SELECT @KeepId = MIN(EquityPartnerId), @MergeId = MAX(EquityPartnerId)
  FROM core.EquityPartner
  WHERE PartnerType = N'Individual' AND InvestorRepId = @PersonId;

  -- Reassign lead commitments to kept partner
  UPDATE banking.EquityCommitment SET EquityPartnerId = @KeepId WHERE EquityPartnerId = @MergeId;
  -- Reassign related-party links to kept partner
  UPDATE banking.EquityCommitmentRelatedParty SET RelatedPartyId = @KeepId WHERE RelatedPartyId = @MergeId;
  -- Dedupe (EquityCommitmentId, RelatedPartyId)
  ;WITH cte AS (
    SELECT EquityCommitmentRelatedPartyId,
      ROW_NUMBER() OVER (PARTITION BY EquityCommitmentId, RelatedPartyId ORDER BY EquityCommitmentRelatedPartyId) AS rn
    FROM banking.EquityCommitmentRelatedParty
  )
  DELETE FROM banking.EquityCommitmentRelatedParty
  WHERE EquityCommitmentRelatedPartyId IN (SELECT EquityCommitmentRelatedPartyId FROM cte WHERE rn > 1);
  -- Delete duplicate partner
  DELETE FROM core.EquityPartner WHERE EquityPartnerId = @MergeId;
END;

GO

-- 2. Add filtered unique index: one Individual per Person (InvestorRepId).
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('core.EquityPartner')
    AND name = 'UQ_EquityPartner_Individual_Person'
)
BEGIN
  CREATE UNIQUE INDEX UQ_EquityPartner_Individual_Person
  ON core.EquityPartner(InvestorRepId)
  WHERE PartnerType = N'Individual' AND InvestorRepId IS NOT NULL;
  PRINT 'Added unique index UQ_EquityPartner_Individual_Person (one Individual equity partner per Person).';
END
ELSE
  PRINT 'UQ_EquityPartner_Individual_Person already exists.';
