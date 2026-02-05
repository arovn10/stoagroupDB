-- Covenant reminder settings for Banking Dashboard email service.
-- bankingnotificationguide: ReminderEmails (comma-separated), ReminderDaysBefore (e.g. 7,14,30).

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('banking.Covenant') AND name = 'ReminderEmails')
BEGIN
  ALTER TABLE banking.Covenant ADD ReminderEmails NVARCHAR(MAX) NULL;
  PRINT 'Added ReminderEmails to banking.Covenant';
END
ELSE
  PRINT 'ReminderEmails already exists on banking.Covenant';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('banking.Covenant') AND name = 'ReminderDaysBefore')
BEGIN
  ALTER TABLE banking.Covenant ADD ReminderDaysBefore NVARCHAR(100) NULL;  -- e.g. "7,14,30"
  PRINT 'Added ReminderDaysBefore to banking.Covenant';
END
ELSE
  PRINT 'ReminderDaysBefore already exists on banking.Covenant';
