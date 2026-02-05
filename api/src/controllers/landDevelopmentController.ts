/**
 * Land Development Contacts – individuals from core.Person, land-dev details in extension.
 * LAND_DEVELOPMENT_CONTACTS_BACKEND copy.md
 * ContactId = core.Person.PersonId; list = all Persons left-joined with extension.
 */

import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import { getConnection } from '../config/database';

const UPCOMING_DAYS = 14;

function addComputedFields(rows: any[]): any[] {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + UPCOMING_DAYS);
  return rows.map((r: any) => {
    let NextFollowUpDate: string | null = null;
    if (r.DateOfContact && r.FollowUpTimeframeDays != null) {
      const d = new Date(r.DateOfContact);
      d.setDate(d.getDate() + Number(r.FollowUpTimeframeDays));
      NextFollowUpDate = d.toISOString().slice(0, 10);
    }
    const due = NextFollowUpDate ? new Date(NextFollowUpDate) : null;
    const UpcomingFollowUp = due != null && due >= now && due <= cutoff;
    return { ...r, NextFollowUpDate, UpcomingFollowUp };
  });
}

const ALLOWED_TYPES = ['Land Owner', 'Developer', 'Broker'];

/** Escape for safe use in HTML (prevents injection). */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Build STOA-styled HTML reminder body (inline CSS). */
function buildReminderHtml(contactName: string, customMessage: string | null): string {
  const name = escapeHtml(contactName);
  const msg = customMessage ? escapeHtml(customMessage) : '';
  const messageBlock = msg
    ? `<p style="margin:0;color:#6b7280;">${msg}</p>`
    : '';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f5f5f5;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="background:#7e8a6b;color:#ffffff;padding:16px 20px;font-size:18px;font-weight:600;">Deal Pipeline – Follow-up reminder</div>
    <div style="padding:20px;color:#1f2937;font-size:15px;line-height:1.6;">
      <p style="margin:0 0 12px;">You asked to follow up with <strong>${name}</strong>.</p>
      ${messageBlock}
    </div>
    <div style="padding:12px 20px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;">Land Development · STOA Group</div>
  </div>
</body>
</html>`;
}

export const getAllLandDevelopmentContacts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { type, city, state, upcomingOnly, q } = req.query as { type?: string; city?: string; state?: string; upcomingOnly?: string; q?: string };
    const pool = await getConnection();
    let query = `
      SELECT 
        p.PersonId AS ContactId,
        p.FullName AS Name,
        p.Email,
        p.Phone AS PhoneNumber,
        e.OfficeAddress,
        e.Type,
        e.Notes,
        e.City,
        e.State,
        e.DateOfContact,
        e.FollowUpTimeframeDays,
        e.CreatedAt,
        e.ModifiedAt
      FROM core.Person p
      LEFT JOIN pipeline.LandDevelopmentContactExtension e ON e.ContactId = p.PersonId
      WHERE 1=1
    `;
    const request = pool.request();
    if (type && type.trim()) {
      query += ` AND e.Type = @type`;
      request.input('type', sql.NVarChar(50), type.trim());
    }
    if (city && city.trim()) {
      query += ` AND e.City LIKE @city`;
      request.input('city', sql.NVarChar(100), `%${city.trim()}%`);
    }
    if (state && state.trim()) {
      query += ` AND e.State = @state`;
      request.input('state', sql.NVarChar(50), state.trim());
    }
    if (q && q.trim()) {
      query += ` AND (p.FullName LIKE @q OR p.Email LIKE @q OR e.Notes LIKE @q)`;
      request.input('q', sql.NVarChar(255), `%${q.trim()}%`);
    }
    query += ` ORDER BY p.FullName`;
    const result = await request.query(query);
    const computed = addComputedFields(result.recordset as any[]);
    const rows = (upcomingOnly === 'true' || upcomingOnly === '1')
      ? computed.filter((r: any) => r.UpcomingFollowUp)
      : computed;
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

export const getLandDevelopmentContactById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid id' } });
      return;
    }
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          p.PersonId AS ContactId,
          p.FullName AS Name,
          p.Email,
          p.Phone AS PhoneNumber,
          e.OfficeAddress,
          e.Type,
          e.Notes,
          e.City,
          e.State,
          e.DateOfContact,
          e.FollowUpTimeframeDays,
          e.CreatedAt,
          e.ModifiedAt
        FROM core.Person p
        LEFT JOIN pipeline.LandDevelopmentContactExtension e ON e.ContactId = p.PersonId
        WHERE p.PersonId = @id
      `);
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Contact not found' } });
      return;
    }
    const rows = addComputedFields(result.recordset as any[]);
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};

