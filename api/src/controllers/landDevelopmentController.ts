/**
 * Land Development Contacts – contact book for field use with follow-up tracking.
 * LAND_DEVELOPMENT_CONTACTS_BACKEND.md
 */

import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import { getConnection } from '../config/database';

const UPCOMING_DAYS = 14; // NextFollowUpDate within this many days => UpcomingFollowUp = true

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

export const getAllLandDevelopmentContacts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { type, city, state, upcomingOnly, q } = req.query as { type?: string; city?: string; state?: string; upcomingOnly?: string; q?: string };
    const pool = await getConnection();
    let query = `
      SELECT LandDevelopmentContactId, Name, Email, PhoneNumber, OfficeAddress, Type, Notes, City, State,
             DateOfContact, FollowUpTimeframeDays, CreatedAt, ModifiedAt
      FROM pipeline.LandDevelopmentContact
      WHERE 1=1
    `;
    const request = pool.request();
    if (type && type.trim()) {
      query += ` AND Type = @type`;
      request.input('type', sql.NVarChar(50), type.trim());
    }
    if (city && city.trim()) {
      query += ` AND City LIKE @city`;
      request.input('city', sql.NVarChar(100), `%${city.trim()}%`);
    }
    if (state && state.trim()) {
      query += ` AND State = @state`;
      request.input('state', sql.NVarChar(50), state.trim());
    }
    if (q && q.trim()) {
      query += ` AND (Name LIKE @q OR Email LIKE @q OR Notes LIKE @q)`;
      request.input('q', sql.NVarChar(255), `%${q.trim()}%`);
    }
    query += ` ORDER BY Name`;
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
        SELECT LandDevelopmentContactId, Name, Email, PhoneNumber, OfficeAddress, Type, Notes, City, State,
               DateOfContact, FollowUpTimeframeDays, CreatedAt, ModifiedAt
        FROM pipeline.LandDevelopmentContact
        WHERE LandDevelopmentContactId = @id
      `);
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Contact not found' } });
      return;
    }
    const rows = addComputedFields(result.recordset);
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
    const allowedTypes = ['Land Owner', 'Developer', 'Broker'];
    if (Type != null && Type !== '' && !allowedTypes.includes(Type)) {
      res.status(400).json({ success: false, error: { message: 'Type must be one of: Land Owner, Developer, Broker' } });
      return;
    }
    const pool = await getConnection();
    const result = await pool.request()
      .input('Name', sql.NVarChar(255), Name.trim())
      .input('Email', sql.NVarChar(255), Email ?? null)
      .input('PhoneNumber', sql.NVarChar(100), PhoneNumber ?? null)
      .input('OfficeAddress', sql.NVarChar(500), OfficeAddress ?? null)
      .input('Type', sql.NVarChar(50), Type && allowedTypes.includes(Type) ? Type : null)
      .input('Notes', sql.NVarChar(sql.MAX), Notes ?? null)
      .input('City', sql.NVarChar(100), City ?? null)
      .input('State', sql.NVarChar(50), State ?? null)
      .input('DateOfContact', sql.Date, DateOfContact ?? null)
      .input('FollowUpTimeframeDays', sql.Int, FollowUpTimeframeDays ?? null)
      .query(`
        INSERT INTO pipeline.LandDevelopmentContact (Name, Email, PhoneNumber, OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays)
        OUTPUT INSERTED.LandDevelopmentContactId, INSERTED.Name, INSERTED.Email, INSERTED.PhoneNumber, INSERTED.OfficeAddress,
               INSERTED.Type, INSERTED.Notes, INSERTED.City, INSERTED.State, INSERTED.DateOfContact, INSERTED.FollowUpTimeframeDays,
               INSERTED.CreatedAt, INSERTED.ModifiedAt
        VALUES (@Name, @Email, @PhoneNumber, @OfficeAddress, @Type, @Notes, @City, @State, @DateOfContact, @FollowUpTimeframeDays)
      `);
    const row = addComputedFields(result.recordset)[0];
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
    const allowedTypes = ['Land Owner', 'Developer', 'Broker'];
    if (Type !== undefined && Type !== null && Type !== '' && !allowedTypes.includes(Type)) {
      res.status(400).json({ success: false, error: { message: 'Type must be one of: Land Owner, Developer, Broker' } });
      return;
    }
    const pool = await getConnection();
    const check = await pool.request().input('id', sql.Int, id)
      .query('SELECT LandDevelopmentContactId FROM pipeline.LandDevelopmentContact WHERE LandDevelopmentContactId = @id');
    if (check.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Contact not found' } });
      return;
    }
    const updates: string[] = ['ModifiedAt = SYSDATETIME()'];
    const request = pool.request().input('id', sql.Int, id);
    if (Name !== undefined) { updates.push('Name = @Name'); request.input('Name', sql.NVarChar(255), Name); }
    if (Email !== undefined) { updates.push('Email = @Email'); request.input('Email', sql.NVarChar(255), Email); }
    if (PhoneNumber !== undefined) { updates.push('PhoneNumber = @PhoneNumber'); request.input('PhoneNumber', sql.NVarChar(100), PhoneNumber); }
    if (OfficeAddress !== undefined) { updates.push('OfficeAddress = @OfficeAddress'); request.input('OfficeAddress', sql.NVarChar(500), OfficeAddress); }
    if (Type !== undefined) { updates.push('Type = @Type'); request.input('Type', sql.NVarChar(50), Type && allowedTypes.includes(Type) ? Type : null); }
    if (Notes !== undefined) { updates.push('Notes = @Notes'); request.input('Notes', sql.NVarChar(sql.MAX), Notes); }
    if (City !== undefined) { updates.push('City = @City'); request.input('City', sql.NVarChar(100), City); }
    if (State !== undefined) { updates.push('State = @State'); request.input('State', sql.NVarChar(50), State); }
    if (DateOfContact !== undefined) { updates.push('DateOfContact = @DateOfContact'); request.input('DateOfContact', sql.Date, DateOfContact); }
    if (FollowUpTimeframeDays !== undefined) { updates.push('FollowUpTimeframeDays = @FollowUpTimeframeDays'); request.input('FollowUpTimeframeDays', sql.Int, FollowUpTimeframeDays); }
    await request.query(`
      UPDATE pipeline.LandDevelopmentContact SET ${updates.join(', ')} WHERE LandDevelopmentContactId = @id
    `);
    const result = await pool.request().input('id', sql.Int, id).query(`
      SELECT LandDevelopmentContactId, Name, Email, PhoneNumber, OfficeAddress, Type, Notes, City, State,
             DateOfContact, FollowUpTimeframeDays, CreatedAt, ModifiedAt
      FROM pipeline.LandDevelopmentContact WHERE LandDevelopmentContactId = @id
    `);
    const row = addComputedFields(result.recordset)[0];
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
    const result = await pool.request().input('id', sql.Int, id)
      .query('DELETE FROM pipeline.LandDevelopmentContact WHERE LandDevelopmentContactId = @id');
    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Contact not found' } });
      return;
    }
    res.json({ success: true, message: 'Contact deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * Send follow-up reminder email. Requires contactId and/or email in body; optional message.
 * If SMTP is not configured, returns 503. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM for sending.
 */
export const sendLandDevelopmentReminder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { contactId, email, message } = req.body;
    let toEmail: string | null = null;
    let contactName: string | null = null;

    if (contactId != null) {
      const pool = await getConnection();
      const contact = await pool.request()
        .input('contactId', sql.Int, contactId)
        .query('SELECT LandDevelopmentContactId, Name, Email FROM pipeline.LandDevelopmentContact WHERE LandDevelopmentContactId = @contactId');
      if (contact.recordset.length === 0) {
        res.status(400).json({ success: false, error: { message: 'Contact not found' } });
        return;
      }
      const c = contact.recordset[0];
      contactName = c.Name;
      if (c.Email && String(c.Email).trim()) toEmail = String(c.Email).trim();
    }
    if (email && typeof email === 'string' && email.trim()) {
      // Use body email when no contactId, or when contact has no email
      toEmail = email.trim();
      if (!contactName) contactName = email.trim();
    }
    if (!toEmail) {
      res.status(400).json({ success: false, error: { message: 'Neither contactId nor email provided a valid recipient' } });
      return;
    }

    const mailFrom = process.env.MAIL_FROM || process.env.SMTP_FROM;
    const smtpHost = process.env.SMTP_HOST;
    if (!smtpHost || !mailFrom) {
      res.status(503).json({
        success: false,
        error: { message: 'Email not configured. Set SMTP_HOST, MAIL_FROM (and optionally SMTP_USER, SMTP_PASS) to send reminders.' }
      });
      return;
    }

    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({
        host: smtpHost,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
      });
      const subject = contactName ? `Reminder: follow up with ${contactName}` : 'Follow-up reminder';
      const textBody = message && String(message).trim()
        ? String(message).trim()
        : (contactName ? `You asked to follow up with ${contactName}.` : `You asked to follow up with ${toEmail}.`);
      await transporter.sendMail({
        from: mailFrom,
        to: toEmail,
        subject,
        text: textBody,
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
