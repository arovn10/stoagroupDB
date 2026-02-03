import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import { getConnection } from '../config/database';
import { buildSelectQuery, buildInsertQuery, buildUpdateQuery, buildDeleteQuery } from '../utils/queryBuilder';
import { normalizeState, normalizeStateInPayload } from '../utils/stateAbbrev';

// ============================================================
// PROJECT CONTROLLER
// ============================================================

export const getAllProjects = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        ProjectId, ProjectName, City, State, Region, Address, Units,
        ProductType, Stage, EstimatedConstructionStartDate,
        CreatedAt, UpdatedAt
      FROM core.Project 
      ORDER BY ProjectName
    `);
    res.json({ success: true, data: normalizeStateInPayload(result.recordset) });
  } catch (error) {
    next(error);
  }
};

export const getProjectById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          ProjectId, ProjectName, City, State, Region, Address, Units,
          ProductType, Stage, EstimatedConstructionStartDate,
          CreatedAt, UpdatedAt
        FROM core.Project 
        WHERE ProjectId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Project not found' } });
      return;
    }
    
    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error) {
    next(error);
  }
};

export const createProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectName, City, State, Region, Address, Units,
      ProductType, Stage, EstimatedConstructionStartDate
    } = req.body;

    if (!ProjectName) {
      res.status(400).json({ success: false, error: { message: 'ProjectName is required' } });
      return;
    }

    const pool = await getConnection();
    const insertResult = await pool.request()
      .input('ProjectName', sql.NVarChar, ProjectName)
      .input('City', sql.NVarChar, City)
      .input('State', sql.NVarChar, normalizeState(State))
      .input('Region', sql.NVarChar, Region)
      .input('Address', sql.NVarChar(500), Address)
      .input('Units', sql.Int, Units)
      .input('ProductType', sql.NVarChar, ProductType)
      .input('Stage', sql.NVarChar, Stage)
      .input('EstimatedConstructionStartDate', sql.Date, EstimatedConstructionStartDate)
      .query(`
        INSERT INTO core.Project (ProjectName, City, State, Region, Address, Units, ProductType, Stage, EstimatedConstructionStartDate)
        VALUES (@ProjectName, @City, @State, @Region, @Address, @Units, @ProductType, @Stage, @EstimatedConstructionStartDate);
        SELECT SCOPE_IDENTITY() AS ProjectId;
      `);

    const projectId = insertResult.recordset[0].ProjectId;
    
    const result = await pool.request()
      .input('id', sql.Int, projectId)
      .query(`
        SELECT 
          ProjectId, ProjectName, City, State, Region, Address, Units,
          ProductType, Stage, EstimatedConstructionStartDate,
          CreatedAt, UpdatedAt
        FROM core.Project 
        WHERE ProjectId = @id
      `);

    res.status(201).json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error: any) {
    if (error.number === 2627) { // Unique constraint violation
      res.status(409).json({ success: false, error: { message: 'Project with this name already exists' } });
      return;
    }
    next(error);
  }
};

export const updateProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const projectData = req.body;

    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);

    // Build dynamic update query - only update fields that are provided
    // Filter out Location column (removed from schema - use City, State, Region, Address instead)
    const fields: string[] = [];
    Object.keys(projectData).forEach((key) => {
      if (key !== 'ProjectId' && key !== 'Location' && projectData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'Units') {
          request.input(key, sql.Int, projectData[key]);
        } else if (key === 'EstimatedConstructionStartDate') {
          request.input(key, sql.Date, projectData[key]);
        } else if (key === 'State') {
          request.input(key, sql.NVarChar, normalizeState(projectData[key]));
        } else {
          request.input(key, sql.NVarChar, projectData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    fields.push('UpdatedAt = SYSDATETIME()');

    const result = await request.query(`
      UPDATE core.Project
      SET ${fields.join(', ')}
      WHERE ProjectId = @id
    `);

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Project not found' } });
      return;
    }

    // Get the updated record - explicitly list columns to avoid Location column issues
    const updated = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          ProjectId, ProjectName, City, State, Region, Address, Units,
          ProductType, Stage, EstimatedConstructionStartDate,
          CreatedAt, UpdatedAt
        FROM core.Project 
        WHERE ProjectId = @id
      `);

    res.json({ success: true, data: normalizeStateInPayload(updated.recordset[0]) });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Project with this name already exists' } });
      return;
    }
    next(error);
  }
};

