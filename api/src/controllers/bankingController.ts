import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { getConnection } from '../config/database';
import { normalizeState, normalizeStateInPayload } from '../utils/stateAbbrev';
import { wrapStoaEmailLayout } from '../utils/stoaEmailLayout';
import { getFullPath, getRelativeStoragePath, buildBankingFileStoragePath } from '../middleware/uploadMiddleware';
import {
  isBlobStorageConfigured,
  uploadBufferToBlob,
  downloadBlobToBuffer,
  blobExists,
  deleteBlob as deleteBlobFile,
} from '../config/azureBlob';

// ============================================================
// LOAN CONTROLLER
// ============================================================

/** Coerce value to string or null for NVarChar params (driver rejects non-strings). */
function toVarChar(val: unknown): string | null {
  if (val == null || val === '') return null;
  return String(val);
}

// ============================================================
// PRESENCE (who's viewing the banking dashboard – in-memory, TTL 2 min)
// ============================================================
const PRESENCE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const presenceStore = new Map<string, { userId: number; userName: string; email: string; lastSeen: Date }>();

function prunePresence(): void {
  const now = Date.now();
  for (const [key, entry] of presenceStore.entries()) {
    if (now - entry.lastSeen.getTime() > PRESENCE_TTL_MS) presenceStore.delete(key);
  }
}

export const reportPresence = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: { message: 'Not authenticated' } });
      return;
    }
    const body = req.body || {};
    const key = String(user.userId);
    const userName = body.userName != null ? String(body.userName) : (user.username || '');
    const email = body.email != null ? String(body.email) : (user.email || '');
    presenceStore.set(key, {
      userId: user.userId,
      userName: userName || String(user.userId),
      email,
      lastSeen: new Date()
    });
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const getPresence = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    prunePresence();
    const now = Date.now();
    const users = Array.from(presenceStore.values())
      .filter((e) => now - e.lastSeen.getTime() <= PRESENCE_TTL_MS)
      .map((e) => ({
        userId: e.userId,
        userName: e.userName,
        email: e.email,
        lastSeen: e.lastSeen.toISOString()
      }));
    res.json({ success: true, data: { users } });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// ENTITIES (Option B: entity-projects – BACKEND-GUIDE-DEALS-LTC-MISC-LOANS §4)
// List projects where ProductType = 'Entity'. Entity loans: use GET /loans/project/:projectId.
// ============================================================

export const getBankingEntities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const [projectsResult, partnersResult] = await Promise.all([
      pool.request().query(`
        SELECT 
          ProjectId, ProjectName, City, State, Region, Address, Units,
          ProductType, Stage, EstimatedConstructionStartDate, LTCOriginal,
          CreatedAt, UpdatedAt
        FROM core.Project
        WHERE LTRIM(RTRIM(ISNULL(ProductType, N''))) = N'Entity'
        ORDER BY ProjectName
      `),
      pool.request().query(`
        SELECT EquityPartnerId, PartnerName, PartnerType, InvestorRepId, Notes
        FROM core.EquityPartner
        WHERE LTRIM(RTRIM(ISNULL(PartnerType, N''))) = N'Entity'
        ORDER BY PartnerName
      `),
    ]);
    res.json({
      success: true,
      data: {
        projects: projectsResult.recordset,
        entities: partnersResult.recordset,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// BANKING CONTACTS (core.Person + banking.BankingContactExtension)
// Role: Banker, Broker, Developer, Other. Notes on person (core) and banking-specific (extension).
// ============================================================

const BANKING_CONTACT_ROLES = ['Banker', 'Broker', 'Developer', 'Other'] as const;

export const getAllBankingContacts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { role, q } = req.query as { role?: string; q?: string };
    const pool = await getConnection();
    let query = `
      SELECT
        p.PersonId AS ContactId,
        p.FullName AS Name,
        p.Email,
        p.Phone AS PhoneNumber,
        p.Title,
        p.Notes AS Notes,
        e.Role,
        e.Notes AS BankingNotes,
        e.CreatedAt,
        e.ModifiedAt
      FROM core.Person p
      INNER JOIN banking.BankingContactExtension e ON e.ContactId = p.PersonId
      WHERE 1=1
    `;
    const request = pool.request();
    if (role && role.trim() && BANKING_CONTACT_ROLES.includes(role.trim() as typeof BANKING_CONTACT_ROLES[number])) {
      query += ` AND e.Role = @role`;
      request.input('role', sql.NVarChar(50), role.trim());
    }
    if (q && typeof q === 'string' && q.trim()) {
      query += ` AND (p.FullName LIKE @q OR p.Email LIKE @q OR p.Notes LIKE @q OR e.Notes LIKE @q)`;
      request.input('q', sql.NVarChar(255), `%${q.trim()}%`);
    }
    query += ` ORDER BY p.FullName`;
    const result = await request.query(query);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getBankingContactById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
          p.Title,
          p.Notes AS Notes,
          e.Role,
          e.Notes AS BankingNotes,
          e.CreatedAt,
          e.ModifiedAt
        FROM core.Person p
        INNER JOIN banking.BankingContactExtension e ON e.ContactId = p.PersonId
        WHERE p.PersonId = @id
      `);
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Contact not found' } });
      return;
    }
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const createBankingContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { Name, Email, PhoneNumber, Title, Notes, Role, BankingNotes } = req.body;
    if (!Name || typeof Name !== 'string' || !Name.trim()) {
      res.status(400).json({ success: false, error: { message: 'Name is required' } });
      return;
    }
    if (Role != null && Role !== '' && !BANKING_CONTACT_ROLES.includes(Role)) {
      res.status(400).json({ success: false, error: { message: 'Role must be one of: Banker, Broker, Developer, Other' } });
      return;
    }
    const pool = await getConnection();
    const insertResult = await pool.request()
      .input('FullName', sql.NVarChar(255), Name.trim())
      .input('Email', sql.NVarChar(255), Email ?? null)
      .input('Phone', sql.NVarChar(50), PhoneNumber ?? null)
      .input('Title', sql.NVarChar(100), Title ?? null)
      .input('Notes', sql.NVarChar(sql.MAX), Notes ?? null)
      .query(`
        INSERT INTO core.Person (FullName, Email, Phone, Title, Notes)
        OUTPUT INSERTED.PersonId
        VALUES (@FullName, @Email, @Phone, @Title, @Notes)
      `);
    const contactId = parseInt(String(insertResult.recordset[0].PersonId), 10);
    if (!Number.isFinite(contactId)) {
      res.status(500).json({ success: false, error: { message: 'Failed to create contact' } });
      return;
    }
    const roleVal = Role && BANKING_CONTACT_ROLES.includes(Role) ? Role : null;
    await pool.request()
      .input('ContactId', sql.Int, contactId)
      .input('Role', sql.NVarChar(50), roleVal)
      .input('Notes', sql.NVarChar(sql.MAX), BankingNotes ?? null)
      .query(`
        INSERT INTO banking.BankingContactExtension (ContactId, Role, Notes)
        VALUES (@ContactId, @Role, @Notes)
      `);
    const getResult = await pool.request().input('id', sql.Int, contactId).query(`
      SELECT p.PersonId AS ContactId, p.FullName AS Name, p.Email, p.Phone AS PhoneNumber,
             p.Title, p.Notes AS Notes, e.Role, e.Notes AS BankingNotes, e.CreatedAt, e.ModifiedAt
      FROM core.Person p
      INNER JOIN banking.BankingContactExtension e ON e.ContactId = p.PersonId
      WHERE p.PersonId = @id
    `);
    res.status(201).json({ success: true, data: getResult.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const updateBankingContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid id' } });
      return;
    }
    const { Name, Email, PhoneNumber, Title, Notes, Role, BankingNotes } = req.body;
    if (Role !== undefined && Role !== null && Role !== '' && !BANKING_CONTACT_ROLES.includes(Role)) {
      res.status(400).json({ success: false, error: { message: 'Role must be one of: Banker, Broker, Developer, Other' } });
      return;
    }
    const pool = await getConnection();
    const personCheck = await pool.request().input('id', sql.Int, id).query('SELECT PersonId FROM core.Person WHERE PersonId = @id');
    if (personCheck.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Contact not found' } });
      return;
    }
    if (Name !== undefined || Email !== undefined || PhoneNumber !== undefined || Title !== undefined || Notes !== undefined) {
      const updates: string[] = [];
      const reqPerson = pool.request().input('id', sql.Int, id);
      if (Name !== undefined) { updates.push('FullName = @FullName'); reqPerson.input('FullName', sql.NVarChar(255), Name); }
      if (Email !== undefined) { updates.push('Email = @Email'); reqPerson.input('Email', sql.NVarChar(255), Email); }
      if (PhoneNumber !== undefined) { updates.push('Phone = @Phone'); reqPerson.input('Phone', sql.NVarChar(50), PhoneNumber); }
      if (Title !== undefined) { updates.push('Title = @Title'); reqPerson.input('Title', sql.NVarChar(100), Title); }
      if (Notes !== undefined) { updates.push('Notes = @Notes'); reqPerson.input('Notes', sql.NVarChar(sql.MAX), Notes); }
      if (updates.length) await reqPerson.query(`UPDATE core.Person SET ${updates.join(', ')} WHERE PersonId = @id`);
    }
    const extExists = await pool.request().input('id', sql.Int, id).query('SELECT ContactId FROM banking.BankingContactExtension WHERE ContactId = @id');
    if (extExists.recordset.length > 0) {
      const updates: string[] = ['ModifiedAt = SYSDATETIME()'];
      const reqExt = pool.request().input('id', sql.Int, id);
      if (Role !== undefined) { updates.push('Role = @Role'); reqExt.input('Role', sql.NVarChar(50), Role && BANKING_CONTACT_ROLES.includes(Role) ? Role : null); }
      if (BankingNotes !== undefined) { updates.push('Notes = @Notes'); reqExt.input('Notes', sql.NVarChar(sql.MAX), BankingNotes); }
      if (updates.length > 1) await reqExt.query(`UPDATE banking.BankingContactExtension SET ${updates.join(', ')} WHERE ContactId = @id`);
    }
    const getResult = await pool.request().input('id', sql.Int, id).query(`
      SELECT p.PersonId AS ContactId, p.FullName AS Name, p.Email, p.Phone AS PhoneNumber,
             p.Title, p.Notes AS Notes, e.Role, e.Notes AS BankingNotes, e.CreatedAt, e.ModifiedAt
      FROM core.Person p
      INNER JOIN banking.BankingContactExtension e ON e.ContactId = p.PersonId
      WHERE p.PersonId = @id
    `);
    res.json({ success: true, data: getResult.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const deleteBankingContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid id' } });
      return;
    }
    const pool = await getConnection();
    const extCheck = await pool.request().input('id', sql.Int, id).query('SELECT ContactId FROM banking.BankingContactExtension WHERE ContactId = @id');
    if (extCheck.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Contact not found' } });
      return;
    }
    await pool.request().input('id', sql.Int, id).query('DELETE FROM banking.BankingContactExtension WHERE ContactId = @id');
    res.json({ success: true, message: 'Banking contact removed' });
  } catch (error) {
    next(error);
  }
};

/** Add banking team attributes (Role, Notes) to an existing core.Person. Master contact lives in core; this only creates the extension row. */
export const addBankingContactExtension = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const personId = parseInt(req.params.personId, 10);
    if (isNaN(personId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid personId' } });
      return;
    }
    const { Role, BankingNotes } = req.body;
    if (Role != null && Role !== '' && !BANKING_CONTACT_ROLES.includes(Role)) {
      res.status(400).json({ success: false, error: { message: 'Role must be one of: Banker, Broker, Developer, Other' } });
      return;
    }
    const pool = await getConnection();
    const personCheck = await pool.request().input('id', sql.Int, personId).query('SELECT PersonId FROM core.Person WHERE PersonId = @id');
    if (personCheck.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Person not found' } });
      return;
    }
    const extExists = await pool.request().input('id', sql.Int, personId).query('SELECT ContactId FROM banking.BankingContactExtension WHERE ContactId = @id');
    if (extExists.recordset.length > 0) {
      res.status(409).json({ success: false, error: { message: 'Banking extension already exists for this contact; use PUT to update.' } });
      return;
    }
    const roleVal = Role && BANKING_CONTACT_ROLES.includes(Role) ? Role : null;
    await pool.request()
      .input('ContactId', sql.Int, personId)
      .input('Role', sql.NVarChar(50), roleVal)
      .input('Notes', sql.NVarChar(sql.MAX), BankingNotes ?? null)
      .query(`
        INSERT INTO banking.BankingContactExtension (ContactId, Role, Notes)
        VALUES (@ContactId, @Role, @Notes)
      `);
    const getResult = await pool.request().input('id', sql.Int, personId).query(`
      SELECT p.PersonId AS ContactId, p.FullName AS Name, p.Email, p.Phone AS PhoneNumber,
             p.Title, p.Notes AS Notes, e.Role, e.Notes AS BankingNotes, e.CreatedAt, e.ModifiedAt
      FROM core.Person p
      INNER JOIN banking.BankingContactExtension e ON e.ContactId = p.PersonId
      WHERE p.PersonId = @id
    `);
    res.status(201).json({ success: true, data: getResult.recordset[0] });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// LOAN CONTROLLER
// ============================================================

export const getAllLoans = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        l.*, 
        p.ProjectName,
        p.Stage AS ProjectStage,
        b.BankName AS LenderName,
        COALESCE(b.HQState, b.State) AS LenderState,
        CASE 
          WHEN l.IOMaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
          THEN DATEDIFF(MONTH, l.LoanClosingDate, l.IOMaturityDate)
          WHEN l.MaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
          THEN DATEDIFF(MONTH, l.LoanClosingDate, l.MaturityDate)
          ELSE NULL
        END AS ConstructionIOTermMonths,
        CASE WHEN LTRIM(RTRIM(ISNULL(p.Stage, N''))) = N'Liquidated' THEN 0 ELSE l.LoanAmount END AS ExposureDisplay,
        lt.LoanTypeName
      FROM banking.Loan l
      LEFT JOIN core.Project p ON l.ProjectId = p.ProjectId
      LEFT JOIN core.Bank b ON l.LenderId = b.BankId
      LEFT JOIN banking.LoanType lt ON l.LoanTypeId = lt.LoanTypeId
      ORDER BY l.IsActive DESC, COALESCE(l.BirthOrder, 999), l.LoanId
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getLoanById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          l.*,
          p.ProjectName,
          p.Stage AS ProjectStage,
          b.BankName AS LenderName,
          COALESCE(b.HQState, b.State) AS LenderState,
          CASE 
            WHEN l.IOMaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.IOMaturityDate)
            WHEN l.MaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.MaturityDate)
            ELSE NULL
          END AS ConstructionIOTermMonths,
          CASE WHEN LTRIM(RTRIM(ISNULL(p.Stage, N''))) = N'Liquidated' THEN 0 ELSE l.LoanAmount END AS ExposureDisplay,
          lt.LoanTypeName
        FROM banking.Loan l
        LEFT JOIN core.Project p ON l.ProjectId = p.ProjectId
        LEFT JOIN core.Bank b ON l.LenderId = b.BankId
        LEFT JOIN banking.LoanType lt ON l.LoanTypeId = lt.LoanTypeId
        WHERE l.LoanId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getLoansByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          l.*,
          p.ProjectName,
          p.Stage AS ProjectStage,
          b.BankName AS LenderName,
          COALESCE(b.HQState, b.State) AS LenderState,
          CASE 
            WHEN l.IOMaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.IOMaturityDate)
            WHEN l.MaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.MaturityDate)
            ELSE NULL
          END AS ConstructionIOTermMonths,
          CASE WHEN LTRIM(RTRIM(ISNULL(p.Stage, N''))) = N'Liquidated' THEN 0 ELSE l.LoanAmount END AS ExposureDisplay,
          lt.LoanTypeName
        FROM banking.Loan l
        LEFT JOIN core.Project p ON l.ProjectId = p.ProjectId
        LEFT JOIN core.Bank b ON l.LenderId = b.BankId
        LEFT JOIN banking.LoanType lt ON l.LoanTypeId = lt.LoanTypeId
        WHERE l.ProjectId = @projectId 
        ORDER BY l.IsActive DESC, COALESCE(l.BirthOrder, 999), l.LoanId
      `);
    
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

/**
 * Optional (Boss Morning Feedback): participation total vs loan amount for a single loan.
 * Returns loan amount, sum of participation amounts, and a mismatch flag for dashboard validation.
 */
export const getLoanParticipationSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const loan = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT LoanId, LoanAmount FROM banking.Loan WHERE LoanId = @id');
    if (loan.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan not found' } });
      return;
    }
    const loanAmount = loan.recordset[0].LoanAmount != null ? parseFloat(loan.recordset[0].LoanAmount) : null;
    const sumResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          ISNULL(SUM(CAST(p.ExposureAmount AS FLOAT)), 0) AS ParticipationTotal,
          ISNULL(SUM(CASE WHEN COALESCE(pr.Stage, N'') = N'Liquidated' OR p.PaidOff = 1 THEN 0 ELSE CAST(p.ExposureAmount AS FLOAT) END), 0) AS ParticipationActiveTotal
        FROM banking.Participation p
        LEFT JOIN core.Project pr ON p.ProjectId = pr.ProjectId
        WHERE p.LoanId = @id
      `);
    const participationTotal = sumResult.recordset[0]?.ParticipationTotal ?? 0;
    const participationActiveTotal = sumResult.recordset[0]?.ParticipationActiveTotal ?? 0;
    const tolerance = 1; // allow $1 rounding difference
    const mismatch = loanAmount != null && Math.abs(participationActiveTotal - loanAmount) > tolerance;
    res.json({
      success: true,
      data: {
        loanId: parseInt(id),
        loanAmount,
        participationTotal,
        participationActiveTotal,
        mismatch,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createLoan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId: bodyProjectId, EntityId: bodyEntityId, BirthOrder, LoanType, Borrower, LoanPhase: bodyLoanPhase, FinancingStage, LenderId,
      LoanAmount, CurrentBalance, LoanClosingDate, MaturityDate, FixedOrFloating, IndexName,
      Spread, InterestRate, InterestRateFloor, InterestRateCeiling,
      ConversionDate,
      MiniPermMaturity, MiniPermInterestRate,
      MiniPermFixedOrFloating, MiniPermIndex, MiniPermSpread, MiniPermRateFloor, MiniPermRateCeiling,
      PermPhaseMaturity, PermPhaseInterestRate, ConstructionCompletionDate,
      ConstructionCompletionSource, LeaseUpCompletedDate, IOMaturityDate, PermanentCloseDate,
      PermanentLoanAmount, Notes,
      IsActive = true, IsPrimary = false,
      LoanTypeId, LoanCategory
    } = req.body;

    // Misc loans: accept EntityId when ProjectId is missing; resolve to a project (find or create entity-project).
    let ProjectId = bodyProjectId != null ? parseInt(String(bodyProjectId), 10) : null;
    const EntityId = bodyEntityId != null ? parseInt(String(bodyEntityId), 10) : null;
    if ((ProjectId == null || isNaN(ProjectId)) && EntityId != null && !isNaN(EntityId)) {
      const poolForEntity = await getConnection();
      const partner = await poolForEntity.request()
        .input('entityId', sql.Int, EntityId)
        .query(`
          SELECT EquityPartnerId, PartnerName FROM core.EquityPartner
          WHERE EquityPartnerId = @entityId AND LTRIM(RTRIM(ISNULL(PartnerType, N''))) = N'Entity'
        `);
      if (partner.recordset.length === 0) {
        res.status(400).json({ success: false, error: { message: 'EntityId does not refer to an Entity-type equity partner' } });
        return;
      }
      const partnerName = partner.recordset[0].PartnerName;
      let existing = await poolForEntity.request()
        .input('name', sql.NVarChar(255), partnerName)
        .query(`
          SELECT ProjectId FROM core.Project
          WHERE ProjectName = @name AND LTRIM(RTRIM(ISNULL(ProductType, N''))) = N'Entity'
        `);
      if (existing.recordset.length > 0) {
        ProjectId = existing.recordset[0].ProjectId;
      } else {
        const insertProject = await poolForEntity.request()
          .input('ProjectName', sql.NVarChar(255), partnerName)
          .input('ProductType', sql.NVarChar(50), 'Entity')
          .query(`
            INSERT INTO core.Project (ProjectName, ProductType, Stage)
            VALUES (@ProjectName, @ProductType, N'Other');
            SELECT SCOPE_IDENTITY() AS ProjectId;
          `);
        ProjectId = insertProject.recordset?.[0]?.ProjectId;
        if (ProjectId == null) {
          res.status(500).json({ success: false, error: { message: 'Failed to create entity project' } });
          return;
        }
      }
    }

    if (ProjectId == null || isNaN(ProjectId)) {
      res.status(400).json({ success: false, error: { message: 'ProjectId or EntityId is required' } });
      return;
    }

    // Default LoanPhase to 'Other' for misc/entity loans when omitted.
    const LoanPhase = bodyLoanPhase != null && String(bodyLoanPhase).trim() !== '' ? String(bodyLoanPhase).trim() : 'Other';

    // Validate FixedOrFloating: must be NULL, 'Fixed', or 'Floating'
    if (FixedOrFloating && FixedOrFloating !== 'Fixed' && FixedOrFloating !== 'Floating') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'FixedOrFloating must be NULL, "Fixed", or "Floating"' } 
      });
      return;
    }

    // Validate IndexName for Construction loans: must be NULL, 'Prime', or 'SOFR'
    if (LoanPhase === 'Construction' && IndexName && IndexName !== 'Prime' && IndexName !== 'SOFR') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'For Construction loans, IndexName must be NULL, "Prime", or "SOFR"' } 
      });
      return;
    }

    const pool = await getConnection();
    const request = pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('BirthOrder', sql.Int, BirthOrder)
      .input('LoanType', sql.NVarChar, toVarChar(LoanType))
      .input('Borrower', sql.NVarChar, toVarChar(Borrower))
      .input('LoanPhase', sql.NVarChar, toVarChar(LoanPhase))
      .input('FinancingStage', sql.NVarChar, toVarChar(FinancingStage))
      .input('LenderId', sql.Int, LenderId)
      .input('LoanAmount', sql.Decimal(18, 2), LoanAmount)
      .input('CurrentBalance', sql.Decimal(18, 2), CurrentBalance)
      .input('LoanClosingDate', sql.Date, LoanClosingDate)
      .input('MaturityDate', sql.Date, MaturityDate)
      .input('FixedOrFloating', sql.NVarChar, toVarChar(FixedOrFloating))
      .input('IndexName', sql.NVarChar, toVarChar(IndexName))
      .input('Spread', sql.NVarChar, toVarChar(Spread))
      .input('InterestRate', sql.NVarChar, toVarChar(InterestRate))
      .input('InterestRateFloor', sql.NVarChar, toVarChar(InterestRateFloor))
      .input('InterestRateCeiling', sql.NVarChar, toVarChar(InterestRateCeiling))
      .input('ConversionDate', sql.Date, ConversionDate)
      .input('IsActive', sql.Bit, IsActive === true || IsActive === 1)
      .input('IsPrimary', sql.Bit, IsPrimary === true || IsPrimary === 1)
      .input('MiniPermMaturity', sql.Date, MiniPermMaturity)
      .input('MiniPermInterestRate', sql.NVarChar, toVarChar(MiniPermInterestRate))
      .input('MiniPermFixedOrFloating', sql.NVarChar, toVarChar(MiniPermFixedOrFloating))
      .input('MiniPermIndex', sql.NVarChar, toVarChar(MiniPermIndex))
      .input('MiniPermSpread', sql.NVarChar, toVarChar(MiniPermSpread))
      .input('MiniPermRateFloor', sql.NVarChar, toVarChar(MiniPermRateFloor))
      .input('MiniPermRateCeiling', sql.NVarChar, toVarChar(MiniPermRateCeiling))
      .input('PermPhaseMaturity', sql.Date, PermPhaseMaturity)
      .input('PermPhaseInterestRate', sql.NVarChar, toVarChar(PermPhaseInterestRate))
      .input('ConstructionCompletionDate', sql.NVarChar, toVarChar(ConstructionCompletionDate))
      .input('ConstructionCompletionSource', sql.NVarChar, toVarChar(ConstructionCompletionSource))
      .input('LeaseUpCompletedDate', sql.NVarChar, toVarChar(LeaseUpCompletedDate))
      .input('IOMaturityDate', sql.Date, IOMaturityDate)
      .input('PermanentCloseDate', sql.Date, PermanentCloseDate)
      .input('PermanentLoanAmount', sql.Decimal(18, 2), PermanentLoanAmount)
      .input('Notes', sql.NVarChar(sql.MAX), toVarChar(Notes))
      .input('LoanTypeId', sql.Int, LoanTypeId != null ? parseInt(String(LoanTypeId), 10) : null)
      .input('LoanCategory', sql.NVarChar(50), LoanCategory != null ? String(LoanCategory).trim() : null);

    // Insert without OUTPUT (banking.Loan has triggers; SQL Server disallows OUTPUT on tables with triggers unless INTO).
    // Get new LoanId via SCOPE_IDENTITY() in the same batch.
    const insertResult = await request.query(`
      INSERT INTO banking.Loan (
        ProjectId, BirthOrder, LoanType, Borrower, LoanPhase, FinancingStage, LenderId,
        LoanAmount, CurrentBalance, LoanClosingDate, MaturityDate, FixedOrFloating, IndexName,
        Spread, InterestRate, InterestRateFloor, InterestRateCeiling,
        ConversionDate,
        MiniPermMaturity, MiniPermInterestRate,
        MiniPermFixedOrFloating, MiniPermIndex, MiniPermSpread, MiniPermRateFloor, MiniPermRateCeiling,
        PermPhaseMaturity, PermPhaseInterestRate, ConstructionCompletionDate,
        ConstructionCompletionSource, LeaseUpCompletedDate, IOMaturityDate, PermanentCloseDate,
        PermanentLoanAmount, Notes, IsActive, IsPrimary, LoanTypeId, LoanCategory
      )
      VALUES (
        @ProjectId, @BirthOrder, @LoanType, @Borrower, @LoanPhase, @FinancingStage, @LenderId,
        @LoanAmount, @CurrentBalance, @LoanClosingDate, @MaturityDate, @FixedOrFloating, @IndexName,
        @Spread, @InterestRate, @InterestRateFloor, @InterestRateCeiling,
        @ConversionDate,
        @MiniPermMaturity, @MiniPermInterestRate,
        @MiniPermFixedOrFloating, @MiniPermIndex, @MiniPermSpread, @MiniPermRateFloor, @MiniPermRateCeiling,
        @PermPhaseMaturity, @PermPhaseInterestRate, @ConstructionCompletionDate,
        @ConstructionCompletionSource, @LeaseUpCompletedDate, @IOMaturityDate, @PermanentCloseDate,
        @PermanentLoanAmount, @Notes, @IsActive, @IsPrimary, @LoanTypeId, @LoanCategory
      );
      SELECT CAST(SCOPE_IDENTITY() AS INT) AS LoanId;
    `);
    // Batch returns two recordsets: INSERT (empty), then SELECT SCOPE_IDENTITY(); take the last.
    const recordsets = insertResult.recordsets;
    const idRow = Array.isArray(recordsets) && recordsets.length > 0 ? recordsets[recordsets.length - 1]?.[0] : insertResult.recordset?.[0];
    const newLoanId = idRow?.LoanId;
    if (newLoanId == null) {
      res.status(500).json({ success: false, error: { message: 'Failed to retrieve created loan' } });
      return;
    }

    if (IsActive === true || IsActive === 1) {
      await pool.request()
        .input('projectId', sql.Int, ProjectId)
        .input('loanId', sql.Int, newLoanId)
        .query('UPDATE banking.Loan SET IsActive = 0 WHERE ProjectId = @projectId AND LoanId <> @loanId');
    }

    const fetchResult = await pool.request()
      .input('loanId', sql.Int, newLoanId)
      .query(`
        SELECT 
          l.*,
          lt.LoanTypeName,
          CASE 
            WHEN l.IOMaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.IOMaturityDate)
            WHEN l.MaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.MaturityDate)
            ELSE NULL
          END AS ConstructionIOTermMonths
        FROM banking.Loan l
        LEFT JOIN banking.LoanType lt ON l.LoanTypeId = lt.LoanTypeId
        WHERE l.LoanId = @loanId
      `);
    const created = fetchResult.recordset?.[0] ?? null;
    if (!created) {
      res.status(500).json({ success: false, error: { message: 'Failed to retrieve created loan' } });
      return;
    }

    const loanId = created.LoanId;
    
    // Auto-create maturity covenants for all maturity dates
    await syncAllMaturityCovenants(
      pool,
      ProjectId,
      loanId,
      LoanPhase,
      IOMaturityDate,
      MaturityDate,
      MiniPermMaturity,
      PermPhaseMaturity
    );

    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or LenderId' } });
      return;
    }
    next(error);
  }
};

export const updateLoan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const loanData = req.body;

    const pool = await getConnection();

    // Validate FixedOrFloating: must be NULL, 'Fixed', or 'Floating'
    if (loanData.FixedOrFloating !== undefined && 
        loanData.FixedOrFloating !== null &&
        loanData.FixedOrFloating !== 'Fixed' && 
        loanData.FixedOrFloating !== 'Floating') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'FixedOrFloating must be NULL, "Fixed", or "Floating"' } 
      });
      return;
    }

    // Validate IndexName for Construction loans: must be NULL, 'Prime', or 'SOFR'
    if (loanData.IndexName !== undefined) {
      // Get current loan phase if not provided in update
      let loanPhase = loanData.LoanPhase;
      if (!loanPhase) {
        const currentLoan = await pool.request()
          .input('id', sql.Int, id)
          .query('SELECT LoanPhase FROM banking.Loan WHERE LoanId = @id');
        
        if (currentLoan.recordset.length === 0) {
          res.status(404).json({ success: false, error: { message: 'Loan not found' } });
          return;
        }
        loanPhase = currentLoan.recordset[0].LoanPhase;
      }

      // Validate IndexName for Construction loans
      if (loanPhase === 'Construction' && loanData.IndexName && 
          loanData.IndexName !== 'Prime' && loanData.IndexName !== 'SOFR') {
        res.status(400).json({ 
          success: false, 
          error: { message: 'For Construction loans, IndexName must be NULL, "Prime", or "SOFR"' } 
        });
        return;
      }
    }

    const request = pool.request().input('id', sql.Int, id);

    // Build dynamic update query
    const fields: string[] = [];
    Object.keys(loanData).forEach((key) => {
      if (key !== 'LoanId' && loanData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'IsActive' || key === 'IsPrimary') {
          request.input(key, sql.Bit, loanData[key] === true || loanData[key] === 1);
        } else if (key === 'LoanTypeId') {
          request.input(key, sql.Int, loanData[key] == null ? null : parseInt(String(loanData[key]), 10));
        } else if (key === 'LoanCategory') {
          request.input(key, sql.NVarChar(50), loanData[key] != null ? String(loanData[key]).trim() : null);
        } else if (key === 'InterestRateFloor' || key === 'InterestRateCeiling' ||
            key === 'MiniPermFixedOrFloating' || key === 'MiniPermIndex' || key === 'MiniPermSpread' ||
            key === 'MiniPermRateFloor' || key === 'MiniPermRateCeiling') {
          request.input(key, sql.NVarChar, toVarChar(loanData[key]));
        } else if (key === 'CurrentBalance' || (typeof loanData[key] === 'number' && key.includes('Amount'))) {
          request.input(key, sql.Decimal(18, 2), loanData[key]);
        } else if (key.includes('Date') && !key.includes('Completion') && !key.includes('Completed')) {
          request.input(key, sql.Date, loanData[key]);
        } else if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), toVarChar(loanData[key]));
        } else {
          request.input(key, sql.NVarChar, toVarChar(loanData[key]));
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    await request.query(`
      UPDATE banking.Loan
      SET ${fields.join(', ')}
      WHERE LoanId = @id
    `);

    if (loanData.IsActive === true || loanData.IsActive === 1) {
      await pool.request()
        .input('id', sql.Int, id)
        .query(`
          UPDATE banking.Loan SET IsActive = 0
          WHERE ProjectId = (SELECT ProjectId FROM banking.Loan WHERE LoanId = @id) AND LoanId <> @id
        `);
    }

    // Get updated loan to sync maturity covenants
    const loanCheck = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT ProjectId, LoanPhase, IOMaturityDate, MaturityDate, MiniPermMaturity, PermPhaseMaturity FROM banking.Loan WHERE LoanId = @id');
    
    if (loanCheck.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan not found' } });
      return;
    }

    const loanRecord = loanCheck.recordset[0];
    
    // Auto-create/update all maturity covenants
    await syncAllMaturityCovenants(
      pool,
      loanRecord.ProjectId,
      parseInt(id),
      loanRecord.LoanPhase,
      loanRecord.IOMaturityDate,
      loanRecord.MaturityDate,
      loanRecord.MiniPermMaturity,
      loanRecord.PermPhaseMaturity
    );

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          l.*,
          lt.LoanTypeName,
          CASE 
            WHEN l.IOMaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.IOMaturityDate)
            WHEN l.MaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.MaturityDate)
            ELSE NULL
          END AS ConstructionIOTermMonths
        FROM banking.Loan l
        LEFT JOIN banking.LoanType lt ON l.LoanTypeId = lt.LoanTypeId
        WHERE l.LoanId = @id
      `);

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid foreign key reference' } });
      return;
    }
    next(error);
  }
};

