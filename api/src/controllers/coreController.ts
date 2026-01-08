import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import { getConnection } from '../config/database';
import { buildSelectQuery, buildInsertQuery, buildUpdateQuery, buildDeleteQuery } from '../utils/queryBuilder';

// ============================================================
// PROJECT CONTROLLER
// ============================================================

export const getAllProjects = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT * FROM core.Project ORDER BY ProjectName');
    res.json({ success: true, data: result.recordset });
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
      .query('SELECT * FROM core.Project WHERE ProjectId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Project not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const createProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectName, City, State, Region, Location, Units,
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
      .input('State', sql.NVarChar, State)
      .input('Region', sql.NVarChar, Region)
      .input('Location', sql.NVarChar, Location)
      .input('Units', sql.Int, Units)
      .input('ProductType', sql.NVarChar, ProductType)
      .input('Stage', sql.NVarChar, Stage)
      .input('EstimatedConstructionStartDate', sql.Date, EstimatedConstructionStartDate)
      .query(`
        INSERT INTO core.Project (ProjectName, City, State, Region, Location, Units, ProductType, Stage, EstimatedConstructionStartDate)
        VALUES (@ProjectName, @City, @State, @Region, @Location, @Units, @ProductType, @Stage, @EstimatedConstructionStartDate);
        SELECT SCOPE_IDENTITY() AS ProjectId;
      `);

    const projectId = insertResult.recordset[0].ProjectId;
    
    const result = await pool.request()
      .input('id', sql.Int, projectId)
      .query('SELECT * FROM core.Project WHERE ProjectId = @id');

    res.status(201).json({ success: true, data: result.recordset[0] });
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
    const fields: string[] = [];
    Object.keys(projectData).forEach((key) => {
      if (key !== 'ProjectId' && projectData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'Units') {
          request.input(key, sql.Int, projectData[key]);
        } else if (key === 'EstimatedConstructionStartDate') {
          request.input(key, sql.Date, projectData[key]);
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

    // Get the updated record
    const updated = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM core.Project WHERE ProjectId = @id');

    res.json({ success: true, data: updated.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Project with this name already exists' } });
      return;
    }
    next(error);
  }
};

export const deleteProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM core.Project WHERE ProjectId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Project not found' } });
      return;
    }

    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error: any) {
    if (error.number === 547) { // Foreign key constraint violation
      res.status(409).json({ success: false, error: { message: 'Cannot delete project with associated records' } });
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
    res.json({ success: true, data: result.recordset });
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
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const createBank = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { BankName, City, State, Notes } = req.body;

    if (!BankName) {
      res.status(400).json({ success: false, error: { message: 'BankName is required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('BankName', sql.NVarChar, BankName)
      .input('City', sql.NVarChar, City)
      .input('State', sql.NVarChar, State)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO core.Bank (BankName, City, State, Notes)
        OUTPUT INSERTED.*
        VALUES (@BankName, @City, @State, @Notes)
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

    res.json({ success: true, data: result.recordset[0] });
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
        INSERT INTO core.Person (FullName, Email, Phone)
        OUTPUT INSERTED.*
        VALUES (@FullName, @Email, @Phone)
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
        request.input(key, sql.NVarChar, personData[key]);
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
// EQUITY PARTNER CONTROLLER
// ============================================================

export const getAllEquityPartners = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT * FROM core.EquityPartner ORDER BY PartnerName');
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
      .query('SELECT * FROM core.EquityPartner WHERE EquityPartnerId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Equity Partner not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const createEquityPartner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { PartnerName, Notes } = req.body;

    if (!PartnerName) {
      res.status(400).json({ success: false, error: { message: 'PartnerName is required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('PartnerName', sql.NVarChar(255), PartnerName)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO core.EquityPartner (PartnerName, Notes)
        OUTPUT INSERTED.*
        VALUES (@PartnerName, @Notes)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Equity Partner with this name already exists' } });
      return;
    }
    next(error);
  }
};

export const updateEquityPartner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const partnerData = req.body;

    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);

    // Build dynamic update query - only update fields that are provided
    const fields: string[] = [];
    Object.keys(partnerData).forEach((key) => {
      if (key !== 'EquityPartnerId' && partnerData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), partnerData[key]);
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
      SELECT * FROM core.EquityPartner WHERE EquityPartnerId = @id;
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