export const deleteProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  let transaction: sql.Transaction | null = null;
  
  try {
    const { id } = req.params;
    const pool = await getConnection();
    
    // First verify project exists
    const checkProject = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT ProjectId, ProjectName FROM core.Project WHERE ProjectId = @id');
    
    if (checkProject.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Project not found' } });
      return;
    }
    
    const projectName = checkProject.recordset[0].ProjectName;
    
    // Begin transaction for atomic deletion
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    const request = new sql.Request(transaction);
    request.input('id', sql.Int, id);
    
    // Track what gets deleted
    const deletedCounts: Record<string, number> = {};
    
    // Delete in order: child records first, then parent
    // 1. Banking: Loan Proceeds (references Loan)
    const loanProceedsResult = await request.query('DELETE FROM banking.LoanProceeds WHERE ProjectId = @id');
    deletedCounts['LoanProceeds'] = loanProceedsResult.rowsAffected[0] || 0;
    
    // 2. Banking: Guarantee Burndowns (references Guarantee)
    const guaranteeBurndownResult = await request.query('DELETE FROM banking.GuaranteeBurndown WHERE ProjectId = @id');
    deletedCounts['GuaranteeBurndowns'] = guaranteeBurndownResult.rowsAffected[0] || 0;
    
    // 3. Banking: DSCR Tests (references Loan, but can exist without)
    const dscrResult = await request.query('DELETE FROM banking.DSCRTest WHERE ProjectId = @id');
    deletedCounts['DSCRTests'] = dscrResult.rowsAffected[0] || 0;
    
    // 4. Banking: Participations (references Loan, but can exist without)
    const participationResult = await request.query('DELETE FROM banking.Participation WHERE ProjectId = @id');
    deletedCounts['Participations'] = participationResult.rowsAffected[0] || 0;
    
    // 5. Banking: Guarantees (references Loan, but can exist without)
    const guaranteeResult = await request.query('DELETE FROM banking.Guarantee WHERE ProjectId = @id');
    deletedCounts['Guarantees'] = guaranteeResult.rowsAffected[0] || 0;
    
    // 6. Banking: Covenants (references Loan, but can exist without)
    const covenantResult = await request.query('DELETE FROM banking.Covenant WHERE ProjectId = @id');
    deletedCounts['Covenants'] = covenantResult.rowsAffected[0] || 0;
    
    // 7. Banking: Liquidity Requirements
    const liquidityResult = await request.query('DELETE FROM banking.LiquidityRequirement WHERE ProjectId = @id');
    deletedCounts['LiquidityRequirements'] = liquidityResult.rowsAffected[0] || 0;
    
    // 8. Banking: Equity Commitments
    const equityResult = await request.query('DELETE FROM banking.EquityCommitment WHERE ProjectId = @id');
    deletedCounts['EquityCommitments'] = equityResult.rowsAffected[0] || 0;
    
    // 9. Banking: Loans (must be deleted after all loan-related records)
    const loanResult = await request.query('DELETE FROM banking.Loan WHERE ProjectId = @id');
    deletedCounts['Loans'] = loanResult.rowsAffected[0] || 0;
    
    // 10. Pipeline: Under Contract
    const underContractResult = await request.query('DELETE FROM pipeline.UnderContract WHERE ProjectId = @id');
    deletedCounts['UnderContract'] = underContractResult.rowsAffected[0] || 0;
    
    // 11. Pipeline: Commercial Listed
    const commercialListedResult = await request.query('DELETE FROM pipeline.CommercialListed WHERE ProjectId = @id');
    deletedCounts['CommercialListed'] = commercialListedResult.rowsAffected[0] || 0;
    
    // 12. Pipeline: Commercial Acreage
    const commercialAcreageResult = await request.query('DELETE FROM pipeline.CommercialAcreage WHERE ProjectId = @id');
    deletedCounts['CommercialAcreage'] = commercialAcreageResult.rowsAffected[0] || 0;
    
    // 13. Pipeline: Closed Property
    const closedPropertyResult = await request.query('DELETE FROM pipeline.ClosedProperty WHERE ProjectId = @id');
    deletedCounts['ClosedProperties'] = closedPropertyResult.rowsAffected[0] || 0;
    
    // 14. Finally, delete the project itself
    const projectResult = await request.query('DELETE FROM core.Project WHERE ProjectId = @id');
    
    if (projectResult.rowsAffected[0] === 0) {
      await transaction.rollback();
      res.status(404).json({ success: false, error: { message: 'Project not found' } });
      return;
    }
    
    // Commit transaction
    await transaction.commit();
    
    // Build summary message
    const deletedItems = Object.entries(deletedCounts)
      .filter(([_, count]) => count > 0)
      .map(([name, count]) => `${name} (${count})`)
      .join(', ');
    
    const summaryMessage = deletedItems 
      ? `Project "${projectName}" and associated records deleted successfully. Deleted: ${deletedItems}`
      : `Project "${projectName}" deleted successfully.`;
    
    res.json({ 
      success: true, 
      message: summaryMessage,
      deletedCounts: deletedCounts
    });
  } catch (error: any) {
    // Rollback transaction on error
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        // Ignore rollback errors
      }
    }
    
    if (error.number === 547) { // Foreign key constraint violation
      res.status(409).json({ 
        success: false, 
        error: { 
          message: 'Cannot delete project: unexpected foreign key constraint violation. Some records may still be referenced by other tables.' 
        } 
      });
      return;
    }
    next(error);
  }
};