/**
 * Update loan by ProjectId - convenience function for Domo
 * Updates the loan for a project based on LoanPhase (Construction or Permanent)
 * If LoanPhase is not provided, defaults to Construction for backward compatibility
 */
export const updateLoanByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const loanData = req.body;

    const pool = await getConnection();
    
    // Determine which loan phase to update
    // If LoanPhase is provided in the update data, use it to find the specific loan
    // Otherwise, default to Construction for backward compatibility
    const targetLoanPhase = loanData.LoanPhase || 'Construction';
    
    // Find the loan for this project with the specified LoanPhase
    const findLoan = await pool.request()
      .input('projectId', sql.Int, projectId)
      .input('loanPhase', sql.NVarChar, targetLoanPhase)
      .query(`
        SELECT TOP 1 LoanId, LoanPhase
        FROM banking.Loan 
        WHERE ProjectId = @projectId 
          AND LoanPhase = @loanPhase
        ORDER BY LoanId
      `);

    if (findLoan.recordset.length === 0) {
      res.status(404).json({ 
        success: false, 
        error: { 
          message: `No ${targetLoanPhase} loan found for this project. Please create the loan first or specify a different LoanPhase.` 
        } 
      });
      return;
    }

    const loanId = findLoan.recordset[0].LoanId;
    const currentLoanPhase = findLoan.recordset[0].LoanPhase;
    
    // Ensure we don't accidentally change LoanPhase unless explicitly requested
    // If LoanPhase is being updated, validate it
    if (loanData.LoanPhase && loanData.LoanPhase !== currentLoanPhase) {
      res.status(400).json({ 
        success: false, 
        error: { 
          message: `Cannot change LoanPhase from '${currentLoanPhase}' to '${loanData.LoanPhase}' using updateLoanByProject. Use updateLoan with LoanId instead, or create a new loan.` 
        } 
      });
      return;
    }
    
    // Now update using the same logic as updateLoan
    // Remove LoanPhase from update data if it matches current (to avoid unnecessary update)
    const updateData = { ...loanData };
    if (updateData.LoanPhase === currentLoanPhase) {
      delete updateData.LoanPhase;
    }
    
    const request = pool.request().input('id', sql.Int, loanId);

    // Validate FixedOrFloating if provided
    if (updateData.FixedOrFloating !== undefined && 
        updateData.FixedOrFloating !== null &&
        updateData.FixedOrFloating !== 'Fixed' && 
        updateData.FixedOrFloating !== 'Floating') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'FixedOrFloating must be NULL, "Fixed", or "Floating"' } 
      });
      return;
    }

    // Validate IndexName for Construction loans
    if (updateData.IndexName !== undefined && currentLoanPhase === 'Construction' && 
        updateData.IndexName !== null && 
        updateData.IndexName !== 'Prime' && updateData.IndexName !== 'SOFR') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'For Construction loans, IndexName must be NULL, "Prime", or "SOFR"' } 
      });
      return;
    }

    const fields: string[] = [];
    Object.keys(updateData).forEach((key) => {
      if (key !== 'LoanId' && updateData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'IsActive' || key === 'IsPrimary') {
          request.input(key, sql.Bit, updateData[key] === true || updateData[key] === 1);
        } else if (key === 'InterestRateFloor' || key === 'InterestRateCeiling') {
          request.input(key, sql.NVarChar, updateData[key]);
        } else if (typeof updateData[key] === 'number' && key.includes('Amount')) {
          request.input(key, sql.Decimal(18, 2), updateData[key]);
        } else if (key.includes('Date') && !key.includes('Completion') && !key.includes('Completed')) {
          request.input(key, sql.Date, updateData[key]);
        } else if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), updateData[key]);
        } else {
          request.input(key, sql.NVarChar, updateData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    await request.query(`
      UPDATE banking.Loan
      SET ${fields.join(', ')}
      WHERE LoanId = @id
    `);

    // Get updated loan to check IOMaturityDate and LoanPhase
    const loanCheck = await pool.request()
      .input('id', sql.Int, loanId)
      .query('SELECT ProjectId, LoanPhase, IOMaturityDate FROM banking.Loan WHERE LoanId = @id');
    
    if (loanCheck.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan not found after update' } });
      return;
    }

    const loanRecord = loanCheck.recordset[0];
    const loanProjectId = loanRecord.ProjectId;
    const loanPhase = loanRecord.LoanPhase;
    
    // Get all maturity dates
    const maturityCheck = await pool.request()
      .input('id', sql.Int, loanId)
      .query('SELECT IOMaturityDate, MaturityDate, MiniPermMaturity, PermPhaseMaturity FROM banking.Loan WHERE LoanId = @id');
    
    if (maturityCheck.recordset.length > 0) {
      const maturityDates = maturityCheck.recordset[0];
      
      // Auto-create/update all maturity covenants
      await syncAllMaturityCovenants(
        pool,
        loanProjectId,
        loanId,
        loanPhase,
        maturityDates.IOMaturityDate,
        maturityDates.MaturityDate,
        maturityDates.MiniPermMaturity,
        maturityDates.PermPhaseMaturity
      );
    }

    // Return updated loan with calculated fields
    const result = await pool.request()
      .input('id', sql.Int, loanId)
      .query(`
        SELECT 
          l.*,
          CASE 
            WHEN l.IOMaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.IOMaturityDate)
            WHEN l.MaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.MaturityDate)
            ELSE NULL
          END AS ConstructionIOTermMonths
        FROM banking.Loan l
        WHERE l.LoanId = @id
      `);

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    next(error);
  }
};

