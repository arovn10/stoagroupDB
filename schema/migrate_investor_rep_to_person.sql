-- ============================================================
-- MIGRATE INVESTOR REP FIELDS TO Person TABLE
-- Moves InvestorRepName, InvestorRepEmail, InvestorRepPhone
-- from core.EquityPartner to core.Person and links via InvestorRepId
-- ============================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

PRINT '============================================================';
PRINT 'Migrating Investor Rep fields to Person table';
PRINT '============================================================';
PRINT '';

BEGIN TRY
    -- Step 1: Add InvestorRepId column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID('core.EquityPartner')
          AND name = 'InvestorRepId'
    )
    BEGIN
        PRINT '1. Adding InvestorRepId column to core.EquityPartner...';
        ALTER TABLE core.EquityPartner
        ADD InvestorRepId INT NULL;
        PRINT '   ✓ Column added';
        PRINT '';
    END
    ELSE
    BEGIN
        PRINT '1. InvestorRepId column already exists';
        PRINT '';
    END

END TRY
BEGIN CATCH
    PRINT '❌ ERROR in Step 1: ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO

BEGIN TRY
    -- Step 2: Create Person records for existing investor reps (only if old columns exist)
    IF EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID('core.EquityPartner')
          AND name = 'InvestorRepName'
    )
    BEGIN
        PRINT '2. Creating Person records for existing investor reps...';
        
        DECLARE @CreatedPersons INT = 0;
        DECLARE @SQL NVARCHAR(MAX);
        
        -- Use dynamic SQL to avoid validation errors if columns don't exist
        SET @SQL = N'
        INSERT INTO core.Person (FullName, Email, Phone)
        SELECT DISTINCT
            ep.InvestorRepName,
            ep.InvestorRepEmail,
            ep.InvestorRepPhone
        FROM core.EquityPartner ep
        WHERE ep.InvestorRepName IS NOT NULL
          AND ep.InvestorRepName <> ''''
          AND NOT EXISTS (
              SELECT 1
              FROM core.Person p
              WHERE p.FullName = ep.InvestorRepName COLLATE Latin1_General_CI_AS
                AND (p.Email = ep.InvestorRepEmail OR (p.Email IS NULL AND ep.InvestorRepEmail IS NULL))
                AND (p.Phone = ep.InvestorRepPhone OR (p.Phone IS NULL AND ep.InvestorRepPhone IS NULL))
          );
        ';
        
        EXEC sp_executesql @SQL;
        SET @CreatedPersons = @@ROWCOUNT;
        PRINT '   ✓ Created ' + CAST(@CreatedPersons AS NVARCHAR(10)) + ' Person records';
        PRINT '';
    END
    ELSE
    BEGIN
        PRINT '2. Old InvestorRep columns do not exist - skipping data migration';
        PRINT '   (Database may have already been migrated or uses new schema)';
        PRINT '';
    END

END TRY
BEGIN CATCH
    PRINT '❌ ERROR in Step 2: ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO

BEGIN TRY
    -- Step 3: Link EquityPartner records to Person records (only if old columns exist)
    IF EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID('core.EquityPartner')
          AND name = 'InvestorRepName'
    )
    BEGIN
        PRINT '3. Linking EquityPartner records to Person records...';
        
        DECLARE @UpdatedEquityPartners INT = 0;
        DECLARE @SQL2 NVARCHAR(MAX);
        
        -- Use dynamic SQL to avoid validation errors if columns don't exist
        SET @SQL2 = N'
        UPDATE ep
        SET InvestorRepId = p.PersonId
        FROM core.EquityPartner ep
        INNER JOIN core.Person p ON 
            p.FullName = ep.InvestorRepName COLLATE Latin1_General_CI_AS
            AND (p.Email = ep.InvestorRepEmail OR (p.Email IS NULL AND ep.InvestorRepEmail IS NULL))
            AND (p.Phone = ep.InvestorRepPhone OR (p.Phone IS NULL AND ep.InvestorRepPhone IS NULL))
        WHERE ep.InvestorRepName IS NOT NULL
          AND ep.InvestorRepName <> ''''
          AND ep.InvestorRepId IS NULL;
        ';
        
        EXEC sp_executesql @SQL2;
        SET @UpdatedEquityPartners = @@ROWCOUNT;
        PRINT '   ✓ Linked ' + CAST(@UpdatedEquityPartners AS NVARCHAR(10)) + ' EquityPartner records';
        PRINT '';
    END
    ELSE
    BEGIN
        PRINT '3. Old InvestorRep columns do not exist - skipping linking step';
        PRINT '';
    END