// ============================================================
// BANK CONTROLLER
// ============================================================

export const getAllBanks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT * FROM core.Bank ORDER BY BankName');
    res.json({ success: true, data: normalizeStateInPayload(result.recordset) });
  } catch (error) {
    next(error);
  }
};

export const getBankById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM core.Bank WHERE BankId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Bank not found' } });
      return;
    }
    
    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error) {
    next(error);
  }
};

export const createBank = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { 
      BankName, City, State, HQState, Notes, 
      HoldLimit, PerDealLimit, Deposits,
      Address, ContactName, ContactEmail, ContactPhone
    } = req.body;

    if (!BankName) {
      res.status(400).json({ success: false, error: { message: 'BankName is required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('BankName', sql.NVarChar, BankName)
      .input('City', sql.NVarChar, City)
      .input('State', sql.NVarChar, normalizeState(State))
      .input('HQState', sql.NVarChar, normalizeState(HQState))
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .input('HoldLimit', sql.Decimal(18, 2), HoldLimit)
      .input('PerDealLimit', sql.Decimal(18, 2), PerDealLimit)
      .input('Deposits', sql.Decimal(18, 2), Deposits)
      .input('Address', sql.NVarChar, Address)
      .input('ContactName', sql.NVarChar, ContactName)
      .input('ContactEmail', sql.NVarChar, ContactEmail)
      .input('ContactPhone', sql.NVarChar, ContactPhone)
      .query(`
        INSERT INTO core.Bank (BankName, City, State, HQState, Notes, HoldLimit, PerDealLimit, Deposits, Address, ContactName, ContactEmail, ContactPhone)
        OUTPUT INSERTED.*
        VALUES (@BankName, @City, @State, @HQState, @Notes, @HoldLimit, @PerDealLimit, @Deposits, @Address, @ContactName, @ContactEmail, @ContactPhone)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Bank with this name already exists' } });
      return;
    }
    next(error);
  }
};

export const updateBank = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const bankData = req.body;

    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);

    // Build dynamic update query - only update fields that are provided
    const fields: string[] = [];
    Object.keys(bankData).forEach((key) => {
      if (key !== 'BankId' && bankData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), bankData[key]);
        } else if (key === 'HoldLimit' || key === 'PerDealLimit' || key === 'Deposits') {
          request.input(key, sql.Decimal(18, 2), bankData[key]);
        } else if (key === 'State' || key === 'HQState') {
          request.input(key, sql.NVarChar, normalizeState(bankData[key]));
        } else {
          request.input(key, sql.NVarChar, bankData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    const result = await request.query(`
      UPDATE core.Bank
      SET ${fields.join(', ')}
      WHERE BankId = @id;
      SELECT * FROM core.Bank WHERE BankId = @id;
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Bank not found' } });
      return;
    }

    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Bank with this name already exists' } });
      return;
    }
    next(error);
  }
};

export const deleteBank = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM core.Bank WHERE BankId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Bank not found' } });
      return;
    }

    res.json({ success: true, message: 'Bank deleted successfully' });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(409).json({ success: false, error: { message: 'Cannot delete bank with associated records' } });
      return;
    }
    next(error);
  }
};