export const deleteLoan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const loanId = parseInt(id, 10);
    if (isNaN(loanId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid loan id' } });
      return;
    }

    const run = (queryText: string) => pool.request().input('loanId', sql.Int, loanId).query(queryText);

    // Verify loan exists
    const exists = await run('SELECT 1 AS LoanExists FROM banking.Loan WHERE LoanId = @loanId');
    if (!exists.recordset?.length) {
      res.status(404).json({ success: false, error: { message: 'Loan not found' } });
      return;
    }

    // Cascade delete: remove all child records that reference this loan, then delete the loan.
    await run('DELETE FROM banking.GuaranteeBurndown WHERE LoanId = @loanId');
    await run('DELETE FROM banking.Guarantee WHERE LoanId = @loanId');
    await run('DELETE FROM banking.Covenant WHERE LoanId = @loanId');
    await run('DELETE FROM banking.Participation WHERE LoanId = @loanId');
    await run('DELETE FROM banking.DSCRTest WHERE LoanId = @loanId');
    await run('DELETE FROM banking.LiquidityRequirement WHERE LoanId = @loanId');
    await run('DELETE FROM banking.LoanModification WHERE LoanId = @loanId');
    await run('DELETE FROM banking.LoanProceeds WHERE LoanId = @loanId');
    // Equity commitments are deal-wide (§7); do not delete or touch them when deleting a loan.
    const result = await run('DELETE FROM banking.Loan WHERE LoanId = @loanId');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan not found' } });
      return;
    }

    res.json({ success: true, message: 'Loan deleted successfully' });
  } catch (error: any) {
    next(error);
  }
};

// ============================================================
// LOAN TYPES (Loan Creation Wizard – reference table CRUD)
// ============================================================

export const getAllLoanTypes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = (req.query.q as string)?.trim() || '';
    const pool = await getConnection();
    let result: sql.IResult<any>;
    if (q) {
      result = await pool.request()
        .input('q', sql.NVarChar(200), `%${q}%`)
        .query(`
          SELECT LoanTypeId, LoanTypeName, Notes, DisplayOrder, IsActive
          FROM banking.LoanType
          WHERE IsActive = 1 AND LoanTypeName LIKE @q
          ORDER BY DisplayOrder ASC, LoanTypeName
        `);
    } else {
      result = await pool.request().query(`
        SELECT LoanTypeId, LoanTypeName, Notes, DisplayOrder, IsActive
        FROM banking.LoanType
        WHERE IsActive = 1
        ORDER BY DisplayOrder ASC, LoanTypeName
      `);
    }
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getLoanTypeById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT LoanTypeId, LoanTypeName, Notes, DisplayOrder, IsActive FROM banking.LoanType WHERE LoanTypeId = @id');
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan type not found' } });
      return;
    }
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const createLoanType = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { LoanTypeName, Notes, DisplayOrder } = req.body;
    if (!LoanTypeName || typeof LoanTypeName !== 'string' || !LoanTypeName.trim()) {
      res.status(400).json({ success: false, error: { message: 'LoanTypeName is required' } });
      return;
    }
    const pool = await getConnection();
    const result = await pool.request()
      .input('LoanTypeName', sql.NVarChar(200), LoanTypeName.trim())
      .input('Notes', sql.NVarChar(sql.MAX), Notes != null ? String(Notes) : null)
      .input('DisplayOrder', sql.Int, DisplayOrder != null ? parseInt(String(DisplayOrder), 10) : null)
      .query(`
        INSERT INTO banking.LoanType (LoanTypeName, Notes, DisplayOrder, IsActive)
        OUTPUT INSERTED.LoanTypeId, INSERTED.LoanTypeName, INSERTED.Notes, INSERTED.DisplayOrder, INSERTED.IsActive
        VALUES (@LoanTypeName, @Notes, @DisplayOrder, 1)
      `);
    const row = result.recordset?.[0];
    if (!row) {
      res.status(500).json({ success: false, error: { message: 'Failed to create loan type' } });
      return;
    }
    res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'A loan type with this name already exists' } });
      return;
    }
    next(error);
  }
};

export const updateLoanType = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { LoanTypeName, Notes, DisplayOrder, IsActive } = req.body;
    const pool = await getConnection();
    const updates: string[] = [];
    const request = pool.request().input('id', sql.Int, id);
    if (LoanTypeName !== undefined) {
      updates.push('LoanTypeName = @LoanTypeName');
      request.input('LoanTypeName', sql.NVarChar(200), String(LoanTypeName).trim());
    }
    if (Notes !== undefined) {
      updates.push('Notes = @Notes');
      request.input('Notes', sql.NVarChar(sql.MAX), Notes != null ? String(Notes) : null);
    }
    if (DisplayOrder !== undefined) {
      updates.push('DisplayOrder = @DisplayOrder');
      request.input('DisplayOrder', sql.Int, DisplayOrder == null ? null : parseInt(String(DisplayOrder), 10));
    }
    if (IsActive !== undefined) {
      updates.push('IsActive = @IsActive');
      request.input('IsActive', sql.Bit, IsActive === true || IsActive === 1);
    }
    if (updates.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }
    await request.query(`
      UPDATE banking.LoanType SET ${updates.join(', ')} WHERE LoanTypeId = @id
    `);
    const getResult = await pool.request().input('id', sql.Int, id)
      .query('SELECT LoanTypeId, LoanTypeName, Notes, DisplayOrder, IsActive FROM banking.LoanType WHERE LoanTypeId = @id');
    if (getResult.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan type not found' } });
      return;
    }
    res.json({ success: true, data: getResult.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'A loan type with this name already exists' } });
      return;
    }
    next(error);
  }
};

export const deleteLoanType = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE banking.LoanType SET IsActive = 0 WHERE LoanTypeId = @id');
    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan type not found' } });
      return;
    }
    res.json({ success: true, message: 'Loan type deactivated (soft delete)' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// COPY FROM LOAN (Loan Creation Wizard – copy covenants/guarantees to new loan)
// ============================================================

function toCopyFlag(val: unknown): boolean {
  return val === true || val === 1 || (typeof val === 'string' && val.toLowerCase() === 'true');
}

export const copyFromLoan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { targetLoanId, sourceLoanId } = req.params;
    const body = req.body || {};
    const copyCovenants = toCopyFlag(body.copyCovenants);
    const copyGuarantees = toCopyFlag(body.copyGuarantees);
    // §9: Equity commitments are deal-wide; copy-from only covenants and guarantees (ignore legacy copyEquityCommitments).
    const targetId = parseInt(targetLoanId, 10);
    const sourceId = parseInt(sourceLoanId, 10);
    if (isNaN(targetId) || isNaN(sourceId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid targetLoanId or sourceLoanId' } });
      return;
    }
    if (targetId === sourceId) {
      res.status(400).json({ success: false, error: { message: 'Target and source loan must be different' } });
      return;
    }

    const pool = await getConnection();

    const loans = await pool.request()
      .input('targetId', sql.Int, targetId)
      .input('sourceId', sql.Int, sourceId)
      .query(`
        SELECT LoanId, ProjectId FROM banking.Loan WHERE LoanId IN (@targetId, @sourceId)
      `);
    const loanMap = new Map(loans.recordset.map((r: any) => [r.LoanId, r]));
    if (!loanMap.has(targetId) || !loanMap.has(sourceId)) {
      res.status(404).json({ success: false, error: { message: 'Target or source loan not found' } });
      return;
    }
    const sourceProjectId = loanMap.get(sourceId).ProjectId;
    const targetProjectId = loanMap.get(targetId).ProjectId;
    if (sourceProjectId !== targetProjectId) {
      res.status(400).json({ success: false, error: { message: 'Source and target loan must belong to the same project' } });
      return;
    }

    const summary: { copyCovenants: number; copyGuarantees: number } = {
      copyCovenants: 0,
      copyGuarantees: 0,
    };

    if (copyCovenants) {
      const cov = await pool.request()
        .input('sourceId', sql.Int, sourceId)
        .input('targetId', sql.Int, targetId)
        .query(`
          INSERT INTO banking.Covenant (
            ProjectId, LoanId, FinancingType, CovenantType,
            DSCRTestDate, ProjectedInterestRate, DSCRRequirement, ProjectedDSCR,
            OccupancyCovenantDate, OccupancyRequirement, ProjectedOccupancy,
            LiquidityRequirementLendingBank, CovenantDate, Requirement, ProjectedValue,
            Notes, IsCompleted
          )
          SELECT
            ProjectId, @targetId, FinancingType, CovenantType,
            DSCRTestDate, ProjectedInterestRate, DSCRRequirement, ProjectedDSCR,
            OccupancyCovenantDate, OccupancyRequirement, ProjectedOccupancy,
            LiquidityRequirementLendingBank, CovenantDate, Requirement, ProjectedValue,
            Notes, IsCompleted
          FROM banking.Covenant
          WHERE LoanId = @sourceId
        `);
      summary.copyCovenants = cov.rowsAffected[0] ?? 0;
    }

    if (copyGuarantees) {
      const guar = await pool.request()
        .input('sourceId', sql.Int, sourceId)
        .input('targetId', sql.Int, targetId)
        .query(`
          INSERT INTO banking.Guarantee (ProjectId, LoanId, PersonId, FinancingType, GuaranteePercent, GuaranteeAmount, Notes)
          SELECT ProjectId, @targetId, PersonId, FinancingType, GuaranteePercent, GuaranteeAmount, Notes
          FROM banking.Guarantee
          WHERE LoanId = @sourceId
        `);
      summary.copyGuarantees = guar.rowsAffected[0] ?? 0;
    }

    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// LOAN MODIFICATION CONTROLLER (Permanent debt, extensions, restructures)
// ============================================================

export const getAllLoanModifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT m.*, p.ProjectName
      FROM banking.LoanModification m
      LEFT JOIN core.Project p ON m.ProjectId = p.ProjectId
      ORDER BY m.ProjectId, m.EffectiveDate DESC, m.LoanModificationId
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getLoanModificationById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT m.*, p.ProjectName
        FROM banking.LoanModification m
        LEFT JOIN core.Project p ON m.ProjectId = p.ProjectId
        WHERE m.LoanModificationId = @id
      `);
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan modification not found' } });
      return;
    }
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getLoanModificationsByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT m.*, p.ProjectName
        FROM banking.LoanModification m
        LEFT JOIN core.Project p ON m.ProjectId = p.ProjectId
        WHERE m.ProjectId = @projectId
        ORDER BY m.EffectiveDate DESC, m.LoanModificationId
      `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createLoanModification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ProjectId, LoanId, Type, Description, EffectiveDate, Notes } = req.body;
    if (!ProjectId || !Type) {
      res.status(400).json({ success: false, error: { message: 'ProjectId and Type are required' } });
      return;
    }
    const pool = await getConnection();
    await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('Type', sql.NVarChar, Type)
      .input('Description', sql.NVarChar, Description)
      .input('EffectiveDate', sql.Date, EffectiveDate)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO banking.LoanModification (ProjectId, LoanId, Type, Description, EffectiveDate, Notes)
        VALUES (@ProjectId, @LoanId, @Type, @Description, @EffectiveDate, @Notes)
      `);
    const result = await pool.request()
      .input('projectId', sql.Int, ProjectId)
      .query(`
        SELECT TOP 1 m.*, p.ProjectName
        FROM banking.LoanModification m
        LEFT JOIN core.Project p ON m.ProjectId = p.ProjectId
        WHERE m.ProjectId = @projectId
        ORDER BY m.LoanModificationId DESC
      `);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or LoanId' } });
      return;
    }
    next(error);
  }
};

export const updateLoanModification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);
    const fields: string[] = [];
    Object.keys(updateData).forEach((key) => {
      if (key !== 'LoanModificationId' && updateData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'ProjectId' || key === 'LoanId') {
          request.input(key, sql.Int, updateData[key]);
        } else if (key === 'EffectiveDate') {
          request.input(key, sql.Date, updateData[key]);
        } else if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), updateData[key]);
        } else {
          request.input(key, sql.NVarChar, updateData[key]);
        }
      }
    });
    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }
    await request.query(`
      UPDATE banking.LoanModification SET ${fields.join(', ')} WHERE LoanModificationId = @id
    `);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT m.*, p.ProjectName
        FROM banking.LoanModification m
        LEFT JOIN core.Project p ON m.ProjectId = p.ProjectId
        WHERE m.LoanModificationId = @id
      `);
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan modification not found' } });
      return;
    }
    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or LoanId' } });
      return;
    }
    next(error);
  }
};

export const deleteLoanModification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.LoanModification WHERE LoanModificationId = @id');
    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan modification not found' } });
      return;
    }
    res.json({ success: true, message: 'Loan modification deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// DSCR TEST CONTROLLER
// ============================================================

export const getAllDSCRTests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT * FROM banking.DSCRTest ORDER BY ProjectId, TestNumber');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getDSCRTestById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM banking.DSCRTest WHERE DSCRTestId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'DSCR Test not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getDSCRTestsByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT * FROM banking.DSCRTest WHERE ProjectId = @projectId ORDER BY TestNumber');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createDSCRTest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ProjectId, LoanId, FinancingType, TestNumber, TestDate, ProjectedInterestRate, Requirement, ProjectedValue, IsCompleted } = req.body;

    if (!ProjectId || !TestNumber) {
      res.status(400).json({ success: false, error: { message: 'ProjectId and TestNumber are required' } });
      return;
    }

    // Validate FinancingType
    if (FinancingType && FinancingType !== 'Construction' && FinancingType !== 'Permanent') {
      res.status(400).json({ success: false, error: { message: 'FinancingType must be "Construction" or "Permanent"' } });
      return;
    }

    // Default to Construction if not provided
    const finalFinancingType = FinancingType || 'Construction';

    const pool = await getConnection();
    const request = pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('FinancingType', sql.NVarChar, finalFinancingType)
      .input('TestNumber', sql.Int, TestNumber)
      .input('TestDate', sql.Date, TestDate)
      .input('ProjectedInterestRate', sql.NVarChar, ProjectedInterestRate)
      .input('Requirement', sql.Decimal(10, 2), Requirement)
      .input('ProjectedValue', sql.NVarChar, ProjectedValue)
      .input('IsCompleted', sql.Bit, IsCompleted !== undefined ? IsCompleted : false);

    // Insert without OUTPUT clause (triggers prevent OUTPUT INSERTED.*)
    await request.query(`
      INSERT INTO banking.DSCRTest (ProjectId, LoanId, FinancingType, TestNumber, TestDate, ProjectedInterestRate, Requirement, ProjectedValue, IsCompleted)
      VALUES (@ProjectId, @LoanId, @FinancingType, @TestNumber, @TestDate, @ProjectedInterestRate, @Requirement, @ProjectedValue, @IsCompleted)
    `);

    // Get the inserted record
    const result = await pool.request()
      .input('projectId', sql.Int, ProjectId)
      .input('testNumber', sql.Int, TestNumber)
      .input('financingType', sql.NVarChar, finalFinancingType)
      .query(`
        SELECT TOP 1 * FROM banking.DSCRTest 
        WHERE ProjectId = @projectId AND TestNumber = @testNumber AND FinancingType = @financingType
        ORDER BY DSCRTestId DESC
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'DSCR Test with this ProjectId and TestNumber already exists' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or LoanId' } });
      return;
    }
    next(error);
  }
};

export const updateDSCRTest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate FinancingType if provided
    if (updateData.FinancingType && updateData.FinancingType !== 'Construction' && updateData.FinancingType !== 'Permanent') {
      res.status(400).json({ success: false, error: { message: 'FinancingType must be "Construction" or "Permanent"' } });
      return;
    }

    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);

    // Build dynamic update query
    const fields: string[] = [];
    Object.keys(updateData).forEach((key) => {
      if (key !== 'DSCRTestId' && updateData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'ProjectId' || key === 'LoanId' || key === 'TestNumber') {
          request.input(key, sql.Int, updateData[key]);
        } else if (key === 'Requirement') {
          request.input(key, sql.Decimal(10, 2), updateData[key]);
        } else if (key === 'TestDate') {
          request.input(key, sql.Date, updateData[key]);
        } else if (key === 'IsCompleted') {
          request.input(key, sql.Bit, updateData[key]);
        } else {
          request.input(key, sql.NVarChar, updateData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    await request.query(`
      UPDATE banking.DSCRTest
      SET ${fields.join(', ')}
      WHERE DSCRTestId = @id
    `);

    // Get updated record
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM banking.DSCRTest WHERE DSCRTestId = @id');

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'DSCR Test not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'DSCR Test with this ProjectId and TestNumber already exists' } });
      return;
    }
    next(error);
  }
};

export const deleteDSCRTest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.DSCRTest WHERE DSCRTestId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'DSCR Test not found' } });
      return;
    }

    res.json({ success: true, message: 'DSCR Test deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// PARTICIPATION CONTROLLER
// ============================================================

export const getAllParticipations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        p.*, 
        pr.ProjectName, 
        pr.Stage AS ProjectStage,
        b.BankName,
        COALESCE(b.HQState, b.State) AS BankState,
        CASE WHEN COALESCE(pr.Stage, N'') = N'Liquidated' OR p.PaidOff = 1 THEN 0 ELSE p.ExposureAmount END AS ActiveExposure
      FROM banking.Participation p
      LEFT JOIN core.Project pr ON p.ProjectId = pr.ProjectId
      LEFT JOIN core.Bank b ON p.BankId = b.BankId
      ORDER BY p.ParticipationId
    `);
    
    // Group by project and calculate percentages
    const projectMap: { [key: number]: any[] } = {};
    result.recordset.forEach((row: any) => {
      if (!projectMap[row.ProjectId]) {
        projectMap[row.ProjectId] = [];
      }
      projectMap[row.ProjectId].push(row);
    });
    
    // Calculate total active exposure per project and update percentages (Liquidated deals = 0 exposure)
    const enrichedData: any[] = [];
    for (const projectId in projectMap) {
      const participations = projectMap[projectId];
      const totalActiveExposure = participations.reduce((sum, p) => sum + (parseFloat(p.ActiveExposure) || 0), 0);
      const isLiquidated = participations.some((p: any) => (p.ProjectStage || '').toString().trim() === 'Liquidated');
      
      participations.forEach((p: any) => {
        const activeExposure = parseFloat(p.ActiveExposure) || 0;
        let calculatedPercent: string;
        
        if (p.PaidOff === true || p.PaidOff === 1 || isLiquidated) {
          calculatedPercent = '0.0%';
        } else if (totalActiveExposure > 0) {
          const percentValue = (activeExposure / totalActiveExposure) * 100;
          calculatedPercent = `${percentValue.toFixed(1)}%`;
        } else {
          calculatedPercent = '0.0%';
        }
        
        const out: any = { ...p, ParticipationPercent: calculatedPercent, CalculatedParticipationPercent: calculatedPercent };
        if (isLiquidated) {
          out.ExposureAmount = 0;
          out.ActiveExposure = 0;
        }
        enrichedData.push(out);
      });
    }
    
    res.json({ success: true, data: enrichedData });
  } catch (error) {
    next(error);
  }
};