export const createLandDevelopmentContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { Name, Email, PhoneNumber, OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays } = req.body;
    if (!Name || typeof Name !== 'string' || !Name.trim()) {
      res.status(400).json({ success: false, error: { message: 'Name is required' } });
      return;
    }
    if (Type != null && Type !== '' && !ALLOWED_TYPES.includes(Type)) {
      res.status(400).json({ success: false, error: { message: 'Type must be one of: Land Owner, Developer, Broker' } });
      return;
    }
    const pool = await getConnection();
    const insertResult = await pool.request()
      .input('FullName', sql.NVarChar(255), Name.trim())
      .input('Email', sql.NVarChar(255), Email ?? null)
      .input('Phone', sql.NVarChar(50), PhoneNumber ?? null)
      .query(`
        INSERT INTO core.Person (FullName, Email, Phone)
        OUTPUT INSERTED.PersonId
        VALUES (@FullName, @Email, @Phone)
      `);
    const contactId = parseInt(String(insertResult.recordset[0].PersonId), 10);
    if (!Number.isFinite(contactId)) {
      res.status(500).json({ success: false, error: { message: 'Failed to create contact' } });
      return;
    }
    await pool.request()
      .input('ContactId', sql.Int, contactId)
      .input('OfficeAddress', sql.NVarChar(500), OfficeAddress ?? null)
      .input('Type', sql.NVarChar(50), Type && ALLOWED_TYPES.includes(Type) ? Type : null)
      .input('Notes', sql.NVarChar(sql.MAX), Notes ?? null)
      .input('City', sql.NVarChar(100), City ?? null)
      .input('State', sql.NVarChar(50), State ?? null)
      .input('DateOfContact', sql.Date, DateOfContact ?? null)
      .input('FollowUpTimeframeDays', sql.Int, FollowUpTimeframeDays ?? null)
      .query(`
        INSERT INTO pipeline.LandDevelopmentContactExtension (ContactId, OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays)
        VALUES (@ContactId, @OfficeAddress, @Type, @Notes, @City, @State, @DateOfContact, @FollowUpTimeframeDays)
      `);
    const getResult = await pool.request().input('id', sql.Int, contactId).query(`
      SELECT p.PersonId AS ContactId, p.FullName AS Name, p.Email, p.Phone AS PhoneNumber,
             e.OfficeAddress, e.Type, e.Notes, e.City, e.State, e.DateOfContact, e.FollowUpTimeframeDays, e.CreatedAt, e.ModifiedAt
      FROM core.Person p
      LEFT JOIN pipeline.LandDevelopmentContactExtension e ON e.ContactId = p.PersonId
      WHERE p.PersonId = @id
    `);
    const row = addComputedFields(getResult.recordset as any[])[0];
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    next(error);
  }
};