// ============================================================
// CONTACT BOOK (unified: each individual once, not as investor + rep)
// ============================================================

export const getContactBook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    // All Persons with flags: are they investor rep / individual investor (so UI shows one row per person)
    const personsResult = await pool.request().query(`
      SELECT 
        p.PersonId,
        p.FullName,
        p.Email,
        p.Phone,
        p.Title,
        p.Notes,
        CASE WHEN EXISTS (SELECT 1 FROM core.EquityPartner ep WHERE ep.InvestorRepId = p.PersonId) THEN 1 ELSE 0 END AS IsInvestorRep,
        CASE WHEN EXISTS (SELECT 1 FROM core.EquityPartner ep WHERE ep.InvestorRepId = p.PersonId AND ep.PartnerType = N'Individual') THEN 1 ELSE 0 END AS IsIndividualInvestor
      FROM core.Person p
      ORDER BY p.FullName
    `);
    const personRows = personsResult.recordset.map((r: Record<string, unknown>) => ({
      PersonId: r.PersonId,
      EquityPartnerId: null,
      FullName: r.FullName,
      Email: r.Email,
      Phone: r.Phone,
      Title: r.Title,
      Notes: r.Notes,
      IsInvestorRep: (r.IsInvestorRep as number) === 1,
      IsIndividualInvestor: (r.IsIndividualInvestor as number) === 1,
    }));

    // Individual equity partners with no linked Person — show once as contact (no duplicate as "investor rep")
    const individualOnlyResult = await pool.request().query(`
      SELECT EquityPartnerId, PartnerName AS FullName
      FROM core.EquityPartner
      WHERE PartnerType = N'Individual' AND InvestorRepId IS NULL
      ORDER BY PartnerName
    `);
    const individualOnlyRows = individualOnlyResult.recordset.map((r: Record<string, unknown>) => ({
      PersonId: null,
      EquityPartnerId: r.EquityPartnerId,
      FullName: r.FullName,
      Email: null,
      Phone: null,
      Title: null,
      Notes: null,
      IsInvestorRep: false,
      IsIndividualInvestor: true,
    }));

    const combined = [...personRows, ...individualOnlyRows].sort((a, b) =>
      String(a.FullName || '').localeCompare(String(b.FullName || ''), undefined, { sensitivity: 'base' })
    );
    res.json({ success: true, data: combined });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// PERSON CONTROLLER
// ============================================================