export const getParticipationById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT p.*, pr.Stage AS ProjectStage
        FROM banking.Participation p
        LEFT JOIN core.Project pr ON p.ProjectId = pr.ProjectId
        WHERE p.ParticipationId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Participation not found' } });
      return;
    }
    
    const row = result.recordset[0];
    const isLiquidated = (row.ProjectStage || '').toString().trim() === 'Liquidated';
    const data = { ...row };
    if (isLiquidated) {
      data.ExposureAmount = 0;
    }
    delete data.ProjectStage;
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getParticipationsByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          p.*,
          pr.Stage AS ProjectStage,
          b.BankName,
          COALESCE(b.HQState, b.State) AS BankState,
          CASE WHEN COALESCE(pr.Stage, N'') = N'Liquidated' OR p.PaidOff = 1 THEN 0 ELSE p.ExposureAmount END AS ActiveExposure
        FROM banking.Participation p
        LEFT JOIN core.Project pr ON p.ProjectId = pr.ProjectId
        LEFT JOIN core.Bank b ON p.BankId = b.BankId
        WHERE p.ProjectId = @projectId 
        ORDER BY p.ParticipationId
      `);
    
    const projectStage = (result.recordset[0]?.ProjectStage || '').toString().trim();
    const isLiquidated = projectStage === 'Liquidated';
    
    // Calculate total active exposure for this project (0 when Liquidated)
    const totalActiveExposure = isLiquidated ? 0 : result.recordset.reduce((sum, p) => sum + (parseFloat(p.ActiveExposure) || 0), 0);
    
    // Calculate percentages based on active exposure; Liquidated => exposure 0
    const enrichedData = result.recordset.map((p: any) => {
      const activeExposure = isLiquidated ? 0 : (parseFloat(p.ActiveExposure) || 0);
      let calculatedPercent: string;
      
      if (p.PaidOff === true || p.PaidOff === 1 || isLiquidated) {
        calculatedPercent = '0.0%';
      } else if (totalActiveExposure > 0) {
        const percentValue = (activeExposure / totalActiveExposure) * 100;
        calculatedPercent = `${percentValue.toFixed(1)}%`;
      } else {
        calculatedPercent = '0.0%';
      }
      
      const out: any = { ...p, ParticipationPercent: calculatedPercent, CalculatedParticipationPercent: calculatedPercent };
      if (isLiquidated) {
        out.ExposureAmount = 0;
        out.ActiveExposure = 0;
      }
      return out;
    });
    
    res.json({ success: true, data: enrichedData });
  } catch (error) {
    next(error);
  }
};

function toIsLeadBit(val: unknown): boolean {
  return val === true || val === 1 || (typeof val === 'string' && val.toLowerCase() === 'true');
}

export const createParticipation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ProjectId, LoanId, BankId, FinancingType, ParticipationPercent, ExposureAmount, PaidOff, IsLead, Notes } = req.body;

    if (!ProjectId || !BankId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId and BankId are required' } });
      return;
    }

    // Validate FinancingType if provided, otherwise default to 'Construction'
    const finalFinancingType = FinancingType || 'Construction';
    if (finalFinancingType !== 'Construction' && finalFinancingType !== 'Permanent') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'FinancingType must be "Construction" or "Permanent"' } 
      });
      return;
    }

    const isLead = toIsLeadBit(IsLead);
    const pool = await getConnection();

    if (isLead) {
      await pool.request()
        .input('ProjectId', sql.Int, ProjectId)
        .query(`UPDATE banking.Participation SET IsLead = 0 WHERE ProjectId = @ProjectId`);
    }

    const result = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('BankId', sql.Int, BankId)
      .input('FinancingType', sql.NVarChar, finalFinancingType)
      .input('ParticipationPercent', sql.NVarChar, ParticipationPercent)
      .input('ExposureAmount', sql.Decimal(18, 2), ExposureAmount)
      .input('PaidOff', sql.Bit, PaidOff)
      .input('IsLead', sql.Bit, isLead)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO banking.Participation (ProjectId, LoanId, BankId, FinancingType, ParticipationPercent, ExposureAmount, PaidOff, IsLead, Notes)
        OUTPUT INSERTED.*
        VALUES (@ProjectId, @LoanId, @BankId, @FinancingType, @ParticipationPercent, @ExposureAmount, @PaidOff, @IsLead, @Notes)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId, LoanId, or BankId' } });
      return;
    }
    if (error.number === 547 && error.message.includes('CK_Participation_FinancingType')) {
      res.status(400).json({ 
        success: false, 
        error: { message: 'FinancingType must be "Construction" or "Permanent"' } 
      });
      return;
    }
    next(error);
  }
};

/**
 * Create participation by ProjectId - convenience function for Domo
 * Automatically finds the construction loan for the project
 */
export const createParticipationByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { BankId, FinancingType, ParticipationPercent, ExposureAmount, PaidOff, IsLead, Notes } = req.body;

    if (!BankId) {
      res.status(400).json({ success: false, error: { message: 'BankId is required' } });
      return;
    }

    // Validate FinancingType if provided
    if (FinancingType && FinancingType !== 'Construction' && FinancingType !== 'Permanent') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'FinancingType must be "Construction" or "Permanent"' } 
      });
      return;
    }

    // Default to 'Construction' if not provided
    const finalFinancingType = FinancingType || 'Construction';
    const isLead = toIsLeadBit(IsLead);
    const pool = await getConnection();

    if (isLead) {
      await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .query(`UPDATE banking.Participation SET IsLead = 0 WHERE ProjectId = @ProjectId`);
    }
    
    // Find the loan for this project (prefer Construction, but allow Permanent)
    const findLoan = await pool.request()
      .input('projectId', sql.Int, projectId)
      .input('financingType', sql.NVarChar, finalFinancingType)
      .query(`
        SELECT TOP 1 LoanId, LoanPhase
        FROM banking.Loan 
        WHERE ProjectId = @projectId 
          AND (
            (@financingType = 'Construction' AND LoanPhase = 'Construction')
            OR (@financingType = 'Permanent' AND LoanPhase = 'Permanent')
            OR (@financingType IS NULL)
          )
        ORDER BY CASE WHEN LoanPhase = @financingType THEN 0 ELSE 1 END, LoanId
      `);

    if (findLoan.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: `No ${finalFinancingType} loan found for this project` } });
      return;
    }

    const loanId = findLoan.recordset[0].LoanId;
    
    // Create the participation
    const result = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('LoanId', sql.Int, loanId)
      .input('BankId', sql.Int, BankId)
      .input('FinancingType', sql.NVarChar, finalFinancingType)
      .input('ParticipationPercent', sql.NVarChar, ParticipationPercent)
      .input('ExposureAmount', sql.Decimal(18, 2), ExposureAmount)
      .input('PaidOff', sql.Bit, PaidOff || false)
      .input('IsLead', sql.Bit, isLead)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO banking.Participation (ProjectId, LoanId, BankId, FinancingType, ParticipationPercent, ExposureAmount, PaidOff, IsLead, Notes)
        OUTPUT INSERTED.*
        VALUES (@ProjectId, @LoanId, @BankId, @FinancingType, @ParticipationPercent, @ExposureAmount, @PaidOff, @IsLead, @Notes)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or BankId' } });
      return;
    }
    if (error.number === 547 && error.message.includes('CK_Participation_FinancingType')) {
      res.status(400).json({ 
        success: false, 
        error: { message: 'FinancingType must be "Construction" or "Permanent"' } 
      });
      return;
    }
    next(error);
  }
};

export const updateParticipation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const participationData = req.body;

    // Validate FinancingType if provided
    if (participationData.FinancingType && 
        participationData.FinancingType !== 'Construction' && 
        participationData.FinancingType !== 'Permanent') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'FinancingType must be "Construction" or "Permanent"' } 
      });
      return;
    }

    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);

    // Build dynamic update query - only update fields that are provided
    const readonlyKeys = ['ParticipationId', 'CreatedAt', 'UpdatedAt'];
    const fields: string[] = [];
    Object.keys(participationData).forEach((key) => {
      if (!readonlyKeys.includes(key) && participationData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'ProjectId' || key === 'LoanId' || key === 'BankId') {
          request.input(key, sql.Int, participationData[key]);
        } else if (key === 'ExposureAmount') {
          request.input(key, sql.Decimal(18, 2), participationData[key]);
        } else if (key === 'PaidOff' || key === 'IsLead') {
          // Accept boolean or "true"/"false" string for BIT columns
          const val = participationData[key];
          request.input(key, sql.Bit, val === true || val === 1 || (typeof val === 'string' && val.toLowerCase() === 'true'));
        } else if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), participationData[key]);
        } else {
          request.input(key, sql.NVarChar, participationData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    // When setting IsLead = true, clear other participations' IsLead for the same project (one lead per deal)
    if (participationData.IsLead !== undefined && toIsLeadBit(participationData.IsLead)) {
      const current = await pool.request().input('id', sql.Int, id).query(`
        SELECT ProjectId FROM banking.Participation WHERE ParticipationId = @id
      `);
      if (current.recordset.length > 0) {
        await pool.request()
          .input('ProjectId', sql.Int, current.recordset[0].ProjectId)
          .input('id', sql.Int, id)
          .query(`UPDATE banking.Participation SET IsLead = 0 WHERE ProjectId = @ProjectId AND ParticipationId <> @id`);
      }
    }

    const result = await request.query(`
      UPDATE banking.Participation
      SET ${fields.join(', ')}
      WHERE ParticipationId = @id;
      SELECT * FROM banking.Participation WHERE ParticipationId = @id;
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Participation not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      if (error.message && error.message.includes('CK_Participation_FinancingType')) {
        res.status(400).json({ 
          success: false, 
          error: { message: 'FinancingType must be "Construction" or "Permanent"' } 
        });
        return;
      }
      res.status(400).json({ success: false, error: { message: 'Invalid foreign key reference' } });
      return;
    }
    next(error);
  }
};

export const deleteParticipation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.Participation WHERE ParticipationId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Participation not found' } });
      return;
    }

    res.json({ success: true, message: 'Participation deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GUARANTEE CONTROLLER
// ============================================================

export const getAllGuarantees = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT g.*, p.ProjectName, pe.FullName as PersonName
      FROM banking.Guarantee g
      LEFT JOIN core.Project p ON g.ProjectId = p.ProjectId
      LEFT JOIN core.Person pe ON g.PersonId = pe.PersonId
      ORDER BY g.GuaranteeId
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getGuaranteeById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM banking.Guarantee WHERE GuaranteeId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Guarantee not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getGuaranteesByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT * FROM banking.Guarantee WHERE ProjectId = @projectId ORDER BY GuaranteeId');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createGuarantee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ProjectId, LoanId, FinancingType, PersonId, GuaranteePercent, GuaranteeAmount, Notes } = req.body;

    if (!ProjectId || !PersonId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId and PersonId are required' } });
      return;
    }

    // Validate FinancingType
    if (FinancingType && FinancingType !== 'Construction' && FinancingType !== 'Permanent') {
      res.status(400).json({ success: false, error: { message: 'FinancingType must be "Construction" or "Permanent"' } });
      return;
    }

    // Default to Construction if not provided
    const finalFinancingType = FinancingType || 'Construction';

    const pool = await getConnection();
    const request = pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('FinancingType', sql.NVarChar, finalFinancingType)
      .input('PersonId', sql.Int, PersonId)
      .input('GuaranteePercent', sql.Decimal(10, 4), GuaranteePercent)
      .input('GuaranteeAmount', sql.Decimal(18, 2), GuaranteeAmount)
      .input('Notes', sql.NVarChar(sql.MAX), Notes);

    // Insert without OUTPUT clause (triggers prevent OUTPUT INSERTED.*)
    await request.query(`
      INSERT INTO banking.Guarantee (ProjectId, LoanId, FinancingType, PersonId, GuaranteePercent, GuaranteeAmount, Notes)
      VALUES (@ProjectId, @LoanId, @FinancingType, @PersonId, @GuaranteePercent, @GuaranteeAmount, @Notes)
    `);

    // Get the inserted record
    const result = await pool.request()
      .input('projectId', sql.Int, ProjectId)
      .input('personId', sql.Int, PersonId)
      .input('financingType', sql.NVarChar, finalFinancingType)
      .query(`
        SELECT TOP 1 * FROM banking.Guarantee 
        WHERE ProjectId = @projectId AND PersonId = @personId AND FinancingType = @financingType
        ORDER BY GuaranteeId DESC
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId, LoanId, or PersonId' } });
      return;
    }
    next(error);
  }
};

/**
 * Create guarantee by ProjectId - convenience function for Domo
 * Automatically finds the construction loan for the project
 */
export const createGuaranteeByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { PersonId, GuaranteePercent, GuaranteeAmount, Notes } = req.body;

    if (!PersonId) {
      res.status(400).json({ success: false, error: { message: 'PersonId is required' } });
      return;
    }

    const pool = await getConnection();
    
    // Find the construction loan for this project
    const findLoan = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT TOP 1 LoanId 
        FROM banking.Loan 
        WHERE ProjectId = @projectId 
        ORDER BY CASE WHEN LoanPhase = 'Construction' THEN 0 ELSE 1 END, LoanId
      `);

    if (findLoan.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'No loan found for this project' } });
      return;
    }

    const loanId = findLoan.recordset[0].LoanId;
    
    // Create the guarantee
    const result = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('LoanId', sql.Int, loanId)
      .input('PersonId', sql.Int, PersonId)
      .input('GuaranteePercent', sql.Decimal(10, 4), GuaranteePercent)
      .input('GuaranteeAmount', sql.Decimal(18, 2), GuaranteeAmount)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO banking.Guarantee (ProjectId, LoanId, PersonId, GuaranteePercent, GuaranteeAmount, Notes)
        OUTPUT INSERTED.*
        VALUES (@ProjectId, @LoanId, @PersonId, @GuaranteePercent, @GuaranteeAmount, @Notes)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or PersonId' } });
      return;
    }
    next(error);
  }
};

