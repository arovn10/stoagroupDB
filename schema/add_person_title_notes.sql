-- Add Title and Notes to core.Person for disambiguating guarantors (e.g. two "Ryan Nash")
-- Boss Feedback #2: Support multiple persons with same display name; optional Title/Email/Notes for UI.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Person') AND name = 'Title')
BEGIN
    ALTER TABLE core.Person ADD Title NVARCHAR(100) NULL;
    PRINT 'Added Title column to core.Person';
END
ELSE
    PRINT 'Title column already exists on core.Person';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('core.Person') AND name = 'Notes')
BEGIN
    ALTER TABLE core.Person ADD Notes NVARCHAR(MAX) NULL;
    PRINT 'Added Notes column to core.Person';
END
ELSE
    PRINT 'Notes column already exists on core.Person';