export const getAllPersons = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT * FROM core.Person ORDER BY FullName');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getPersonById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM core.Person WHERE PersonId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Person not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const createPerson = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { FullName, Email, Phone, Title, Notes } = req.body;

    if (!FullName) {
      res.status(400).json({ success: false, error: { message: 'FullName is required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('FullName', sql.NVarChar, FullName)
      .input('Email', sql.NVarChar, Email)
      .input('Phone', sql.NVarChar, Phone)
      .input('Title', sql.NVarChar(100), Title)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO core.Person (FullName, Email, Phone, Title, Notes)
        OUTPUT INSERTED.*
        VALUES (@FullName, @Email, @Phone, @Title, @Notes)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const updatePerson = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const personData = req.body;

    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);

    // Build dynamic update query - only update fields that are provided
    const fields: string[] = [];
    Object.keys(personData).forEach((key) => {
      if (key !== 'PersonId' && personData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), personData[key]);
        } else {
          request.input(key, sql.NVarChar, personData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    const result = await request.query(`
      UPDATE core.Person
      SET ${fields.join(', ')}
      WHERE PersonId = @id;
      SELECT * FROM core.Person WHERE PersonId = @id;
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Person not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const deletePerson = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM core.Person WHERE PersonId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Person not found' } });
      return;
    }

    res.json({ success: true, message: 'Person deleted successfully' });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(409).json({ success: false, error: { message: 'Cannot delete person with associated records' } });
      return;
    }
    next(error);
  }
};

// ============================================================
// PRE-CON MANAGER CONTROLLER
// ============================================================

export const getAllPreConManagers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .query('SELECT * FROM core.PreConManager ORDER BY FullName');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getPreConManagerById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM core.PreConManager WHERE PreConManagerId = @id');

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Pre-Con Manager not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const createPreConManager = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { FullName, Email, Phone } = req.body;

    if (!FullName) {
      res.status(400).json({ success: false, error: { message: 'FullName is required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('FullName', sql.NVarChar, FullName)
      .input('Email', sql.NVarChar, Email)
      .input('Phone', sql.NVarChar, Phone)
      .query(`
        INSERT INTO core.PreConManager (FullName, Email, Phone)
        OUTPUT INSERTED.*
        VALUES (@FullName, @Email, @Phone)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Pre-Con Manager with this name already exists' } });
      return;
    }
    next(error);
  }
};

export const updatePreConManager = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { FullName, Email, Phone } = req.body;

    const pool = await getConnection();
    const fields: string[] = [];
    const request = pool.request().input('id', sql.Int, id);

    if (FullName !== undefined) {
      fields.push('FullName = @FullName');
      request.input('FullName', sql.NVarChar, FullName);
    }
    if (Email !== undefined) {
      fields.push('Email = @Email');
      request.input('Email', sql.NVarChar, Email);
    }
    if (Phone !== undefined) {
      fields.push('Phone = @Phone');
      request.input('Phone', sql.NVarChar, Phone);
    }

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    fields.push('UpdatedAt = SYSDATETIME()');

    const result = await request.query(`
      UPDATE core.PreConManager
      SET ${fields.join(', ')}
      WHERE PreConManagerId = @id;
      SELECT * FROM core.PreConManager WHERE PreConManagerId = @id;
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Pre-Con Manager not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Pre-Con Manager with this name already exists' } });
      return;
    }
    next(error);
  }
};

export const deletePreConManager = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM core.PreConManager WHERE PreConManagerId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Pre-Con Manager not found' } });
      return;
    }

    res.json({ success: true, message: 'Pre-Con Manager deleted successfully' });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(409).json({ success: false, error: { message: 'Cannot delete Pre-Con Manager with associated DealPipeline records' } });
      return;
    }
    next(error);
  }
};

// ============================================================
// EQUITY PARTNER CONTROLLER
// ============================================================

export const getAllEquityPartners = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        ep.*,
        p.FullName AS InvestorRepName,
        p.Email AS InvestorRepEmail,
        p.Phone AS InvestorRepPhone
      FROM core.EquityPartner ep
      LEFT JOIN core.Person p ON ep.InvestorRepId = p.PersonId
      ORDER BY ep.PartnerName
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getEquityPartnerById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          ep.*,
          p.FullName AS InvestorRepName,
          p.Email AS InvestorRepEmail,
          p.Phone AS InvestorRepPhone
        FROM core.EquityPartner ep
        LEFT JOIN core.Person p ON ep.InvestorRepId = p.PersonId
        WHERE ep.EquityPartnerId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Equity Partner not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getEquityPartnerByIMSId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { imsId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('imsId', sql.NVarChar, imsId)
      .query(`
        SELECT 
          ep.*,
          p.FullName AS InvestorRepName,
          p.Email AS InvestorRepEmail,
          p.Phone AS InvestorRepPhone
        FROM core.EquityPartner ep
        LEFT JOIN core.Person p ON ep.InvestorRepId = p.PersonId
        WHERE ep.IMSInvestorProfileId = @imsId
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Equity Partner with this IMS ID not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

/**
 * Find or create a Person by FullName so individual investors/guarantors/reps use one record (no duplicates).
 * Match is case-insensitive. Returns PersonId.
 */
async function findOrCreatePersonByName(
  request: sql.Request,
  fullName: string
): Promise<number> {
  const nameTrimmed = (fullName || '').trim();
  if (!nameTrimmed) throw new Error('FullName is required');
  const existing = await request
    .input('fullName', sql.NVarChar(255), nameTrimmed)
    .query(`
      SELECT PersonId FROM core.Person
      WHERE LOWER(RTRIM(FullName)) = LOWER(@fullName)
    `);
  if (existing.recordset.length > 0) {
    return existing.recordset[0].PersonId;
  }
  const insert = await request
    .input('fullName', sql.NVarChar(255), nameTrimmed)
    .query(`
      INSERT INTO core.Person (FullName) VALUES (@fullName);
      SELECT SCOPE_IDENTITY() AS PersonId;
    `);
  return parseInt(insert.recordset[0].PersonId, 10);
}

export const createEquityPartner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { PartnerName, Notes, IMSInvestorProfileId, PartnerType, InvestorRepId } = req.body;

    if (!PartnerName) {
      res.status(400).json({ success: false, error: { message: 'PartnerName is required' } });
      return;
    }

    // Validate PartnerType if provided
    if (PartnerType && PartnerType !== 'Entity' && PartnerType !== 'Individual') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'PartnerType must be "Entity" or "Individual"' } 
      });
      return;
    }

    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    
    try {
      await transaction.begin();
      const txRequest = new sql.Request(transaction);

      // Individual investors: sync to contacts so one person = one core.Person (no duplicate as investor vs rep/guarantor)
      let effectiveInvestorRepId: number | null = InvestorRepId ?? null;
      if (PartnerType === 'Individual' && effectiveInvestorRepId == null) {
        effectiveInvestorRepId = await findOrCreatePersonByName(txRequest, PartnerName);
      }
      
      // Insert the equity partner
      const result = await new sql.Request(transaction)
        .input('PartnerName', sql.NVarChar(255), PartnerName)
        .input('Notes', sql.NVarChar(sql.MAX), Notes)
        .input('IMSInvestorProfileId', sql.NVarChar(50), IMSInvestorProfileId)
        .input('PartnerType', sql.NVarChar(20), PartnerType)
        .input('InvestorRepId', sql.Int, effectiveInvestorRepId)
        .query(`
          INSERT INTO core.EquityPartner (PartnerName, Notes, IMSInvestorProfileId, PartnerType, InvestorRepId)
          OUTPUT INSERTED.*
          VALUES (@PartnerName, @Notes, @IMSInvestorProfileId, @PartnerType, @InvestorRepId)
        `);
      
      await transaction.commit();
      
      // Fetch with investor rep details
      const finalResult = await pool.request()
        .input('id', sql.Int, result.recordset[0].EquityPartnerId)
        .query(`
          SELECT 
            ep.*,
            p.FullName AS InvestorRepName,
            p.Email AS InvestorRepEmail,
            p.Phone AS InvestorRepPhone
          FROM core.EquityPartner ep
          LEFT JOIN core.Person p ON ep.InvestorRepId = p.PersonId
          WHERE ep.EquityPartnerId = @id
        `);
      
      const partner = finalResult.recordset[0];
      res.status(201).json({ success: true, data: partner });
    } catch (error: any) {
      await transaction.rollback();
      throw error;
    }
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Equity Partner with this name already exists' } });
      return;
    }
    if (error.number === 547) {
      if (error.message.includes('CK_EquityPartner_PartnerType')) {
        res.status(400).json({ 
          success: false, 
          error: { message: 'PartnerType must be "Entity" or "Individual"' } 
        });
        return;
      }
      if (error.message.includes('FK_EquityPartner_InvestorRep')) {
        res.status(400).json({ 
          success: false, 
          error: { message: 'Invalid InvestorRepId: Person does not exist' } 
        });
        return;
      }
    }
    next(error);
  }
};