export const updateLandDevelopmentContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid id' } });
      return;
    }
    const { Name, Email, PhoneNumber, OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays } = req.body;
    if (Type !== undefined && Type !== null && Type !== '' && !ALLOWED_TYPES.includes(Type)) {
      res.status(400).json({ success: false, error: { message: 'Type must be one of: Land Owner, Developer, Broker' } });
      return;
    }
    const pool = await getConnection();
    const personCheck = await pool.request().input('id', sql.Int, id).query('SELECT PersonId FROM core.Person WHERE PersonId = @id');
    if (personCheck.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Contact not found' } });
      return;
    }
    if (Name !== undefined || Email !== undefined || PhoneNumber !== undefined) {
      const updates: string[] = [];
      const reqPerson = pool.request().input('id', sql.Int, id);
      if (Name !== undefined) { updates.push('FullName = @FullName'); reqPerson.input('FullName', sql.NVarChar(255), Name); }
      if (Email !== undefined) { updates.push('Email = @Email'); reqPerson.input('Email', sql.NVarChar(255), Email); }
      if (PhoneNumber !== undefined) { updates.push('Phone = @Phone'); reqPerson.input('Phone', sql.NVarChar(50), PhoneNumber); }
      if (updates.length) await reqPerson.query(`UPDATE core.Person SET ${updates.join(', ')} WHERE PersonId = @id`);
    }
    const extExists = await pool.request().input('id', sql.Int, id).query('SELECT ContactId FROM pipeline.LandDevelopmentContactExtension WHERE ContactId = @id');
    if (extExists.recordset.length > 0) {
      const updates: string[] = ['ModifiedAt = SYSDATETIME()'];
      const reqExt = pool.request().input('id', sql.Int, id);
      if (OfficeAddress !== undefined) { updates.push('OfficeAddress = @OfficeAddress'); reqExt.input('OfficeAddress', sql.NVarChar(500), OfficeAddress); }
      if (Type !== undefined) { updates.push('Type = @Type'); reqExt.input('Type', sql.NVarChar(50), Type && ALLOWED_TYPES.includes(Type) ? Type : null); }
      if (Notes !== undefined) { updates.push('Notes = @Notes'); reqExt.input('Notes', sql.NVarChar(sql.MAX), Notes); }
      if (City !== undefined) { updates.push('City = @City'); reqExt.input('City', sql.NVarChar(100), City); }
      if (State !== undefined) { updates.push('State = @State'); reqExt.input('State', sql.NVarChar(50), State); }
      if (DateOfContact !== undefined) { updates.push('DateOfContact = @DateOfContact'); reqExt.input('DateOfContact', sql.Date, DateOfContact); }
      if (FollowUpTimeframeDays !== undefined) { updates.push('FollowUpTimeframeDays = @FollowUpTimeframeDays'); reqExt.input('FollowUpTimeframeDays', sql.Int, FollowUpTimeframeDays); }
      if (updates.length > 1) await reqExt.query(`UPDATE pipeline.LandDevelopmentContactExtension SET ${updates.join(', ')} WHERE ContactId = @id`);
    } else {
      await pool.request()
        .input('ContactId', sql.Int, id)
        .input('OfficeAddress', sql.NVarChar(500), OfficeAddress ?? null)
        .input('Type', sql.NVarChar(50), Type && ALLOWED_TYPES.includes(Type) ? Type : null)
        .input('Notes', sql.NVarChar(sql.MAX), Notes ?? null)
        .input('City', sql.NVarChar(100), City ?? null)
        .input('State', sql.NVarChar(50), State ?? null)
        .input('DateOfContact', sql.Date, DateOfContact ?? null)
        .input('FollowUpTimeframeDays', sql.Int, FollowUpTimeframeDays ?? null)
        .query(`
          INSERT INTO pipeline.LandDevelopmentContactExtension (ContactId, OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays)
          VALUES (@ContactId, @OfficeAddress, @Type, @Notes, @City, @State, @DateOfContact, @FollowUpTimeframeDays)
        `);
    }
    const getResult = await pool.request().input('id', sql.Int, id).query(`
      SELECT p.PersonId AS ContactId, p.FullName AS Name, p.Email, p.Phone AS PhoneNumber,
             e.OfficeAddress, e.Type, e.Notes, e.City, e.State, e.DateOfContact, e.FollowUpTimeframeDays, e.CreatedAt, e.ModifiedAt
      FROM core.Person p
      LEFT JOIN pipeline.LandDevelopmentContactExtension e ON e.ContactId = p.PersonId
      WHERE p.PersonId = @id
    `);
    const row = addComputedFields(getResult.recordset as any[])[0];
    res.json({ success: true, data: row });
  } catch (error) {
    next(error);
  }
};

export const deleteLandDevelopmentContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid id' } });
      return;
    }
    const pool = await getConnection();
    const personCheck = await pool.request().input('id', sql.Int, id).query('SELECT PersonId FROM core.Person WHERE PersonId = @id');
    if (personCheck.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Contact not found' } });
      return;
    }
    await pool.request().input('id', sql.Int, id).query('DELETE FROM pipeline.LandDevelopmentContactExtension WHERE ContactId = @id');
    res.json({ success: true, message: 'Land development attributes removed' });
  } catch (error) {
    next(error);
  }
};

