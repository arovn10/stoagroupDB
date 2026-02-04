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
    await pool.request()
      .input('FullName', sql.NVarChar(255), Name.trim())
      .input('Email', sql.NVarChar(255), Email ?? null)
      .input('Phone', sql.NVarChar(50), PhoneNumber ?? null)
      .query(`
        INSERT INTO core.Person (FullName, Email, Phone)
        VALUES (@FullName, @Email, @Phone)
      `);
    const idResult = await pool.request().query('SELECT SCOPE_IDENTITY() AS ContactId');
    const contactId = parseInt(String(idResult.recordset[0].ContactId), 10);
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
    const { contactId, email, message } = req.body;
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
      const c = contact.recordset[0];
      contactName = c.FullName;
      if (c.Email && String(c.Email).trim()) toEmail = String(c.Email).trim();
    }
    if (email && typeof email === 'string' && email.trim()) {
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
      const port = parseInt(process.env.SMTP_PORT || '587', 10);
      const transporter = nodemailer.default.createTransport({
        host: smtpHost,
        port,
        secure: process.env.SMTP_SECURE === 'true',
        requireTLS: port === 587,
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