export const updateGuarantee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const guaranteeData = req.body;

    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);

    // Build dynamic update query - only update fields that are provided
    const fields: string[] = [];
    Object.keys(guaranteeData).forEach((key) => {
      if (key !== 'GuaranteeId' && guaranteeData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'ProjectId' || key === 'LoanId' || key === 'PersonId') {
          request.input(key, sql.Int, guaranteeData[key]);
        } else if (key === 'GuaranteePercent') {
          request.input(key, sql.Decimal(10, 4), guaranteeData[key]);
        } else if (key === 'GuaranteeAmount') {
          request.input(key, sql.Decimal(18, 2), guaranteeData[key]);
        } else if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), guaranteeData[key]);
        } else {
          request.input(key, sql.NVarChar, guaranteeData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    const result = await request.query(`
      UPDATE banking.Guarantee
      SET ${fields.join(', ')}
      WHERE GuaranteeId = @id;
      SELECT * FROM banking.Guarantee WHERE GuaranteeId = @id;
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Guarantee not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid foreign key reference' } });
      return;
    }
    next(error);
  }
};

export const deleteGuarantee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.Guarantee WHERE GuaranteeId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Guarantee not found' } });
      return;
    }

    res.json({ success: true, message: 'Guarantee deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// HELPER FUNCTION: Sync Maturity Covenants
// ============================================================

function sameDate(a: Date | string | null, b: Date | string | null): boolean {
  if (!a || !b) return false;
  const d1 = typeof a === 'string' ? new Date(a) : a;
  const d2 = typeof b === 'string' ? new Date(b) : b;
  return d1.getTime() === d2.getTime();
}

/**
 * Auto-creates or updates maturity covenants based on loan's maturity dates
 * IsCompleted remains manual - users must check it off themselves
 */
async function syncMaturityCovenant(
  pool: sql.ConnectionPool,
  projectId: number,
  loanId: number,
  maturityDate: Date | string | null,
  covenantType: string,
  requirement: string
): Promise<void> {
  try {
    if (!maturityDate) return;
    
    const date = typeof maturityDate === 'string' ? new Date(maturityDate) : maturityDate;

    // Check if maturity covenant already exists
    const existingCovenant = await pool.request()
      .input('projectId', sql.Int, projectId)
      .input('loanId', sql.Int, loanId)
      .input('covenantType', sql.NVarChar, covenantType)
      .query(`
        SELECT CovenantId, IsCompleted
        FROM banking.Covenant
        WHERE ProjectId = @projectId
          AND LoanId = @loanId
          AND CovenantType = @covenantType
      `);

    if (existingCovenant.recordset.length > 0) {
      // Update existing covenant date only (preserve manual IsCompleted and Notes)
      const covenantId = existingCovenant.recordset[0].CovenantId;
      await pool.request()
        .input('covenantId', sql.Int, covenantId)
        .input('covenantDate', sql.Date, date)
        .input('requirement', sql.NVarChar, requirement)
        .query(`
          UPDATE banking.Covenant
          SET CovenantDate = @covenantDate,
              Requirement = @requirement
          WHERE CovenantId = @covenantId
        `);
    } else {
      // Create new maturity covenant (IsCompleted defaults to false)
      await pool.request()
        .input('projectId', sql.Int, projectId)
        .input('loanId', sql.Int, loanId)
        .input('covenantType', sql.NVarChar, covenantType)
        .input('covenantDate', sql.Date, date)
        .input('requirement', sql.NVarChar, requirement)
        .query(`
          INSERT INTO banking.Covenant (
            ProjectId, LoanId, CovenantType,
            CovenantDate, Requirement, IsCompleted
          )
          VALUES (
            @projectId, @loanId, @covenantType,
            @covenantDate, @requirement, 0
          )
        `);
    }
  } catch (error) {
    // Log error but don't fail the loan operation
    console.error(`Error syncing ${covenantType} covenant:`, error);
  }
}

/**
 * Sync all maturity covenants for a loan
 */
async function syncAllMaturityCovenants(
  pool: sql.ConnectionPool,
  projectId: number,
  loanId: number,
  loanPhase: string,
  ioMaturityDate: Date | string | null,
  maturityDate: Date | string | null,
  miniPermMaturity: Date | string | null,
  permPhaseMaturity: Date | string | null
): Promise<void> {
  // LLC projects do not get covenants – skip sync
  const projectRow = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query('SELECT ProjectName FROM core.Project WHERE ProjectId = @projectId');
  const projectName = projectRow.recordset[0]?.ProjectName;
  if (projectName != null && String(projectName).toUpperCase().includes('LLC')) return;

  // I/O Maturity - create when loan has an I/O date (Construction or Permanent)
  if (ioMaturityDate) {
    const ioLabel = loanPhase === 'Construction' ? 'Construction I/O Maturity' : 'I/O Maturity';
    await syncMaturityCovenant(pool, projectId, loanId, ioMaturityDate, 'I/O Maturity', ioLabel);
  }

  // General Maturity Date (skip for Permanent when Perm Phase exists – same thing, avoid duplicate)
  if (maturityDate) {
    const isSameAsPermPhase = permPhaseMaturity && sameDate(maturityDate, permPhaseMaturity);
    if (loanPhase === 'Permanent' && isSameAsPermPhase) {
      // Only sync Perm Phase Maturity below; do not create redundant Permanent Loan Maturity
    } else {
      const maturityType = loanPhase === 'Construction' ? 'Loan Maturity' :
                           loanPhase === 'Permanent' ? 'Permanent Loan Maturity' :
                           loanPhase === 'MiniPerm' ? 'Mini-Perm Maturity' :
                           'Loan Maturity';
      await syncMaturityCovenant(pool, projectId, loanId, maturityDate, maturityType, `${loanPhase} Loan Maturity`);
    }
  }

  // Mini-Perm Maturity
  if (miniPermMaturity) {
    await syncMaturityCovenant(pool, projectId, loanId, miniPermMaturity, 'Mini-Perm Maturity', 'Mini-Perm Loan Maturity');
  }

  // Perm Phase Maturity (canonical for permanent-phase date; same as Permanent Loan Maturity when date matches)
  if (permPhaseMaturity) {
    await syncMaturityCovenant(pool, projectId, loanId, permPhaseMaturity, 'Perm Phase Maturity', 'Permanent Phase Maturity');
  }
}

// ============================================================
// COVENANT CONTROLLER (incl. reminder settings & email)
// ============================================================

/** Map covenant row from DB: ReminderEmails/ReminderDaysBefore comma strings -> arrays for API. */
function mapCovenantForResponse(row: any): any {
  const out = { ...row };
  out.ReminderEmails = (row.ReminderEmails != null && typeof row.ReminderEmails === 'string')
    ? row.ReminderEmails.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];
  out.ReminderDaysBefore = (row.ReminderDaysBefore != null && typeof row.ReminderDaysBefore === 'string')
    ? row.ReminderDaysBefore.split(',').map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n))
    : [];
  return out;
}

function reminderEmailsToDb(val: string[] | undefined): string | null {
  if (!val || !Array.isArray(val)) return null;
  const trimmed = val.map(s => String(s).trim()).filter(Boolean);
  return trimmed.length ? trimmed.join(',') : null;
}

function reminderDaysBeforeToDb(val: number[] | undefined): string | null {
  if (!val || !Array.isArray(val)) return null;
  const nums = val.map(n => parseInt(String(n), 10)).filter(n => !isNaN(n) && n > 0);
  return nums.length ? nums.join(',') : null;
}

export const getAllCovenants = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    // Exclude covenants for LLC projects (LLCs do not get covenants)
    const result = await pool.request().query(`
      SELECT c.* FROM banking.Covenant c
      INNER JOIN core.Project p ON c.ProjectId = p.ProjectId
      WHERE (p.ProjectName IS NULL OR p.ProjectName NOT LIKE N'%LLC%')
      ORDER BY c.ProjectId, c.CovenantDate
    `);
    res.json({ success: true, data: (result.recordset as any[]).map(mapCovenantForResponse) });
  } catch (error) {
    next(error);
  }
};

export const getCovenantById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT c.* FROM banking.Covenant c
        INNER JOIN core.Project p ON c.ProjectId = p.ProjectId
        WHERE c.CovenantId = @id AND (p.ProjectName IS NULL OR p.ProjectName NOT LIKE N'%LLC%')
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Covenant not found' } });
      return;
    }
    
    res.json({ success: true, data: mapCovenantForResponse(result.recordset[0]) });
  } catch (error) {
    next(error);
  }
};

export const getCovenantsByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const projectCheck = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT ProjectName FROM core.Project WHERE ProjectId = @projectId');
    if (projectCheck.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Project not found' } });
      return;
    }
    const projectName = (projectCheck.recordset[0] as any).ProjectName;
    if (projectName != null && String(projectName).toUpperCase().includes('LLC')) {
      res.json({ success: true, data: [] });
      return;
    }
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT * FROM banking.Covenant WHERE ProjectId = @projectId ORDER BY CovenantId');
    res.json({ success: true, data: (result.recordset as any[]).map(mapCovenantForResponse) });
  } catch (error) {
    next(error);
  }
};

export const createCovenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { 
      ProjectId, LoanId, FinancingType, CovenantType,
      // DSCR fields
      DSCRTestDate, ProjectedInterestRate, DSCRRequirement, ProjectedDSCR,
      // Occupancy fields
      OccupancyCovenantDate, OccupancyRequirement, ProjectedOccupancy,
      // Liquidity Requirement fields
      LiquidityRequirementLendingBank,
      // Other fields (legacy)
      CovenantDate, Requirement, ProjectedValue,
      Notes,
      IsCompleted
    } = req.body;

    if (!ProjectId || !CovenantType) {
      res.status(400).json({ success: false, error: { message: 'ProjectId and CovenantType are required' } });
      return;
    }

    const pool = await getConnection();
    const projectCheck = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .query('SELECT ProjectName FROM core.Project WHERE ProjectId = @ProjectId');
    if (projectCheck.recordset.length === 0) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    const projName = (projectCheck.recordset[0] as any).ProjectName;
    if (projName != null && String(projName).toUpperCase().includes('LLC')) {
      res.status(400).json({ success: false, error: { message: 'Covenants cannot be created for LLC projects' } });
      return;
    }

    // Validate CovenantType
    const validTypes = ['DSCR', 'Occupancy', 'Liquidity Requirement', 'I/O Maturity', 'Loan Maturity', 'Permanent Loan Maturity', 'Mini-Perm Maturity', 'Perm Phase Maturity', 'Other'];
    if (!validTypes.includes(CovenantType)) {
      res.status(400).json({ 
        success: false, 
        error: { message: `CovenantType must be one of: ${validTypes.join(', ')}` } 
      });
      return;
    }

    // Validate FinancingType
    if (FinancingType && FinancingType !== 'Construction' && FinancingType !== 'Permanent') {
      res.status(400).json({ success: false, error: { message: 'FinancingType must be "Construction" or "Permanent"' } });
      return;
    }

    // Default to Construction if not provided
    const finalFinancingType = FinancingType || 'Construction';

    const request = pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('FinancingType', sql.NVarChar, finalFinancingType)
      .input('CovenantType', sql.NVarChar, CovenantType)
      // DSCR fields
      .input('DSCRTestDate', sql.Date, DSCRTestDate)
      .input('ProjectedInterestRate', sql.NVarChar, ProjectedInterestRate)
      .input('DSCRRequirement', sql.NVarChar, DSCRRequirement)
      .input('ProjectedDSCR', sql.NVarChar, ProjectedDSCR)
      // Occupancy fields
      .input('OccupancyCovenantDate', sql.Date, OccupancyCovenantDate)
      .input('OccupancyRequirement', sql.NVarChar, OccupancyRequirement)
      .input('ProjectedOccupancy', sql.NVarChar, ProjectedOccupancy)
      // Liquidity Requirement fields
      .input('LiquidityRequirementLendingBank', sql.Decimal(18, 2), LiquidityRequirementLendingBank)
      // Other fields (legacy)
      .input('CovenantDate', sql.Date, CovenantDate)
      .input('Requirement', sql.NVarChar, Requirement)
      .input('ProjectedValue', sql.NVarChar, ProjectedValue)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .input('IsCompleted', sql.Bit, IsCompleted !== undefined ? IsCompleted : false);

    // Insert without OUTPUT clause (triggers prevent OUTPUT INSERTED.*)
    // ReminderEmails/ReminderDaysBefore omitted: optional columns; use global reminder settings.
    await request.query(`
      INSERT INTO banking.Covenant (
        ProjectId, LoanId, FinancingType, CovenantType,
        DSCRTestDate, ProjectedInterestRate, DSCRRequirement, ProjectedDSCR,
        OccupancyCovenantDate, OccupancyRequirement, ProjectedOccupancy,
        LiquidityRequirementLendingBank,
        CovenantDate, Requirement, ProjectedValue,
        Notes, IsCompleted
      )
      VALUES (
        @ProjectId, @LoanId, @FinancingType, @CovenantType,
        @DSCRTestDate, @ProjectedInterestRate, @DSCRRequirement, @ProjectedDSCR,
        @OccupancyCovenantDate, @OccupancyRequirement, @ProjectedOccupancy,
        @LiquidityRequirementLendingBank,
        @CovenantDate, @Requirement, @ProjectedValue,
        @Notes, @IsCompleted
      )
    `);

    // Get the inserted record
    const result = await pool.request()
      .input('projectId', sql.Int, ProjectId)
      .input('financingType', sql.NVarChar, finalFinancingType)
      .query(`
        SELECT TOP 1 * FROM banking.Covenant 
        WHERE ProjectId = @projectId AND FinancingType = @financingType
        ORDER BY CovenantId DESC
      `);

    res.status(201).json({ success: true, data: mapCovenantForResponse(result.recordset[0]) });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or LoanId' } });
      return;
    }
    next(error);
  }
};

/**
 * Create covenant by ProjectId - convenience function for Domo
 * Automatically finds the construction loan for the project
 */
export const createCovenantByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { 
      CovenantType,
      // DSCR fields
      DSCRTestDate, ProjectedInterestRate, DSCRRequirement, ProjectedDSCR,
      // Occupancy fields
      OccupancyCovenantDate, OccupancyRequirement, ProjectedOccupancy,
      // Liquidity Requirement fields
      LiquidityRequirementLendingBank,
      // Other fields (legacy)
      CovenantDate, Requirement, ProjectedValue,
      Notes,
      IsCompleted
    } = req.body;

    if (!CovenantType) {
      res.status(400).json({ success: false, error: { message: 'CovenantType is required' } });
      return;
    }

    // Validate CovenantType
    const validTypes = ['DSCR', 'Occupancy', 'Liquidity Requirement', 'I/O Maturity', 'Loan Maturity', 'Permanent Loan Maturity', 'Mini-Perm Maturity', 'Perm Phase Maturity', 'Other'];
    if (!validTypes.includes(CovenantType)) {
      res.status(400).json({ 
        success: false, 
        error: { message: `CovenantType must be one of: ${validTypes.join(', ')}` } 
      });
      return;
    }

    const pool = await getConnection();
    
    // Find the construction loan for this project
    const findLoan = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT TOP 1 LoanId 
        FROM banking.Loan 
        WHERE ProjectId = @projectId 
        ORDER BY CASE WHEN LoanPhase = 'Construction' THEN 0 ELSE 1 END, LoanId
      `);

    if (findLoan.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'No loan found for this project' } });
      return;
    }

    const loanId = findLoan.recordset[0].LoanId;
    
    // Create the covenant (ReminderEmails/ReminderDaysBefore omitted: optional columns; use global reminder settings)
    const result = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('LoanId', sql.Int, loanId)
      .input('CovenantType', sql.NVarChar, CovenantType)
      // DSCR fields
      .input('DSCRTestDate', sql.Date, DSCRTestDate)
      .input('ProjectedInterestRate', sql.NVarChar, ProjectedInterestRate)
      .input('DSCRRequirement', sql.NVarChar, DSCRRequirement)
      .input('ProjectedDSCR', sql.NVarChar, ProjectedDSCR)
      // Occupancy fields
      .input('OccupancyCovenantDate', sql.Date, OccupancyCovenantDate)
      .input('OccupancyRequirement', sql.NVarChar, OccupancyRequirement)
      .input('ProjectedOccupancy', sql.NVarChar, ProjectedOccupancy)
      // Liquidity Requirement fields
      .input('LiquidityRequirementLendingBank', sql.Decimal(18, 2), LiquidityRequirementLendingBank)
      // Other fields (legacy)
      .input('CovenantDate', sql.Date, CovenantDate)
      .input('Requirement', sql.NVarChar, Requirement)
      .input('ProjectedValue', sql.NVarChar, ProjectedValue)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .input('IsCompleted', sql.Bit, IsCompleted !== undefined ? IsCompleted : false)
      .query(`
        INSERT INTO banking.Covenant (
          ProjectId, LoanId, CovenantType,
          DSCRTestDate, ProjectedInterestRate, DSCRRequirement, ProjectedDSCR,
          OccupancyCovenantDate, OccupancyRequirement, ProjectedOccupancy,
          LiquidityRequirementLendingBank,
          CovenantDate, Requirement, ProjectedValue,
          Notes, IsCompleted
        )
        OUTPUT INSERTED.*
        VALUES (
          @ProjectId, @LoanId, @CovenantType,
          @DSCRTestDate, @ProjectedInterestRate, @DSCRRequirement, @ProjectedDSCR,
          @OccupancyCovenantDate, @OccupancyRequirement, @ProjectedOccupancy,
          @LiquidityRequirementLendingBank,
          @CovenantDate, @Requirement, @ProjectedValue,
          @Notes, @IsCompleted
        )
      `);

    res.status(201).json({ success: true, data: mapCovenantForResponse(result.recordset[0]) });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const updateCovenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const covenantData = req.body;

    // Validate CovenantType if provided
    if (covenantData.CovenantType !== undefined) {
      const validTypes = ['DSCR', 'Occupancy', 'Liquidity Requirement', 'I/O Maturity', 'Other'];
      if (!validTypes.includes(covenantData.CovenantType)) {
        res.status(400).json({ 
          success: false, 
          error: { message: `CovenantType must be one of: ${validTypes.join(', ')}` } 
        });
        return;
      }
    }

    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);

    // Build dynamic update query - only update fields that are provided
    const fields: string[] = [];
    Object.keys(covenantData).forEach((key) => {
      if (key !== 'CovenantId' && covenantData[key] !== undefined) {
        if (key === 'ReminderEmails' || key === 'ReminderDaysBefore') {
          // Skip: optional columns not on Covenant table; reminder config is global
          return;
        }
        fields.push(`${key} = @${key}`);
        if (key === 'ProjectId' || key === 'LoanId') {
          request.input(key, sql.Int, covenantData[key]);
        } else if (key === 'CovenantDate' || key === 'DSCRTestDate' || key === 'OccupancyCovenantDate') {
          request.input(key, sql.Date, covenantData[key]);
        } else if (key === 'LiquidityRequirementLendingBank') {
          request.input(key, sql.Decimal(18, 2), covenantData[key]);
        } else if (key === 'IsCompleted') {
          request.input(key, sql.Bit, covenantData[key]);
        } else if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), covenantData[key]);
        } else {
          request.input(key, sql.NVarChar, covenantData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    const result = await request.query(`
      UPDATE banking.Covenant
      SET ${fields.join(', ')}
      WHERE CovenantId = @id;
      SELECT * FROM banking.Covenant WHERE CovenantId = @id;
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Covenant not found' } });
      return;
    }

    res.json({ success: true, data: mapCovenantForResponse(result.recordset[0]) });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid foreign key reference' } });
      return;
    }
    next(error);
  }
};

export const getBankingEmailTemplates = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const templates = [
      {
        TemplateId: 'CovenantReminder',
        Name: 'Covenant Reminder',
        Description: 'Used for covenant date reminders (scheduled and send now).',
        SubjectTemplate: 'Covenant reminder: {{CovenantType}} – {{ProjectName}} – {{CovenantDate}}',
        BodyTemplateHtml: null,
      },
    ];
    res.json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
};

const UPCOMING_DATES_REMINDER_SETTINGS_KEY = 'upcoming-dates-reminders';
const DEFAULT_UPCOMING_DATES_SETTINGS = { recipientEmails: [] as string[], additionalEmails: '', daysBefore: [] as number[] };

export const getUpcomingDatesReminderSettings = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input('key', sql.NVarChar(100), UPCOMING_DATES_REMINDER_SETTINGS_KEY)
      .query('SELECT SettingValue FROM banking.AppSettings WHERE SettingKey = @key');
    if (result.recordset.length === 0 || result.recordset[0].SettingValue == null) {
      res.json({ success: true, data: DEFAULT_UPCOMING_DATES_SETTINGS });
      return;
    }
    try {
      const data = JSON.parse(result.recordset[0].SettingValue as string);
      res.json({
        success: true,
        data: {
          recipientEmails: Array.isArray(data.recipientEmails) ? data.recipientEmails : [],
          additionalEmails: typeof data.additionalEmails === 'string' ? data.additionalEmails : '',
          daysBefore: Array.isArray(data.daysBefore) ? data.daysBefore : [],
        },
      });
    } catch {
      res.json({ success: true, data: DEFAULT_UPCOMING_DATES_SETTINGS });
    }
  } catch (error) {
    next(error);
  }
};

export const saveUpcomingDatesReminderSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { recipientEmails, additionalEmails, daysBefore } = req.body as {
      recipientEmails?: string[];
      additionalEmails?: string;
      daysBefore?: number[];
    };
    const payload = {
      recipientEmails: Array.isArray(recipientEmails) ? recipientEmails : [],
      additionalEmails: typeof additionalEmails === 'string' ? additionalEmails : '',
      daysBefore: Array.isArray(daysBefore) ? daysBefore : [],
    };
    const pool = await getConnection();
    await pool.request()
      .input('key', sql.NVarChar(100), UPCOMING_DATES_REMINDER_SETTINGS_KEY)
      .input('value', sql.NVarChar(sql.MAX), JSON.stringify(payload))
      .query(`
        MERGE banking.AppSettings AS t
        USING (SELECT @key AS SettingKey, @value AS SettingValue) AS s
        ON t.SettingKey = s.SettingKey
        WHEN MATCHED THEN UPDATE SET SettingValue = s.SettingValue, UpdatedAt = SYSDATETIME()
        WHEN NOT MATCHED THEN INSERT (SettingKey, SettingValue) VALUES (s.SettingKey, s.SettingValue);
      `);
    res.json({ success: true, data: payload });
  } catch (error) {
    next(error);
  }
};

const COVENANT_REMINDER_BODY_HTML = `
  <h2 style="margin:0 0 16px;font-size:16px;color:#1f2937;">Upcoming covenant date</h2>
  <p style="margin:0 0 12px;font-size:14px;color:#4b5563;">This is a reminder for the following covenant.</p>
  <div style="background:#f0f4eb;border-left:4px solid #7e8a6b;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;font-size:14px;">
    <strong>Type:</strong> {{CovenantType}}<br/><strong>Date:</strong> {{CovenantDate}}<br/>{{DaysUntilBlock}}<strong>Requirement:</strong> {{Requirement}}
  </div>
  <p style="margin:0 0 12px;font-size:14px;color:#4b5563;">Please ensure required reporting or compliance is prepared by the date above.</p>
  <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Property: {{ProjectName}} · Covenant ID: {{CovenantId}}</div>
`;

function replaceTemplateVars(html: string, vars: Record<string, string>): string {
  let out = html;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}

export const sendCovenantReminder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const covenantId = parseInt(req.params.id, 10);
    const { ToEmails } = req.body as { ToEmails?: string[]; TemplateId?: string };
    if (isNaN(covenantId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid covenant id' } });
      return;
    }
    if (!ToEmails || !Array.isArray(ToEmails) || ToEmails.length === 0) {
      res.status(400).json({ success: false, error: { message: 'ToEmails (array of email addresses) is required' } });
      return;
    }
    const pool = await getConnection();
    const covenantResult = await pool.request()
      .input('id', sql.Int, covenantId)
      .query(`
        SELECT c.CovenantId, c.CovenantType, c.CovenantDate, c.DSCRTestDate, c.OccupancyCovenantDate, c.Requirement,
               p.ProjectName
        FROM banking.Covenant c
        LEFT JOIN core.Project p ON c.ProjectId = p.ProjectId
        WHERE c.CovenantId = @id
      `);
    if (covenantResult.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Covenant not found' } });
      return;
    }
    const row = covenantResult.recordset[0] as any;
    const covenantDate = row.CovenantDate ?? row.DSCRTestDate ?? row.OccupancyCovenantDate;
    const dateStr = covenantDate ? (typeof covenantDate === 'string' ? covenantDate.slice(0, 10) : (covenantDate as Date).toISOString?.()?.slice(0, 10) ?? '') : '';
    let daysUntil = '';
    if (dateStr) {
      const due = new Date(dateStr);
      const diff = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      daysUntil = diff > 0 ? `<strong>Days until due:</strong> ${diff}<br/>` : '';
    }
    const requirement = (row.Requirement != null && String(row.Requirement).trim()) ? String(row.Requirement).trim() : '—';
    const projectName = (row.ProjectName != null && String(row.ProjectName).trim()) ? String(row.ProjectName).trim() : 'Unknown';
    const covenantType = (row.CovenantType != null && String(row.CovenantType).trim()) ? String(row.CovenantType).trim() : 'Covenant';
    const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const bodyHtml = replaceTemplateVars(COVENANT_REMINDER_BODY_HTML, {
      ProjectName: escape(projectName),
      CovenantType: escape(covenantType),
      CovenantDate: dateStr || '—',
      DaysUntilBlock: daysUntil,
      Requirement: escape(requirement),
      CovenantId: String(covenantId),
    });
    const html = wrapStoaEmailLayout(bodyHtml, {
      pageTitle: 'Covenant Reminder',
      header: { title: 'Banking Dashboard – Covenant Reminder', subtitle: projectName },
      footer: { line: 'This reminder was sent by the system based on your reminder settings.' },
    });
    const subject = `Covenant reminder: ${covenantType} – ${projectName} – ${dateStr || '—'}`;
    const mailFrom = process.env.MAIL_FROM || process.env.SMTP_FROM;
    const smtpHost = process.env.SMTP_HOST;
    if (!smtpHost || !mailFrom) {
      res.status(503).json({ success: false, error: { message: 'Email not configured. Set SMTP_HOST, MAIL_FROM.' } });
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
    for (const to of ToEmails) {
      const email = String(to).trim();
      if (!email) continue;
      await transporter.sendMail({ from: mailFrom, to: email, subject, html });
    }
    res.json({ success: true, message: 'Reminder sent' });
  } catch (error: any) {
    next(error);
  }
};

export const deleteCovenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.Covenant WHERE CovenantId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Covenant not found' } });
      return;
    }

    res.json({ success: true, message: 'Covenant deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// LIQUIDITY REQUIREMENT CONTROLLER
// ============================================================

export const getAllLiquidityRequirements = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT * FROM banking.LiquidityRequirement ORDER BY ProjectId');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getLiquidityRequirementById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM banking.LiquidityRequirement WHERE LiquidityRequirementId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Liquidity Requirement not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getLiquidityRequirementsByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT * FROM banking.LiquidityRequirement WHERE ProjectId = @projectId ORDER BY LiquidityRequirementId');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createLiquidityRequirement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ProjectId, LoanId, FinancingType, TotalAmount, LendingBankAmount, Notes, IsCompleted } = req.body;

    if (!ProjectId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId is required' } });
      return;
    }

    // Validate FinancingType
    if (FinancingType && FinancingType !== 'Construction' && FinancingType !== 'Permanent') {
      res.status(400).json({ success: false, error: { message: 'FinancingType must be "Construction" or "Permanent"' } });
      return;
    }

    // Default to Construction if not provided
    const finalFinancingType = FinancingType || 'Construction';

    const pool = await getConnection();
    const request = pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('FinancingType', sql.NVarChar, finalFinancingType)
      .input('TotalAmount', sql.Decimal(18, 2), TotalAmount)
      .input('LendingBankAmount', sql.Decimal(18, 2), LendingBankAmount)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .input('IsCompleted', sql.Bit, IsCompleted !== undefined ? IsCompleted : false);

    // Insert without OUTPUT clause (triggers prevent OUTPUT INSERTED.*)
    await request.query(`
      INSERT INTO banking.LiquidityRequirement (ProjectId, LoanId, FinancingType, TotalAmount, LendingBankAmount, Notes, IsCompleted)
      VALUES (@ProjectId, @LoanId, @FinancingType, @TotalAmount, @LendingBankAmount, @Notes, @IsCompleted)
    `);

    // Get the inserted record
    const result = await pool.request()
      .input('projectId', sql.Int, ProjectId)
      .input('financingType', sql.NVarChar, finalFinancingType)
      .query(`
        SELECT TOP 1 * FROM banking.LiquidityRequirement 
        WHERE ProjectId = @projectId AND FinancingType = @financingType
        ORDER BY LiquidityRequirementId DESC
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Liquidity requirement for this project already exists' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or LoanId' } });
      return;
    }
    next(error);
  }
};