END TRY
BEGIN CATCH
    PRINT '❌ ERROR in Step 3: ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO

BEGIN TRY
    -- Step 4: Add foreign key constraint
    IF NOT EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID('core.EquityPartner')
          AND name = 'FK_EquityPartner_InvestorRep'
    )
    BEGIN
        PRINT '4. Adding foreign key constraint FK_EquityPartner_InvestorRep...';
        ALTER TABLE core.EquityPartner
        ADD CONSTRAINT FK_EquityPartner_InvestorRep 
        FOREIGN KEY (InvestorRepId) REFERENCES core.Person(PersonId);
        PRINT '   ✓ Foreign key constraint added';
        PRINT '';
    END
    ELSE
    BEGIN
        PRINT '4. Foreign key constraint FK_EquityPartner_InvestorRep already exists';
        PRINT '';
    END

    -- Step 5: Drop old columns (only if they exist and all data has been migrated)
    IF EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID('core.EquityPartner')
          AND name = 'InvestorRepName'
    )
    BEGIN
        DECLARE @UnmigratedCount INT;
        DECLARE @SQL3 NVARCHAR(MAX);
        
        -- Use dynamic SQL to check unmigrated count
        SET @SQL3 = N'
        SELECT @Count = COUNT(*)
        FROM core.EquityPartner
        WHERE InvestorRepName IS NOT NULL
          AND InvestorRepName <> ''''
          AND InvestorRepId IS NULL;
        ';
        
        EXEC sp_executesql @SQL3, N'@Count INT OUTPUT', @Count = @UnmigratedCount OUTPUT;
        
        IF @UnmigratedCount = 0
        BEGIN
            PRINT '5. Dropping old InvestorRep columns...';
            
            IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.EquityPartner') AND name = 'InvestorRepName')
            BEGIN
                ALTER TABLE core.EquityPartner DROP COLUMN InvestorRepName;
                PRINT '   ✓ Dropped InvestorRepName';
            END
            
            IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.EquityPartner') AND name = 'InvestorRepEmail')
            BEGIN
                ALTER TABLE core.EquityPartner DROP COLUMN InvestorRepEmail;
                PRINT '   ✓ Dropped InvestorRepEmail';
            END
            
            IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.EquityPartner') AND name = 'InvestorRepPhone')
            BEGIN
                ALTER TABLE core.EquityPartner DROP COLUMN InvestorRepPhone;
                PRINT '   ✓ Dropped InvestorRepPhone';
            END
            
            PRINT '';
        END
        ELSE
        BEGIN
            PRINT '5. Skipping column drop - ' + CAST(@UnmigratedCount AS NVARCHAR(10)) + ' records still need migration';
            PRINT '   (Old columns will remain until all data is migrated)';
            PRINT '';
        END
    END
    ELSE
    BEGIN
        PRINT '5. Old InvestorRep columns do not exist - nothing to drop';
        PRINT '';
    END

    PRINT '============================================================';
    PRINT 'Migration completed successfully!';
    PRINT '============================================================';
    PRINT '';

END TRY
BEGIN CATCH
    PRINT '❌ ERROR during migration: ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO

-- Verification
PRINT 'Verifying migration results:';
SELECT 
    COUNT(*) AS TotalEquityPartners,
    SUM(CASE WHEN InvestorRepId IS NOT NULL THEN 1 ELSE 0 END) AS PartnersWithInvestorRep,
    SUM(CASE WHEN InvestorRepId IS NULL THEN 1 ELSE 0 END) AS PartnersWithoutInvestorRep
FROM core.EquityPartner;
GO

PRINT 'Sample of migrated data:';
SELECT TOP 5
    ep.PartnerName,
    p.FullName AS InvestorRepName,
    p.Email AS InvestorRepEmail,
    p.Phone AS InvestorRepPhone
FROM core.EquityPartner ep
LEFT JOIN core.Person p ON ep.InvestorRepId = p.PersonId
WHERE ep.InvestorRepId IS NOT NULL;
GO