export const updateEquityPartner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const partnerData = req.body;

    const pool = await getConnection();

    // Validate PartnerType if provided
    if (partnerData.PartnerType && 
        partnerData.PartnerType !== 'Entity' && 
        partnerData.PartnerType !== 'Individual') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'PartnerType must be "Entity" or "Individual"' } 
      });
      return;
    }

    // Individual investors: sync to contacts so one person = one core.Person (no duplicate)
    const currentPartner = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT PartnerName, PartnerType, InvestorRepId FROM core.EquityPartner WHERE EquityPartnerId = @id');
    if (currentPartner.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Equity Partner not found' } });
      return;
    }
    const current = currentPartner.recordset[0];
    const isIndividual = partnerData.PartnerType === 'Individual' || current.PartnerType === 'Individual';
    const partnerName = partnerData.PartnerName !== undefined ? partnerData.PartnerName : current.PartnerName;
    const effectiveInvestorRepId = partnerData.InvestorRepId !== undefined ? partnerData.InvestorRepId : current.InvestorRepId;
    if (isIndividual && effectiveInvestorRepId == null && partnerName) {
      const personId = await findOrCreatePersonByName(pool.request(), partnerName);
      partnerData.InvestorRepId = personId;
    }

    const request = pool.request().input('id', sql.Int, id);
    // Build dynamic update query - only update fields that are provided
    const fields: string[] = [];
    Object.keys(partnerData).forEach((key) => {
      if (key !== 'EquityPartnerId' && partnerData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), partnerData[key]);
        } else if (key === 'IMSInvestorProfileId') {
          request.input(key, sql.NVarChar(50), partnerData[key]);
        } else if (key === 'PartnerType') {
          request.input(key, sql.NVarChar(20), partnerData[key]);
        } else if (key === 'InvestorRepId') {
          request.input(key, sql.Int, partnerData[key]);
        } else {
          request.input(key, sql.NVarChar, partnerData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    const result = await request.query(`
      UPDATE core.EquityPartner
      SET ${fields.join(', ')}
      WHERE EquityPartnerId = @id;
      SELECT 
        ep.*,
        p.FullName AS InvestorRepName,
        p.Email AS InvestorRepEmail,
        p.Phone AS InvestorRepPhone
      FROM core.EquityPartner ep
      LEFT JOIN core.Person p ON ep.InvestorRepId = p.PersonId
      WHERE ep.EquityPartnerId = @id;
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Equity Partner not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Equity Partner with this name already exists' } });
      return;
    }
    if (error.number === 547) {
      if (error.message.includes('FK_EquityPartner_InvestorRep')) {
        res.status(400).json({ 
          success: false, 
          error: { message: 'Invalid InvestorRepId: Person does not exist' } 
        });
        return;
      }
    }
    next(error);
  }
};

export const deleteEquityPartner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM core.EquityPartner WHERE EquityPartnerId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Equity Partner not found' } });
      return;
    }

    res.json({ success: true, message: 'Equity Partner deleted successfully' });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(409).json({ success: false, error: { message: 'Cannot delete equity partner with associated records' } });
      return;
    }
    next(error);
  }
};

// ============================================================
// PRODUCT TYPE CONTROLLER
// ============================================================

export const getAllProductTypes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .query('SELECT * FROM core.ProductType WHERE IsActive = 1 ORDER BY DisplayOrder, ProductTypeName');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getProductTypeById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM core.ProductType WHERE ProductTypeId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Product Type not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const createProductType = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ProductTypeName, DisplayOrder, IsActive, Notes } = req.body;

    if (!ProductTypeName) {
      res.status(400).json({ success: false, error: { message: 'ProductTypeName is required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('ProductTypeName', sql.NVarChar(50), ProductTypeName)
      .input('DisplayOrder', sql.Int, DisplayOrder || 0)
      .input('IsActive', sql.Bit, IsActive !== undefined ? IsActive : true)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO core.ProductType (ProductTypeName, DisplayOrder, IsActive, Notes)
        OUTPUT INSERTED.*
        VALUES (@ProductTypeName, @DisplayOrder, @IsActive, @Notes)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Product Type with this name already exists' } });
      return;
    }
    next(error);
  }
};

export const updateProductType = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const productTypeData = req.body;

    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);

    const fields: string[] = [];
    Object.keys(productTypeData).forEach((key) => {
      if (key !== 'ProductTypeId' && productTypeData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'DisplayOrder') {
          request.input(key, sql.Int, productTypeData[key]);
        } else if (key === 'IsActive') {
          request.input(key, sql.Bit, productTypeData[key]);
        } else if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), productTypeData[key]);
        } else {
          request.input(key, sql.NVarChar(50), productTypeData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    fields.push('UpdatedAt = SYSDATETIME()');

    const result = await request.query(`
      UPDATE core.ProductType
      SET ${fields.join(', ')}
      WHERE ProductTypeId = @id;
      SELECT * FROM core.ProductType WHERE ProductTypeId = @id;
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Product Type not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Product Type with this name already exists' } });
      return;
    }
    next(error);
  }
};

