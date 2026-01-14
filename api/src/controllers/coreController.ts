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
    const result = await pool.request().query(`
      SELECT 
        ProjectId, ProjectName, City, State, Region, Address, Units,
        ProductType, Stage, EstimatedConstructionStartDate,
        CreatedAt, UpdatedAt
      FROM core.Project 
      ORDER BY ProjectName
    `);
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
    
    res.json({ success: true, data: result.recordset[0] });
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
      .input('State', sql.NVarChar, State)
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
    // Filter out Location column (removed from schema - use City, State, Region, Address instead)
    const fields: string[] = [];
    Object.keys(projectData).forEach((key) => {
      if (key !== 'ProjectId' && key !== 'Location' && projectData[key] !== undefined) {
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
    const { 
      BankName, City, State, HQState, Notes, 
      HoldLimit, PerDealLimit, Deposits 
    } = req.body;

    if (!BankName) {
      res.status(400).json({ success: false, error: { message: 'BankName is required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('BankName', sql.NVarChar, BankName)
      .input('City', sql.NVarChar, City)
      .input('State', sql.NVarChar, State)
      .input('HQState', sql.NVarChar, HQState)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .input('HoldLimit', sql.Decimal(18, 2), HoldLimit)
      .input('PerDealLimit', sql.Decimal(18, 2), PerDealLimit)
      .input('Deposits', sql.Decimal(18, 2), Deposits)
      .query(`
        INSERT INTO core.Bank (BankName, City, State, HQState, Notes, HoldLimit, PerDealLimit, Deposits)
        OUTPUT INSERTED.*
        VALUES (@BankName, @City, @State, @HQState, @Notes, @HoldLimit, @PerDealLimit, @Deposits)
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

export const getEquityPartnerByIMSId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { imsId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('imsId', sql.NVarChar, imsId)
      .query('SELECT * FROM core.EquityPartner WHERE IMSInvestorProfileId = @imsId');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Equity Partner with this IMS ID not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const createEquityPartner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { PartnerName, Notes, IMSInvestorProfileId } = req.body;

    if (!PartnerName) {
      res.status(400).json({ success: false, error: { message: 'PartnerName is required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('PartnerName', sql.NVarChar(255), PartnerName)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .input('IMSInvestorProfileId', sql.NVarChar(50), IMSInvestorProfileId)
      .query(`
        INSERT INTO core.EquityPartner (PartnerName, Notes, IMSInvestorProfileId)
        OUTPUT INSERTED.*
        VALUES (@PartnerName, @Notes, @IMSInvestorProfileId)
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
        } else if (key === 'IMSInvestorProfileId') {
          request.input(key, sql.NVarChar(50), partnerData[key]);
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