export const updateLiquidityRequirement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { ProjectId, LoanId, TotalAmount, LendingBankAmount, Notes, IsCompleted } = req.body;

    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('TotalAmount', sql.Decimal(18, 2), TotalAmount)
      .input('LendingBankAmount', sql.Decimal(18, 2), LendingBankAmount)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .input('IsCompleted', sql.Bit, IsCompleted !== undefined ? IsCompleted : false)
      .query(`
        UPDATE banking.LiquidityRequirement
        SET ProjectId = @ProjectId, LoanId = @LoanId, TotalAmount = @TotalAmount,
            LendingBankAmount = @LendingBankAmount, Notes = @Notes, IsCompleted = @IsCompleted
        OUTPUT INSERTED.*
        WHERE LiquidityRequirementId = @id
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Liquidity Requirement not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid foreign key reference' } });
      return;
    }
    next(error);
  }
};

export const deleteLiquidityRequirement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.LiquidityRequirement WHERE LiquidityRequirementId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Liquidity Requirement not found' } });
      return;
    }

    res.json({ success: true, message: 'Liquidity Requirement deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// BANK TARGET CONTROLLER
// ============================================================

export const getAllBankTargets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT bt.*, b.BankName
      FROM banking.BankTarget bt
      LEFT JOIN core.Bank b ON bt.BankId = b.BankId
      ORDER BY bt.BankTargetId
    `);
    res.json({ success: true, data: normalizeStateInPayload(result.recordset) });
  } catch (error) {
    next(error);
  }
};

export const getBankTargetById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM banking.BankTarget WHERE BankTargetId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Bank Target not found' } });
      return;
    }
    
    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error) {
    next(error);
  }
};

export const createBankTarget = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { BankId, AssetsText, City, State, ExposureWithStoa, ContactText, Comments } = req.body;

    if (!BankId) {
      res.status(400).json({ success: false, error: { message: 'BankId is required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('BankId', sql.Int, BankId)
      .input('AssetsText', sql.NVarChar, AssetsText)
      .input('City', sql.NVarChar, City)
      .input('State', sql.NVarChar, normalizeState(State))
      .input('ExposureWithStoa', sql.Decimal(18, 2), ExposureWithStoa)
      .input('ContactText', sql.NVarChar(4000), ContactText)
      .input('Comments', sql.NVarChar(sql.MAX), Comments)
      .query(`
        INSERT INTO banking.BankTarget (BankId, AssetsText, City, State, ExposureWithStoa, ContactText, Comments)
        OUTPUT INSERTED.*
        VALUES (@BankId, @AssetsText, @City, @State, @ExposureWithStoa, @ContactText, @Comments)
      `);

    res.status(201).json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Bank target for this bank already exists' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid BankId' } });
      return;
    }
    next(error);
  }
};

export const updateBankTarget = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { BankId, AssetsText, City, State, ExposureWithStoa, ContactText, Comments } = req.body;

    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('BankId', sql.Int, BankId)
      .input('AssetsText', sql.NVarChar, AssetsText)
      .input('City', sql.NVarChar, City)
      .input('State', sql.NVarChar, normalizeState(State))
      .input('ExposureWithStoa', sql.Decimal(18, 2), ExposureWithStoa)
      .input('ContactText', sql.NVarChar(4000), ContactText)
      .input('Comments', sql.NVarChar(sql.MAX), Comments)
      .query(`
        UPDATE banking.BankTarget
        SET BankId = @BankId, AssetsText = @AssetsText, City = @City, State = @State,
            ExposureWithStoa = @ExposureWithStoa, ContactText = @ContactText, Comments = @Comments
        OUTPUT INSERTED.*
        WHERE BankTargetId = @id
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Bank Target not found' } });
      return;
    }

    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid BankId' } });
      return;
    }
    next(error);
  }
};

export const deleteBankTarget = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.BankTarget WHERE BankTargetId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Bank Target not found' } });
      return;
    }

    res.json({ success: true, message: 'Bank Target deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// EQUITY COMMITMENT CONTROLLER
// ============================================================

export const getAllEquityCommitments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        ec.*, 
        p.ProjectName, 
        ep.PartnerName,
        ep.IMSInvestorProfileId,
        p_rep.FullName AS InvestorRepName,
        p_rep.Email AS InvestorRepEmail,
        p_rep.Phone AS InvestorRepPhone,
        -- If PartnerName looks like an ID (all digits, 6+ chars), try to find actual name via IMS ID
        CASE 
          WHEN ep.PartnerName IS NOT NULL 
               AND ISNUMERIC(ep.PartnerName) = 1
               AND LEN(ep.PartnerName) >= 6
          THEN COALESCE(
            (SELECT TOP 1 ep2.PartnerName 
             FROM core.EquityPartner ep2 
             WHERE ep2.IMSInvestorProfileId = ep.PartnerName
               AND ep2.PartnerName != ep.PartnerName),
            ep.PartnerName
          )
          ELSE ep.PartnerName
        END AS InvestorName,
        (
          SELECT 
            ep2.EquityPartnerId,
            ep2.PartnerName,
            p2.FullName AS InvestorRepName,
            p2.Email AS InvestorRepEmail,
            p2.Phone AS InvestorRepPhone
          FROM banking.EquityCommitmentRelatedParty ecrp
          INNER JOIN core.EquityPartner ep2 ON ecrp.RelatedPartyId = ep2.EquityPartnerId
          LEFT JOIN core.Person p2 ON ep2.InvestorRepId = p2.PersonId
          WHERE ecrp.EquityCommitmentId = ec.EquityCommitmentId
          FOR JSON PATH
        ) AS RelatedParties
      FROM banking.EquityCommitment ec
      LEFT JOIN core.Project p ON ec.ProjectId = p.ProjectId
      LEFT JOIN core.EquityPartner ep ON ec.EquityPartnerId = ep.EquityPartnerId
      LEFT JOIN core.Person p_rep ON ep.InvestorRepId = p_rep.PersonId
      ORDER BY ec.EquityCommitmentId
    `);
    
    // Parse RelatedParties JSON strings
    const commitments = result.recordset.map((row: any) => {
      if (row.RelatedParties) {
        row.RelatedParties = JSON.parse(row.RelatedParties);
      } else {
        row.RelatedParties = [];
      }
      return row;
    });
    
    res.json({ success: true, data: commitments });
  } catch (error) {
    next(error);
  }
};

export const getEquityCommitmentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          ec.*,
          ep.PartnerName,
          p_rep.FullName AS InvestorRepName,
          p_rep.Email AS InvestorRepEmail,
          p_rep.Phone AS InvestorRepPhone,
          (
            SELECT 
              ep2.EquityPartnerId,
              ep2.PartnerName,
              p2.FullName AS InvestorRepName,
              p2.Email AS InvestorRepEmail,
              p2.Phone AS InvestorRepPhone
            FROM banking.EquityCommitmentRelatedParty ecrp
            INNER JOIN core.EquityPartner ep2 ON ecrp.RelatedPartyId = ep2.EquityPartnerId
            LEFT JOIN core.Person p2 ON ep2.InvestorRepId = p2.PersonId
            WHERE ecrp.EquityCommitmentId = ec.EquityCommitmentId
            FOR JSON PATH
          ) AS RelatedParties
        FROM banking.EquityCommitment ec
        LEFT JOIN core.EquityPartner ep ON ec.EquityPartnerId = ep.EquityPartnerId
        LEFT JOIN core.Person p_rep ON ep.InvestorRepId = p_rep.PersonId
        WHERE ec.EquityCommitmentId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Equity Commitment not found' } });
      return;
    }
    
    const commitment = result.recordset[0];
    if (commitment.RelatedParties) {
      commitment.RelatedParties = JSON.parse(commitment.RelatedParties);
    } else {
      commitment.RelatedParties = [];
    }
    
    res.json({ success: true, data: commitment });
  } catch (error) {
    next(error);
  }
};