export const sendLandDevelopmentReminder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { contactId, contactIds, email, message } = req.body as {
      contactId?: number;
      contactIds?: number[];
      email?: string;
      message?: string;
    };

    const isBatch = Array.isArray(contactIds) && contactIds.length > 0;
    const hasSingle = contactId != null || (typeof email === 'string' && email.trim());
    if (!isBatch && !hasSingle) {
      res.status(400).json({
        success: false,
        error: { message: 'Provide contactId, email, or contactIds (array) for at least one recipient.' },
      });
      return;
    }

    const mailFrom = process.env.MAIL_FROM || process.env.SMTP_FROM;
    const smtpHost = process.env.SMTP_HOST;
    if (!smtpHost || !mailFrom) {
      res.status(503).json({
        success: false,
        error: { message: 'Email not configured. Set SMTP_HOST, MAIL_FROM (and optionally SMTP_USER, SMTP_PASS or SMTP_PASSWORD) to send reminders.' },
      });
      return;
    }

    const nodemailer = await import('nodemailer');
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const transporter = nodemailer.default.createTransport({
      host: smtpHost,
      port,
      secure: process.env.SMTP_SECURE === 'true',
      requireTLS: port === 587,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '' } : undefined,
    });
    const customMessage = message && String(message).trim() ? String(message).trim() : null;

    if (isBatch) {
      const pool = await getConnection();
      let sent = 0;
      const failed: { contactId?: number; email?: string; error: string }[] = [];
      for (const cid of contactIds!) {
        const id = typeof cid === 'number' ? cid : parseInt(String(cid), 10);
        if (isNaN(id)) {
          failed.push({ contactId: cid as number, error: 'Invalid contact id' });
          continue;
        }
        const contact = await pool.request()
          .input('contactId', sql.Int, id)
          .query('SELECT PersonId, FullName, Email FROM core.Person WHERE PersonId = @contactId');
        if (contact.recordset.length === 0) {
          failed.push({ contactId: id, error: 'Contact not found' });
          continue;
        }
        const c = contact.recordset[0] as { FullName?: string; Email?: string };
        const toEmail = c.Email && String(c.Email).trim() ? String(c.Email).trim() : null;
        if (!toEmail) {
          failed.push({ contactId: id, error: 'No email on file' });
          continue;
        }
        const contactName = (c.FullName && String(c.FullName).trim()) ? String(c.FullName).trim() : toEmail;
        const subject = `Follow-up reminder: ${contactName}`;
        const htmlBody = buildReminderHtml(contactName, customMessage);
        const textBody = customMessage || `You asked to follow up with ${contactName}.`;
        try {
          await transporter.sendMail({ from: mailFrom, to: toEmail, subject, text: textBody, html: htmlBody });
          sent++;
        } catch (err: any) {
          failed.push({ contactId: id, error: err?.message || 'Failed to send' });
        }
      }
      const adHocEmail = typeof email === 'string' && email.trim() ? email.trim() : null;
      if (adHocEmail) {
        try {
          await transporter.sendMail({
            from: mailFrom,
            to: adHocEmail,
            subject: 'Follow-up reminder',
            text: customMessage || `You asked to follow up with ${adHocEmail}.`,
            html: buildReminderHtml(adHocEmail, customMessage),
          });
          sent++;
        } catch (err: any) {
          failed.push({ email: adHocEmail, error: err?.message || 'Failed to send' });
        }
      }
      res.json({ success: true, sent, failed });
      return;
    }

    let toEmail: string | null = null;
    let contactName: string | null = null;
    if (contactId != null) {
      const pool = await getConnection();
      const contact = await pool.request()
        .input('contactId', sql.Int, contactId)
        .query('SELECT PersonId, FullName, Email FROM core.Person WHERE PersonId = @contactId');
      if (contact.recordset.length === 0) {
        res.status(400).json({ success: false, error: { message: 'Contact not found' } });
        return;
      }
      const c = contact.recordset[0] as { FullName?: string; Email?: string };
      contactName = (c.FullName && String(c.FullName).trim()) ? String(c.FullName).trim() : null;
      if (c.Email && String(c.Email).trim()) toEmail = String(c.Email).trim();
    }
    if (typeof email === 'string' && email.trim()) {
      toEmail = email.trim();
      if (!contactName) contactName = email.trim();
    }
    if (!toEmail) {
      res.status(400).json({ success: false, error: { message: 'Neither contactId nor email provided a valid recipient' } });
      return;
    }

    const subject = contactName ? `Follow-up reminder: ${contactName}` : 'Follow-up reminder';
    const textBody = customMessage
      ? customMessage
      : (contactName ? `You asked to follow up with ${contactName}.` : `You asked to follow up with ${toEmail}.`);
    const displayName = contactName || toEmail;
    const htmlBody = buildReminderHtml(displayName, customMessage);
    try {
      await transporter.sendMail({
        from: mailFrom,
        to: toEmail,
        subject,
        text: textBody,
        html: htmlBody,
      });
    } catch (mailError: any) {
      console.error('Land development reminder send failed:', mailError);
      res.status(500).json({ success: false, error: { message: 'Failed to send reminder email' } });
      return;
    }
    res.json({ success: true, message: 'Reminder sent' });
  } catch (error) {
    next(error);
  }
};