export const deleteProductType = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    
    // Soft delete by setting IsActive = 0 instead of hard delete
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        UPDATE core.ProductType 
        SET IsActive = 0, UpdatedAt = SYSDATETIME()
        WHERE ProductTypeId = @id;
        SELECT * FROM core.ProductType WHERE ProductTypeId = @id;
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Product Type not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0], message: 'Product Type deactivated successfully' });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(409).json({ success: false, error: { message: 'Cannot delete product type with associated projects' } });
      return;
    }
    next(error);
  }
};

// ============================================================
// REGION CONTROLLER
// ============================================================

export const getAllRegions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .query('SELECT * FROM core.Region WHERE IsActive = 1 ORDER BY DisplayOrder, RegionName');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getRegionById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM core.Region WHERE RegionId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Region not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const createRegion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { RegionName, DisplayOrder, IsActive, Notes } = req.body;

    if (!RegionName) {
      res.status(400).json({ success: false, error: { message: 'RegionName is required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('RegionName', sql.NVarChar(50), RegionName)
      .input('DisplayOrder', sql.Int, DisplayOrder || 0)
      .input('IsActive', sql.Bit, IsActive !== undefined ? IsActive : true)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO core.Region (RegionName, DisplayOrder, IsActive, Notes)
        OUTPUT INSERTED.*
        VALUES (@RegionName, @DisplayOrder, @IsActive, @Notes)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Region with this name already exists' } });
      return;
    }
    next(error);
  }
};

export const updateRegion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const regionData = req.body;

    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);

    const fields: string[] = [];
    Object.keys(regionData).forEach((key) => {
      if (key !== 'RegionId' && regionData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'DisplayOrder') {
          request.input(key, sql.Int, regionData[key]);
        } else if (key === 'IsActive') {
          request.input(key, sql.Bit, regionData[key]);
        } else if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), regionData[key]);
        } else {
          request.input(key, sql.NVarChar(50), regionData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    fields.push('UpdatedAt = SYSDATETIME()');

    const result = await request.query(`
      UPDATE core.Region
      SET ${fields.join(', ')}
      WHERE RegionId = @id;
      SELECT * FROM core.Region WHERE RegionId = @id;
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Region not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Region with this name already exists' } });
      return;
    }
    next(error);
  }
};

export const deleteRegion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    
    // Soft delete by setting IsActive = 0 instead of hard delete
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        UPDATE core.Region 
        SET IsActive = 0, UpdatedAt = SYSDATETIME()
        WHERE RegionId = @id;
        SELECT * FROM core.Region WHERE RegionId = @id;
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Region not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0], message: 'Region deactivated successfully' });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(409).json({ success: false, error: { message: 'Cannot delete region with associated projects' } });
      return;
    }
    next(error);
  }
};