export const getEquityCommitmentsByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          ec.*,
          ep.PartnerName,
          p_rep.FullName AS InvestorRepName,
          p_rep.Email AS InvestorRepEmail,
          p_rep.Phone AS InvestorRepPhone,
          (
            SELECT 
              ep2.EquityPartnerId,
              ep2.PartnerName,
              p2.FullName AS InvestorRepName,
              p2.Email AS InvestorRepEmail,
              p2.Phone AS InvestorRepPhone
            FROM banking.EquityCommitmentRelatedParty ecrp
            INNER JOIN core.EquityPartner ep2 ON ecrp.RelatedPartyId = ep2.EquityPartnerId
            LEFT JOIN core.Person p2 ON ep2.InvestorRepId = p2.PersonId
            WHERE ecrp.EquityCommitmentId = ec.EquityCommitmentId
            FOR JSON PATH
          ) AS RelatedParties
        FROM banking.EquityCommitment ec
        LEFT JOIN core.EquityPartner ep ON ec.EquityPartnerId = ep.EquityPartnerId
        LEFT JOIN core.Person p_rep ON ep.InvestorRepId = p_rep.PersonId
        WHERE ec.ProjectId = @projectId
        ORDER BY ec.EquityCommitmentId
      `);
    
    const commitments = result.recordset.map((row: any) => {
      if (row.RelatedParties) {
        row.RelatedParties = JSON.parse(row.RelatedParties);
      } else {
        row.RelatedParties = [];
      }
      return row;
    });
    
    res.json({ success: true, data: commitments });
  } catch (error) {
    next(error);
  }
};

export const createEquityCommitment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId, EquityPartnerId, EquityType, LeadPrefGroup,
      FundingDate, Amount, InterestRate, AnnualMonthly,
      BackEndKicker, LastDollar, Notes, RelatedPartyIds, IsPaidOff
    } = req.body;

    if (!ProjectId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId is required' } });
      return;
    }

    // Validate EquityType if provided
    if (EquityType && !['Preferred Equity', 'Common Equity', 'Profits Interest', 'Stoa Loan'].includes(EquityType)) {
      res.status(400).json({ 
        success: false, 
        error: { 
          message: 'EquityType must be one of: Preferred Equity, Common Equity, Profits Interest, Stoa Loan' 
        } 
      });
      return;
    }

    const pool = await getConnection();
    
    // Validate: Individuals cannot have related parties
    if (EquityPartnerId && RelatedPartyIds && Array.isArray(RelatedPartyIds) && RelatedPartyIds.length > 0) {
      const partnerCheck = await pool.request()
        .input('EquityPartnerId', sql.Int, EquityPartnerId)
        .query('SELECT PartnerType FROM core.EquityPartner WHERE EquityPartnerId = @EquityPartnerId');
      
      if (partnerCheck.recordset.length > 0 && partnerCheck.recordset[0].PartnerType === 'Individual') {
        res.status(400).json({ 
          success: false, 
          error: { 
            message: 'Individual equity partners cannot have related parties. Only Entity partners can have related parties.' 
          } 
        });
        return;
      }
    }
    
    const transaction = new sql.Transaction(pool);
    
    try {
      await transaction.begin();
      
      // Create the equity commitment
      const commitmentResult = await new sql.Request(transaction)
        .input('ProjectId', sql.Int, ProjectId)
        .input('EquityPartnerId', sql.Int, EquityPartnerId)
        .input('EquityType', sql.NVarChar, EquityType)
        .input('LeadPrefGroup', sql.NVarChar, LeadPrefGroup)
        .input('FundingDate', sql.Date, FundingDate)
        .input('Amount', sql.Decimal(18, 2), Amount)
        .input('InterestRate', sql.NVarChar, InterestRate)
        .input('AnnualMonthly', sql.NVarChar, AnnualMonthly)
        .input('BackEndKicker', sql.NVarChar, BackEndKicker)
        .input('LastDollar', sql.Bit, LastDollar)
        .input('Notes', sql.NVarChar(sql.MAX), Notes)
        .input('IsPaidOff', sql.Bit, IsPaidOff === true || IsPaidOff === 1 || (typeof IsPaidOff === 'string' && IsPaidOff.toLowerCase() === 'true') ? 1 : 0)
        .query(`
          INSERT INTO banking.EquityCommitment (
            ProjectId, EquityPartnerId, EquityType, LeadPrefGroup,
            FundingDate, Amount, InterestRate, AnnualMonthly,
            BackEndKicker, LastDollar, Notes, IsPaidOff
          )
          OUTPUT INSERTED.*
          VALUES (
            @ProjectId, @EquityPartnerId, @EquityType, @LeadPrefGroup,
            @FundingDate, @Amount, @InterestRate, @AnnualMonthly,
            @BackEndKicker, @LastDollar, @Notes, @IsPaidOff
          )
        `);

      const commitmentId = commitmentResult.recordset[0].EquityCommitmentId;

      // Add related parties if provided
      if (RelatedPartyIds && Array.isArray(RelatedPartyIds) && RelatedPartyIds.length > 0) {
        for (const relatedPartyId of RelatedPartyIds) {
          if (relatedPartyId && relatedPartyId !== EquityPartnerId) { // Don't add the lead investor as a related party
            await new sql.Request(transaction)
              .input('EquityCommitmentId', sql.Int, commitmentId)
              .input('RelatedPartyId', sql.Int, relatedPartyId)
              .query(`
                INSERT INTO banking.EquityCommitmentRelatedParty (EquityCommitmentId, RelatedPartyId)
                VALUES (@EquityCommitmentId, @RelatedPartyId)
              `);
          }
        }
      }

      await transaction.commit();

      // Fetch the complete commitment with related parties
      const finalResult = await pool.request()
        .input('id', sql.Int, commitmentId)
        .query(`
          SELECT 
            ec.*,
            (
              SELECT 
                ep.EquityPartnerId,
                ep.PartnerName,
                p.FullName AS InvestorRepName,
                p.Email AS InvestorRepEmail,
                p.Phone AS InvestorRepPhone
              FROM banking.EquityCommitmentRelatedParty ecrp
              INNER JOIN core.EquityPartner ep ON ecrp.RelatedPartyId = ep.EquityPartnerId
              LEFT JOIN core.Person p ON ep.InvestorRepId = p.PersonId
              WHERE ecrp.EquityCommitmentId = ec.EquityCommitmentId
              FOR JSON PATH
            ) AS RelatedParties
          FROM banking.EquityCommitment ec
          WHERE ec.EquityCommitmentId = @id
        `);

      const commitment = finalResult.recordset[0];
      if (commitment.RelatedParties) {
        commitment.RelatedParties = JSON.parse(commitment.RelatedParties);
      } else {
        commitment.RelatedParties = [];
      }

      res.status(201).json({ success: true, data: commitment });
    } catch (error: any) {
      await transaction.rollback();
      throw error;
    }
  } catch (error: any) {
    if (error.number === 547) {
      if (error.message.includes('CK_EquityCommitment_EquityType')) {
        res.status(400).json({ 
          success: false, 
          error: { 
            message: 'EquityType must be one of: Preferred Equity, Common Equity, Profits Interest, Stoa Loan' 
          } 
        });
        return;
      }
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or EquityPartnerId' } });
      return;
    }
    next(error);
  }
};

export const updateEquityCommitment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      ProjectId, EquityPartnerId, EquityType, LeadPrefGroup,
      FundingDate, Amount, InterestRate, AnnualMonthly,
      BackEndKicker, LastDollar, Notes, RelatedPartyIds, IsPaidOff
    } = req.body;

    // Validate EquityType if provided
    if (EquityType && !['Preferred Equity', 'Common Equity', 'Profits Interest', 'Stoa Loan'].includes(EquityType)) {
      res.status(400).json({ 
        success: false, 
        error: { 
          message: 'EquityType must be one of: Preferred Equity, Common Equity, Profits Interest, Stoa Loan' 
        } 
      });
      return;
    }

    const pool = await getConnection();
    
    // Validate: Individuals cannot have related parties
    // Get current EquityPartnerId if not being updated
    let finalEquityPartnerId = EquityPartnerId;
    if (!finalEquityPartnerId) {
      const currentCommitment = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT EquityPartnerId FROM banking.EquityCommitment WHERE EquityCommitmentId = @id');
      
      if (currentCommitment.recordset.length > 0) {
        finalEquityPartnerId = currentCommitment.recordset[0].EquityPartnerId;
      }
    }
    
    if (finalEquityPartnerId && RelatedPartyIds !== undefined && Array.isArray(RelatedPartyIds) && RelatedPartyIds.length > 0) {
      const partnerCheck = await pool.request()
        .input('EquityPartnerId', sql.Int, finalEquityPartnerId)
        .query('SELECT PartnerType FROM core.EquityPartner WHERE EquityPartnerId = @EquityPartnerId');
      
      if (partnerCheck.recordset.length > 0 && partnerCheck.recordset[0].PartnerType === 'Individual') {
        res.status(400).json({ 
          success: false, 
          error: { 
            message: 'Individual equity partners cannot have related parties. Only Entity partners can have related parties.' 
          } 
        });
        return;
      }
    }
    
    const transaction = new sql.Transaction(pool);
    
    try {
      await transaction.begin();
      
      // Build dynamic UPDATE query (only update fields that are provided)
      const updateFields: string[] = [];
      const request = new sql.Request(transaction).input('id', sql.Int, id);

      if (ProjectId !== undefined) {
        updateFields.push('ProjectId = @ProjectId');
        request.input('ProjectId', sql.Int, ProjectId);
      }
      if (EquityPartnerId !== undefined) {
        updateFields.push('EquityPartnerId = @EquityPartnerId');
        request.input('EquityPartnerId', sql.Int, EquityPartnerId);
      }
      if (EquityType !== undefined) {
        updateFields.push('EquityType = @EquityType');
        request.input('EquityType', sql.NVarChar, EquityType);
      }
      if (LeadPrefGroup !== undefined) {
        updateFields.push('LeadPrefGroup = @LeadPrefGroup');
        request.input('LeadPrefGroup', sql.NVarChar, LeadPrefGroup);
      }
      if (FundingDate !== undefined) {
        updateFields.push('FundingDate = @FundingDate');
        request.input('FundingDate', sql.Date, FundingDate);
      }
      if (Amount !== undefined) {
        updateFields.push('Amount = @Amount');
        request.input('Amount', sql.Decimal(18, 2), Amount);
      }
      if (InterestRate !== undefined) {
        updateFields.push('InterestRate = @InterestRate');
        request.input('InterestRate', sql.NVarChar, InterestRate);
      }
      if (AnnualMonthly !== undefined) {
        updateFields.push('AnnualMonthly = @AnnualMonthly');
        request.input('AnnualMonthly', sql.NVarChar, AnnualMonthly);
      }
      if (BackEndKicker !== undefined) {
        updateFields.push('BackEndKicker = @BackEndKicker');
        request.input('BackEndKicker', sql.NVarChar, BackEndKicker);
      }
      if (LastDollar !== undefined) {
        updateFields.push('LastDollar = @LastDollar');
        request.input('LastDollar', sql.Bit, LastDollar);
      }
      if (Notes !== undefined) {
        updateFields.push('Notes = @Notes');
        request.input('Notes', sql.NVarChar(sql.MAX), Notes);
      }
      if (IsPaidOff !== undefined) {
        updateFields.push('IsPaidOff = @IsPaidOff');
        request.input('IsPaidOff', sql.Bit, IsPaidOff === true || IsPaidOff === 1 || (typeof IsPaidOff === 'string' && IsPaidOff.toLowerCase() === 'true') ? 1 : 0);
      }

      if (updateFields.length === 0) {
        await transaction.rollback();
        res.status(400).json({ success: false, error: { message: 'No fields provided to update' } });
        return;
      }

      const updateQuery = `
        UPDATE banking.EquityCommitment
        SET ${updateFields.join(', ')}
        WHERE EquityCommitmentId = @id
      `;

      const updateResult = await request.query(updateQuery);

      if (updateResult.rowsAffected[0] === 0) {
        await transaction.rollback();
        res.status(404).json({ success: false, error: { message: 'Equity Commitment not found' } });
        return;
      }

      // Update related parties if provided
      if (RelatedPartyIds !== undefined) {
        // Delete existing related parties
        await new sql.Request(transaction)
          .input('EquityCommitmentId', sql.Int, id)
          .query('DELETE FROM banking.EquityCommitmentRelatedParty WHERE EquityCommitmentId = @EquityCommitmentId');

        // Add new related parties
        if (Array.isArray(RelatedPartyIds) && RelatedPartyIds.length > 0) {
          for (const relatedPartyId of RelatedPartyIds) {
            if (relatedPartyId && relatedPartyId !== EquityPartnerId) { // Don't add the lead investor as a related party
              await new sql.Request(transaction)
                .input('EquityCommitmentId', sql.Int, id)
                .input('RelatedPartyId', sql.Int, relatedPartyId)
                .query(`
                  INSERT INTO banking.EquityCommitmentRelatedParty (EquityCommitmentId, RelatedPartyId)
                  VALUES (@EquityCommitmentId, @RelatedPartyId)
                `);
            }
          }
        }
      }

      await transaction.commit();

      // Fetch the complete commitment with related parties
      const finalResult = await pool.request()
        .input('id', sql.Int, id)
        .query(`
          SELECT 
            ec.*,
            ep.PartnerName,
            p_rep.FullName AS InvestorRepName,
            p_rep.Email AS InvestorRepEmail,
            p_rep.Phone AS InvestorRepPhone,
            (
              SELECT 
                ep2.EquityPartnerId,
                ep2.PartnerName,
                p2.FullName AS InvestorRepName,
                p2.Email AS InvestorRepEmail,
                p2.Phone AS InvestorRepPhone
              FROM banking.EquityCommitmentRelatedParty ecrp
              INNER JOIN core.EquityPartner ep2 ON ecrp.RelatedPartyId = ep2.EquityPartnerId
              LEFT JOIN core.Person p2 ON ep2.InvestorRepId = p2.PersonId
              WHERE ecrp.EquityCommitmentId = ec.EquityCommitmentId
              FOR JSON PATH
            ) AS RelatedParties
          FROM banking.EquityCommitment ec
          LEFT JOIN core.EquityPartner ep ON ec.EquityPartnerId = ep.EquityPartnerId
          LEFT JOIN core.Person p_rep ON ep.InvestorRepId = p_rep.PersonId
          WHERE ec.EquityCommitmentId = @id
        `);

      const commitment = finalResult.recordset[0];
      if (commitment.RelatedParties) {
        commitment.RelatedParties = JSON.parse(commitment.RelatedParties);
      } else {
        commitment.RelatedParties = [];
      }

      res.json({ success: true, data: commitment });
    } catch (error: any) {
      await transaction.rollback();
      throw error;
    }
  } catch (error: any) {
    if (error.number === 547) {
      if (error.message.includes('CK_EquityCommitment_EquityType')) {
        res.status(400).json({ 
          success: false, 
          error: { 
            message: 'EquityType must be one of: Preferred Equity, Common Equity, Profits Interest, Stoa Loan' 
          } 
        });
        return;
      }
      // Provide more specific error messages for foreign key violations
      let errorMessage = 'Invalid foreign key reference';
      if (error.message.includes('FK_Equity_Project')) {
        errorMessage = 'Invalid ProjectId: Project does not exist';
      } else if (error.message.includes('FK_Equity_Partner')) {
        errorMessage = 'Invalid EquityPartnerId: Equity Partner does not exist';
      } else if (error.message.includes('FK_EquityCommitmentRelatedParty_Partner')) {
        errorMessage = 'Invalid RelatedPartyId: One or more Related Party IDs do not exist';
      }
      res.status(400).json({ success: false, error: { message: errorMessage } });
      return;
    }
    next(error);
  }
};

export const deleteEquityCommitment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.EquityCommitment WHERE EquityCommitmentId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Equity Commitment not found' } });
      return;
    }

    res.json({ success: true, message: 'Equity Commitment deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// EQUITY COMMITMENT RELATED PARTIES CONTROLLER
// ============================================================

export const getRelatedPartiesByCommitment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { commitmentId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('commitmentId', sql.Int, commitmentId)
      .query(`
        SELECT 
          ecrp.EquityCommitmentRelatedPartyId,
          ecrp.EquityCommitmentId,
          ep.EquityPartnerId,
          ep.PartnerName,
          p.FullName AS InvestorRepName,
          p.Email AS InvestorRepEmail,
          p.Phone AS InvestorRepPhone,
          ep.IMSInvestorProfileId
        FROM banking.EquityCommitmentRelatedParty ecrp
        INNER JOIN core.EquityPartner ep ON ecrp.RelatedPartyId = ep.EquityPartnerId
        LEFT JOIN core.Person p ON ep.InvestorRepId = p.PersonId
        WHERE ecrp.EquityCommitmentId = @commitmentId
        ORDER BY ep.PartnerName
      `);
    
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const addRelatedParty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { commitmentId } = req.params;
    const { RelatedPartyId } = req.body;

    if (!RelatedPartyId) {
      res.status(400).json({ success: false, error: { message: 'RelatedPartyId is required' } });
      return;
    }

    const pool = await getConnection();
    
    // Check that the related party is not the lead investor
    const commitmentCheck = await pool.request()
      .input('commitmentId', sql.Int, commitmentId)
      .query('SELECT EquityPartnerId FROM banking.EquityCommitment WHERE EquityCommitmentId = @commitmentId');
    
    if (commitmentCheck.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Equity Commitment not found' } });
      return;
    }
    
    const leadInvestorId = commitmentCheck.recordset[0].EquityPartnerId;
    if (RelatedPartyId === leadInvestorId) {
      res.status(400).json({ success: false, error: { message: 'Cannot add lead investor as a related party' } });
      return;
    }

    const result = await pool.request()
      .input('EquityCommitmentId', sql.Int, commitmentId)
      .input('RelatedPartyId', sql.Int, RelatedPartyId)
      .query(`
        INSERT INTO banking.EquityCommitmentRelatedParty (EquityCommitmentId, RelatedPartyId)
        OUTPUT INSERTED.*
        VALUES (@EquityCommitmentId, @RelatedPartyId)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'This related party is already associated with this commitment' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid EquityCommitmentId or RelatedPartyId' } });
      return;
    }
    next(error);
  }
};

export const removeRelatedParty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { commitmentId, relatedPartyId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('commitmentId', sql.Int, commitmentId)
      .input('relatedPartyId', sql.Int, relatedPartyId)
      .query(`
        DELETE FROM banking.EquityCommitmentRelatedParty
        WHERE EquityCommitmentId = @commitmentId AND RelatedPartyId = @relatedPartyId
      `);

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Related party not found for this commitment' } });
      return;
    }

    res.json({ success: true, message: 'Related party removed successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// LOAN PROCEEDS CONTROLLER (Additional Draws/Disbursements)
// ============================================================

export const getAllLoanProceeds = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        lp.*,
        p.ProjectName,
        l.LoanType,
        l.LoanPhase
      FROM banking.LoanProceeds lp
      LEFT JOIN core.Project p ON lp.ProjectId = p.ProjectId
      LEFT JOIN banking.Loan l ON lp.LoanId = l.LoanId
      ORDER BY lp.ProceedsDate DESC, lp.LoanProceedsId DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getLoanProceedsById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          lp.*,
          p.ProjectName,
          l.LoanType,
          l.LoanPhase
        FROM banking.LoanProceeds lp
        LEFT JOIN core.Project p ON lp.ProjectId = p.ProjectId
        LEFT JOIN banking.Loan l ON lp.LoanId = l.LoanId
        WHERE lp.LoanProceedsId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'LoanProceeds not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getLoanProceedsByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          lp.*,
          l.LoanType,
          l.LoanPhase
        FROM banking.LoanProceeds lp
        LEFT JOIN banking.Loan l ON lp.LoanId = l.LoanId
        WHERE lp.ProjectId = @projectId
        ORDER BY lp.ProceedsDate DESC, lp.LoanProceedsId DESC
      `);
    
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getLoanProceedsByLoan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { loanId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('loanId', sql.Int, loanId)
      .query(`
        SELECT 
          lp.*,
          p.ProjectName
        FROM banking.LoanProceeds lp
        LEFT JOIN core.Project p ON lp.ProjectId = p.ProjectId
        WHERE lp.LoanId = @loanId
        ORDER BY lp.ProceedsDate DESC, lp.LoanProceedsId DESC
      `);
    
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createLoanProceeds = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId, LoanId, FinancingType, ProceedsDate, ProceedsAmount, CumulativeAmount,
      DrawNumber, DrawDescription, Notes
    } = req.body;

    if (!ProjectId || !ProceedsDate || !ProceedsAmount) {
      res.status(400).json({ success: false, error: { message: 'ProjectId, ProceedsDate, and ProceedsAmount are required' } });
      return;
    }

    // Validate FinancingType
    if (FinancingType && FinancingType !== 'Construction' && FinancingType !== 'Permanent') {
      res.status(400).json({ success: false, error: { message: 'FinancingType must be "Construction" or "Permanent"' } });
      return;
    }

    // Default to Construction if not provided
    const finalFinancingType = FinancingType || 'Construction';

    const pool = await getConnection();
    const request = pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('FinancingType', sql.NVarChar, finalFinancingType)
      .input('ProceedsDate', sql.Date, ProceedsDate)
      .input('ProceedsAmount', sql.Decimal(18, 2), ProceedsAmount)
      .input('CumulativeAmount', sql.Decimal(18, 2), CumulativeAmount)
      .input('DrawNumber', sql.Int, DrawNumber)
      .input('DrawDescription', sql.NVarChar, DrawDescription)
      .input('Notes', sql.NVarChar(sql.MAX), Notes);

    // Insert without OUTPUT clause (triggers prevent OUTPUT INSERTED.*)
    await request.query(`
      INSERT INTO banking.LoanProceeds (
        ProjectId, LoanId, FinancingType, ProceedsDate, ProceedsAmount, CumulativeAmount,
        DrawNumber, DrawDescription, Notes
      )
      VALUES (
        @ProjectId, @LoanId, @FinancingType, @ProceedsDate, @ProceedsAmount, @CumulativeAmount,
        @DrawNumber, @DrawDescription, @Notes
      )
    `);

    // Get the inserted record
    const result = await pool.request()
      .input('projectId', sql.Int, ProjectId)
      .input('proceedsDate', sql.Date, ProceedsDate)
      .input('financingType', sql.NVarChar, finalFinancingType)
      .query(`
        SELECT TOP 1 * FROM banking.LoanProceeds 
        WHERE ProjectId = @projectId AND ProceedsDate = @proceedsDate AND FinancingType = @financingType
        ORDER BY LoanProceedsId DESC
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or LoanId' } });
      return;
    }
    next(error);
  }
};

export const updateLoanProceeds = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      ProjectId, LoanId, ProceedsDate, ProceedsAmount, CumulativeAmount,
      DrawNumber, DrawDescription, Notes
    } = req.body;

    const pool = await getConnection();
    
    // Build dynamic update query
    const updates: string[] = [];
    const request = pool.request().input('id', sql.Int, id);

    if (ProjectId !== undefined) {
      updates.push('ProjectId = @ProjectId');
      request.input('ProjectId', sql.Int, ProjectId);
    }
    if (LoanId !== undefined) {
      updates.push('LoanId = @LoanId');
      request.input('LoanId', sql.Int, LoanId);
    }
    if (ProceedsDate !== undefined) {
      updates.push('ProceedsDate = @ProceedsDate');
      request.input('ProceedsDate', sql.Date, ProceedsDate);
    }
    if (ProceedsAmount !== undefined) {
      updates.push('ProceedsAmount = @ProceedsAmount');
      request.input('ProceedsAmount', sql.Decimal(18, 2), ProceedsAmount);
    }
    if (CumulativeAmount !== undefined) {
      updates.push('CumulativeAmount = @CumulativeAmount');
      request.input('CumulativeAmount', sql.Decimal(18, 2), CumulativeAmount);
    }
    if (DrawNumber !== undefined) {
      updates.push('DrawNumber = @DrawNumber');
      request.input('DrawNumber', sql.Int, DrawNumber);
    }
    if (DrawDescription !== undefined) {
      updates.push('DrawDescription = @DrawDescription');
      request.input('DrawDescription', sql.NVarChar, DrawDescription);
    }
    if (Notes !== undefined) {
      updates.push('Notes = @Notes');
      request.input('Notes', sql.NVarChar(sql.MAX), Notes);
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    const result = await request.query(`
      UPDATE banking.LoanProceeds
      SET ${updates.join(', ')}
      OUTPUT INSERTED.*
      WHERE LoanProceedsId = @id
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'LoanProceeds not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or LoanId' } });
      return;
    }
    next(error);
  }
};

export const deleteLoanProceeds = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.LoanProceeds WHERE LoanProceedsId = @id');
    
    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'LoanProceeds not found' } });
      return;
    }
    
    res.json({ success: true, message: 'LoanProceeds deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GUARANTEE BURNDOWN CONTROLLER
// ============================================================

export const getAllGuaranteeBurndowns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        gb.*,
        p.ProjectName,
        per.FullName AS GuarantorName,
        l.LoanType,
        l.LoanPhase
      FROM banking.GuaranteeBurndown gb
      LEFT JOIN core.Project p ON gb.ProjectId = p.ProjectId
      LEFT JOIN core.Person per ON gb.PersonId = per.PersonId
      LEFT JOIN banking.Loan l ON gb.LoanId = l.LoanId
      ORDER BY gb.BurndownDate DESC, gb.GuaranteeBurndownId DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getGuaranteeBurndownById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          gb.*,
          p.ProjectName,
          per.FullName AS GuarantorName,
          l.LoanType,
          l.LoanPhase
        FROM banking.GuaranteeBurndown gb
        LEFT JOIN core.Project p ON gb.ProjectId = p.ProjectId
        LEFT JOIN core.Person per ON gb.PersonId = per.PersonId
        LEFT JOIN banking.Loan l ON gb.LoanId = l.LoanId
        WHERE gb.GuaranteeBurndownId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'GuaranteeBurndown not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getGuaranteeBurndownsByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          gb.*,
          per.FullName AS GuarantorName,
          l.LoanType,
          l.LoanPhase
        FROM banking.GuaranteeBurndown gb
        LEFT JOIN core.Person per ON gb.PersonId = per.PersonId
        LEFT JOIN banking.Loan l ON gb.LoanId = l.LoanId
        WHERE gb.ProjectId = @projectId
        ORDER BY gb.BurndownDate DESC, gb.GuaranteeBurndownId DESC
      `);
    
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getGuaranteeBurndownsByPerson = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { personId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('personId', sql.Int, personId)
      .query(`
        SELECT 
          gb.*,
          p.ProjectName,
          l.LoanType,
          l.LoanPhase
        FROM banking.GuaranteeBurndown gb
        LEFT JOIN core.Project p ON gb.ProjectId = p.ProjectId
        LEFT JOIN banking.Loan l ON gb.LoanId = l.LoanId
        WHERE gb.PersonId = @personId
        ORDER BY gb.BurndownDate DESC, gb.GuaranteeBurndownId DESC
      `);
    
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createGuaranteeBurndown = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId, LoanId, FinancingType, PersonId, BurndownDate, PreviousAmount, NewAmount,
      ReductionAmount, PreviousPercent, NewPercent, BurndownReason, TriggeredBy, Notes
    } = req.body;

    if (!ProjectId || !PersonId || !BurndownDate || NewAmount === undefined) {
      res.status(400).json({ success: false, error: { message: 'ProjectId, PersonId, BurndownDate, and NewAmount are required' } });
      return;
    }

    // Validate FinancingType
    if (FinancingType && FinancingType !== 'Construction' && FinancingType !== 'Permanent') {
      res.status(400).json({ success: false, error: { message: 'FinancingType must be "Construction" or "Permanent"' } });
      return;
    }

    // Default to Construction if not provided
    const finalFinancingType = FinancingType || 'Construction';

    // Calculate ReductionAmount if not provided
    const calculatedReductionAmount = ReductionAmount !== undefined 
      ? ReductionAmount 
      : (PreviousAmount !== undefined && PreviousAmount !== null) 
        ? PreviousAmount - NewAmount 
        : null;

    const pool = await getConnection();
    const request = pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('FinancingType', sql.NVarChar, finalFinancingType)
      .input('PersonId', sql.Int, PersonId)
      .input('BurndownDate', sql.Date, BurndownDate)
      .input('PreviousAmount', sql.Decimal(18, 2), PreviousAmount)
      .input('NewAmount', sql.Decimal(18, 2), NewAmount)
      .input('ReductionAmount', sql.Decimal(18, 2), calculatedReductionAmount)
      .input('PreviousPercent', sql.Decimal(10, 4), PreviousPercent)
      .input('NewPercent', sql.Decimal(10, 4), NewPercent)
      .input('BurndownReason', sql.NVarChar, BurndownReason)
      .input('TriggeredBy', sql.NVarChar, TriggeredBy)
      .input('Notes', sql.NVarChar(sql.MAX), Notes);

    // Insert without OUTPUT clause (triggers prevent OUTPUT INSERTED.*)
    await request.query(`
      INSERT INTO banking.GuaranteeBurndown (
        ProjectId, LoanId, FinancingType, PersonId, BurndownDate, PreviousAmount, NewAmount,
        ReductionAmount, PreviousPercent, NewPercent, BurndownReason, TriggeredBy, Notes
      )
      VALUES (
        @ProjectId, @LoanId, @FinancingType, @PersonId, @BurndownDate, @PreviousAmount, @NewAmount,
        @ReductionAmount, @PreviousPercent, @NewPercent, @BurndownReason, @TriggeredBy, @Notes
      )
    `);

    // Get the inserted record
    const result = await pool.request()
      .input('projectId', sql.Int, ProjectId)
      .input('personId', sql.Int, PersonId)
      .input('burndownDate', sql.Date, BurndownDate)
      .input('financingType', sql.NVarChar, finalFinancingType)
      .query(`
        SELECT TOP 1 * FROM banking.GuaranteeBurndown 
        WHERE ProjectId = @projectId AND PersonId = @personId AND BurndownDate = @burndownDate AND FinancingType = @financingType
        ORDER BY GuaranteeBurndownId DESC
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId, LoanId, or PersonId' } });
      return;
    }
    next(error);
  }
};

export const updateGuaranteeBurndown = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      ProjectId, LoanId, PersonId, BurndownDate, PreviousAmount, NewAmount,
      ReductionAmount, PreviousPercent, NewPercent, BurndownReason, TriggeredBy, Notes
    } = req.body;

    const pool = await getConnection();
    
    // Build dynamic update query
    const updates: string[] = [];
    const request = pool.request().input('id', sql.Int, id);

    if (ProjectId !== undefined) {
      updates.push('ProjectId = @ProjectId');
      request.input('ProjectId', sql.Int, ProjectId);
    }
    if (LoanId !== undefined) {
      updates.push('LoanId = @LoanId');
      request.input('LoanId', sql.Int, LoanId);
    }
    if (PersonId !== undefined) {
      updates.push('PersonId = @PersonId');
      request.input('PersonId', sql.Int, PersonId);
    }
    if (BurndownDate !== undefined) {
      updates.push('BurndownDate = @BurndownDate');
      request.input('BurndownDate', sql.Date, BurndownDate);
    }
    if (PreviousAmount !== undefined) {
      updates.push('PreviousAmount = @PreviousAmount');
      request.input('PreviousAmount', sql.Decimal(18, 2), PreviousAmount);
    }
    if (NewAmount !== undefined) {
      updates.push('NewAmount = @NewAmount');
      request.input('NewAmount', sql.Decimal(18, 2), NewAmount);
    }
    if (ReductionAmount !== undefined) {
      updates.push('ReductionAmount = @ReductionAmount');
      request.input('ReductionAmount', sql.Decimal(18, 2), ReductionAmount);
    }
    if (PreviousPercent !== undefined) {
      updates.push('PreviousPercent = @PreviousPercent');
      request.input('PreviousPercent', sql.Decimal(10, 4), PreviousPercent);
    }
    if (NewPercent !== undefined) {
      updates.push('NewPercent = @NewPercent');
      request.input('NewPercent', sql.Decimal(10, 4), NewPercent);
    }
    if (BurndownReason !== undefined) {
      updates.push('BurndownReason = @BurndownReason');
      request.input('BurndownReason', sql.NVarChar, BurndownReason);
    }
    if (TriggeredBy !== undefined) {
      updates.push('TriggeredBy = @TriggeredBy');
      request.input('TriggeredBy', sql.NVarChar, TriggeredBy);
    }
    if (Notes !== undefined) {
      updates.push('Notes = @Notes');
      request.input('Notes', sql.NVarChar(sql.MAX), Notes);
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    const result = await request.query(`
      UPDATE banking.GuaranteeBurndown
      SET ${updates.join(', ')}
      OUTPUT INSERTED.*
      WHERE GuaranteeBurndownId = @id
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'GuaranteeBurndown not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId, LoanId, or PersonId' } });
      return;
    }
    next(error);
  }
};

export const deleteGuaranteeBurndown = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.GuaranteeBurndown WHERE GuaranteeBurndownId = @id');
    
    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'GuaranteeBurndown not found' } });
      return;
    }
    
    res.json({ success: true, message: 'GuaranteeBurndown deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// BANKING FILES (per-project file uploads for Banking Dashboard)
// ============================================================

export const listBankingFiles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid project id' } });
      return;
    }
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT BankingFileId, ProjectId, FileName, ContentType, FileSizeBytes, Section, CreatedAt
        FROM banking.BankingFile
        WHERE ProjectId = @projectId
        ORDER BY Section, CreatedAt DESC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

/** Allowed Section values: Banking (Load docs, Underwriting) + Land Development (Land, Design and Permits, Comp Validation, Contractor, Legal, Underwriting). */
const BANKING_FILE_SECTIONS = [
  'Load docs',
  'Underwriting',
  'Land',
  'Design and Permits',
  'Comp Validation',
  'Contractor',
  'Legal',
] as const;

export const uploadBankingFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid project id' } });
      return;
    }
    const file = (req as Request & {
      file?: { path?: string; buffer?: Buffer; originalname?: string; mimetype?: string; size?: number };
    }).file;
    if (!file || (!file.path && !file.buffer)) {
      res.status(400).json({ success: false, error: { message: 'No file uploaded; use multipart field "file"' } });
      return;
    }
    const rawSection = (req.body && (req.body as { section?: string }).section) ?? null;
    const section: string | null =
      rawSection === '' || rawSection === undefined || rawSection === null
        ? null
        : String(rawSection).trim();
    if (section !== null && !BANKING_FILE_SECTIONS.includes(section as (typeof BANKING_FILE_SECTIONS)[number])) {
      res.status(400).json({
        success: false,
        error: {
          message: `Invalid section. Allowed: ${BANKING_FILE_SECTIONS.join(', ')}`,
        },
      });
      return;
    }
    const pool = await getConnection();
    const exists = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT 1 FROM core.Project WHERE ProjectId = @projectId');
    if (exists.recordset.length === 0) {
      try { if (file.path) fs.unlinkSync(file.path); } catch (_) {}
      res.status(404).json({ success: false, error: { message: 'Project not found' } });
      return;
    }
    let storagePath: string;
    const fileName = file.originalname || (file.path ? path.basename(file.path) : 'file');
    const contentType = file.mimetype || null;
    const fileSize = file.size ?? (file.buffer ? file.buffer.length : null);
    if (isBlobStorageConfigured() && file.buffer) {
      storagePath = buildBankingFileStoragePath(projectId, fileName);
      await uploadBufferToBlob(storagePath, file.buffer, contentType || undefined);
      if (!(await blobExists(storagePath))) {
        throw new Error('Upload to Azure succeeded but blob was not found; not saving record.');
      }
    } else if (file.path) {
      storagePath = getRelativeStoragePath(file.path);
    } else {
      res.status(500).json({ success: false, error: { message: 'Azure Blob configured but file buffer missing' } });
      return;
    }
    const result = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('FileName', sql.NVarChar(255), fileName)
      .input('StoragePath', sql.NVarChar(1000), storagePath)
      .input('ContentType', sql.NVarChar(100), contentType)
      .input('FileSizeBytes', sql.BigInt, fileSize)
      .input('Section', sql.NVarChar(80), section)
      .query(`
        INSERT INTO banking.BankingFile (ProjectId, FileName, StoragePath, ContentType, FileSizeBytes, Section)
        OUTPUT INSERTED.BankingFileId, INSERTED.ProjectId, INSERTED.FileName, INSERTED.ContentType, INSERTED.FileSizeBytes, INSERTED.Section, INSERTED.CreatedAt
        VALUES (@ProjectId, @FileName, @StoragePath, @ContentType, @FileSizeBytes, @Section)
      `);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const downloadBankingFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const attachmentId = req.params.attachmentId;
    const id = parseInt(attachmentId, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid attachment id' } });
      return;
    }
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT FileName, StoragePath, ContentType FROM banking.BankingFile WHERE BankingFileId = @id');
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'File not found' } });
      return;
    }
    const row = result.recordset[0];
    if (isBlobStorageConfigured()) {
      const buffer = await downloadBlobToBuffer(row.StoragePath);
      if (buffer && buffer.length > 0) {
        res.setHeader('Content-Type', row.ContentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.FileName)}"`);
        res.send(buffer);
        return;
      }
    }
    const fullPath = getFullPath(row.StoragePath);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({
        success: false,
        error: {
          message: 'File not found on server',
          detail: isBlobStorageConfigured()
            ? 'Record exists but file was not found in Azure Blob.'
            : 'Record exists but file is missing on disk.',
        },
      });
      return;
    }
    res.setHeader('Content-Type', row.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.FileName)}"`);
    res.sendFile(path.resolve(fullPath));
  } catch (error) {
    next(error);
  }
};

export const deleteBankingFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const attachmentId = req.params.attachmentId;
    const id = parseInt(attachmentId, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid attachment id' } });
      return;
    }
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT StoragePath FROM banking.BankingFile WHERE BankingFileId = @id');
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'File not found' } });
      return;
    }
    const storagePath = result.recordset[0].StoragePath;
    await pool.request().input('id', sql.Int, id).query('DELETE FROM banking.BankingFile WHERE BankingFileId = @id');
    if (isBlobStorageConfigured()) {
      await deleteBlobFile(storagePath);
    }
    try {
      const fullPath = getFullPath(storagePath);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (_) {}
    res.json({ success: true, message: 'File deleted' });
  } catch (error) {
    next(error);
  }
};
