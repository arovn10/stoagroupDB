import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import { getConnection } from '../config/database';

// ============================================================
// UNDER CONTRACT CONTROLLER
// ============================================================

export const getAllUnderContracts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    // Pull CORE data and Land Development specific data
    const result = await pool.request().query(`
      SELECT 
        uc.UnderContractId,
        uc.ProjectId,
        -- CORE attributes (from core.Project)
        p.ProjectName,
        p.City,
        p.State,
        p.Units,
        -- Region from core.Region table
        r.RegionName AS Region,
        -- Land Development specific attributes
        uc.Acreage,
        uc.LandPrice,
        uc.SqFtPrice,
        uc.ExecutionDate,
        uc.DueDiligenceDate,
        uc.ClosingDate,
        uc.PurchasingEntity,
        uc.Cash,
        uc.OpportunityZone,
        uc.ClosingNotes
      FROM pipeline.UnderContract uc
      LEFT JOIN core.Project p ON uc.ProjectId = p.ProjectId
      LEFT JOIN core.Region r ON p.Region = r.RegionName
      ORDER BY uc.UnderContractId
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getUnderContractById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    // Pull CORE data and Land Development specific data
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          uc.UnderContractId,
          uc.ProjectId,
          -- CORE attributes (from core.Project)
          p.ProjectName,
          p.City,
          p.State,
          p.Units,
          -- Region from core.Region table
          r.RegionName AS Region,
          -- Land Development specific attributes
          uc.Acreage,
          uc.LandPrice,
          uc.SqFtPrice,
          uc.ExecutionDate,
          uc.DueDiligenceDate,
          uc.ClosingDate,
          uc.PurchasingEntity,
          uc.Cash,
          uc.OpportunityZone,
          uc.ClosingNotes
        FROM pipeline.UnderContract uc
        LEFT JOIN core.Project p ON uc.ProjectId = p.ProjectId
        LEFT JOIN core.Region r ON p.Region = r.RegionName
        WHERE uc.UnderContractId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Under Contract record not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getUnderContractByProjectId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    // Pull CORE data and Land Development specific data
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          uc.UnderContractId,
          uc.ProjectId,
          -- CORE attributes (from core.Project)
          p.ProjectName,
          p.City,
          p.State,
          p.Units,
          -- Region from core.Region table
          r.RegionName AS Region,
          -- Land Development specific attributes
          uc.Acreage,
          uc.LandPrice,
          uc.SqFtPrice,
          uc.ExecutionDate,
          uc.DueDiligenceDate,
          uc.ClosingDate,
          uc.PurchasingEntity,
          uc.Cash,
          uc.OpportunityZone,
          uc.ClosingNotes
        FROM pipeline.UnderContract uc
        LEFT JOIN core.Project p ON uc.ProjectId = p.ProjectId
        LEFT JOIN core.Region r ON p.Region = r.RegionName
        WHERE uc.ProjectId = @projectId
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Under Contract record for this project not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const createUnderContract = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId,
      // CORE attributes (can be updated in CORE if provided)
      Units,
      // Land Development specific attributes
      Acreage,
      LandPrice,
      ExecutionDate,
      DueDiligenceDate,
      ClosingDate,
      PurchasingEntity,
      Cash,
      OpportunityZone,
      ClosingNotes
    } = req.body;

    if (!ProjectId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId is required' } });
      return;
    }

    const pool = await getConnection();
    
    // Calculate SqFtPrice: LandPrice / (Acreage * 43560)
    // 43560 = square feet per acre
    let sqFtPrice: number | null = null;
    if (LandPrice && Acreage && Acreage > 0) {
      sqFtPrice = LandPrice / (Acreage * 43560);
    }

    // Update Units in CORE if provided
    if (Units !== undefined) {
      await pool.request()
        .input('ProjectId', sql.Int, ProjectId)
        .input('Units', sql.Int, Units)
        .query('UPDATE core.Project SET Units = @Units, UpdatedAt = SYSDATETIME() WHERE ProjectId = @ProjectId');
    }

    // Insert Land Development specific data
    const result = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('Acreage', sql.Decimal(18, 4), Acreage)
      .input('LandPrice', sql.Decimal(18, 2), LandPrice)
      .input('SqFtPrice', sql.Decimal(18, 2), sqFtPrice)
      .input('ExecutionDate', sql.Date, ExecutionDate)
      .input('DueDiligenceDate', sql.Date, DueDiligenceDate)
      .input('ClosingDate', sql.Date, ClosingDate)
      .input('PurchasingEntity', sql.NVarChar, PurchasingEntity)
      .input('Cash', sql.Bit, Cash)
      .input('OpportunityZone', sql.Bit, OpportunityZone)
      .input('ClosingNotes', sql.NVarChar(sql.MAX), ClosingNotes)
      .query(`
        INSERT INTO pipeline.UnderContract (
          ProjectId, Acreage, LandPrice, SqFtPrice,
          ExecutionDate, DueDiligenceDate, ClosingDate, PurchasingEntity,
          Cash, OpportunityZone, ClosingNotes
        )
        OUTPUT INSERTED.*
        VALUES (
          @ProjectId, @Acreage, @LandPrice, @SqFtPrice,
          @ExecutionDate, @DueDiligenceDate, @ClosingDate, @PurchasingEntity,
          @Cash, @OpportunityZone, @ClosingNotes
        )
      `);

    // Get the full record with CORE data
    const fullRecord = await pool.request()
      .input('id', sql.Int, result.recordset[0].UnderContractId)
      .query(`
        SELECT 
          uc.UnderContractId,
          uc.ProjectId,
          p.ProjectName,
          p.City,
          p.State,
          p.Units,
          r.RegionName AS Region,
          uc.Acreage,
          uc.LandPrice,
          uc.SqFtPrice,
          uc.ExecutionDate,
          uc.DueDiligenceDate,
          uc.ClosingDate,
          uc.PurchasingEntity,
          uc.Cash,
          uc.OpportunityZone,
          uc.ClosingNotes
        FROM pipeline.UnderContract uc
        LEFT JOIN core.Project p ON uc.ProjectId = p.ProjectId
        LEFT JOIN core.Region r ON p.Region = r.RegionName
        WHERE uc.UnderContractId = @id
      `);

    res.status(201).json({ success: true, data: fullRecord.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Under Contract record for this project already exists' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const updateUnderContract = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      // CORE attributes (can be updated in CORE if provided)
      Units,
      // Land Development specific attributes
      Acreage,
      LandPrice,
      ExecutionDate,
      DueDiligenceDate,
      ClosingDate,
      PurchasingEntity,
      Cash,
      OpportunityZone,
      ClosingNotes
    } = req.body;

    const pool = await getConnection();
    
    // Update Units in CORE if provided
    if (Units !== undefined) {
      const ucResult = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT ProjectId FROM pipeline.UnderContract WHERE UnderContractId = @id');
      
      if (ucResult.recordset.length === 0) {
        res.status(404).json({ success: false, error: { message: 'Under Contract record not found' } });
        return;
      }

      await pool.request()
        .input('ProjectId', sql.Int, ucResult.recordset[0].ProjectId)
        .input('Units', sql.Int, Units)
        .query('UPDATE core.Project SET Units = @Units, UpdatedAt = SYSDATETIME() WHERE ProjectId = @ProjectId');
    }

    // Build dynamic update query for Land Development fields
    const fields: string[] = [];
    const request = pool.request().input('id', sql.Int, id);

    if (Acreage !== undefined) {
      fields.push('Acreage = @Acreage');
      request.input('Acreage', sql.Decimal(18, 4), Acreage);
    }
    if (LandPrice !== undefined) {
      fields.push('LandPrice = @LandPrice');
      request.input('LandPrice', sql.Decimal(18, 2), LandPrice);
    }
    if (ExecutionDate !== undefined) {
      fields.push('ExecutionDate = @ExecutionDate');
      request.input('ExecutionDate', sql.Date, ExecutionDate);
    }
    if (DueDiligenceDate !== undefined) {
      fields.push('DueDiligenceDate = @DueDiligenceDate');
      request.input('DueDiligenceDate', sql.Date, DueDiligenceDate);
    }
    if (ClosingDate !== undefined) {
      fields.push('ClosingDate = @ClosingDate');
      request.input('ClosingDate', sql.Date, ClosingDate);
    }
    if (PurchasingEntity !== undefined) {
      fields.push('PurchasingEntity = @PurchasingEntity');
      request.input('PurchasingEntity', sql.NVarChar, PurchasingEntity);
    }
    if (Cash !== undefined) {
      fields.push('Cash = @Cash');
      request.input('Cash', sql.Bit, Cash);
    }
    if (OpportunityZone !== undefined) {
      fields.push('OpportunityZone = @OpportunityZone');
      request.input('OpportunityZone', sql.Bit, OpportunityZone);
    }
    if (ClosingNotes !== undefined) {
      fields.push('ClosingNotes = @ClosingNotes');
      request.input('ClosingNotes', sql.NVarChar(sql.MAX), ClosingNotes);
    }

    // Recalculate SqFtPrice if LandPrice or Acreage changed
    if (LandPrice !== undefined || Acreage !== undefined) {
      const currentData = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT LandPrice, Acreage FROM pipeline.UnderContract WHERE UnderContractId = @id');
      
      if (currentData.recordset.length === 0) {
        res.status(404).json({ success: false, error: { message: 'Under Contract record not found' } });
        return;
      }

      const finalLandPrice = LandPrice !== undefined ? LandPrice : currentData.recordset[0].LandPrice;
      const finalAcreage = Acreage !== undefined ? Acreage : currentData.recordset[0].Acreage;

      let sqFtPrice: number | null = null;
      if (finalLandPrice && finalAcreage && finalAcreage > 0) {
        sqFtPrice = finalLandPrice / (finalAcreage * 43560);
      }
      
      fields.push('SqFtPrice = @SqFtPrice');
      request.input('SqFtPrice', sql.Decimal(18, 2), sqFtPrice);
    }

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    await request.query(`
      UPDATE pipeline.UnderContract
      SET ${fields.join(', ')}
      WHERE UnderContractId = @id
    `);

    // Get the updated record with CORE data
    const updated = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          uc.UnderContractId,
          uc.ProjectId,
          p.ProjectName,
          p.City,
          p.State,
          p.Units,
          r.RegionName AS Region,
          uc.Acreage,
          uc.LandPrice,
          uc.SqFtPrice,
          uc.ExecutionDate,
          uc.DueDiligenceDate,
          uc.ClosingDate,
          uc.PurchasingEntity,
          uc.Cash,
          uc.OpportunityZone,
          uc.ClosingNotes
        FROM pipeline.UnderContract uc
        LEFT JOIN core.Project p ON uc.ProjectId = p.ProjectId
        LEFT JOIN core.Region r ON p.Region = r.RegionName
        WHERE uc.UnderContractId = @id
      `);

    if (updated.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Under Contract record not found' } });
      return;
    }

    res.json({ success: true, data: updated.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const deleteUnderContract = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM pipeline.UnderContract WHERE UnderContractId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Under Contract record not found' } });
      return;
    }

    res.json({ success: true, message: 'Under Contract record deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// COMMERCIAL LISTED CONTROLLER
// ============================================================

export const getAllCommercialListed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    // Pull CORE data and Land Development specific data
    const result = await pool.request().query(`
      SELECT 
        cl.CommercialListedId,
        cl.ProjectId,
        -- CORE attributes (from core.Project)
        p.ProjectName,
        p.City,
        p.State,
        -- Land Development specific attributes
        cl.ListedDate,
        cl.Acreage,
        cl.LandPrice,
        cl.ListingStatus,
        cl.DueDiligenceDate,
        cl.ClosingDate,
        cl.Owner,
        cl.PurchasingEntity,
        cl.Broker,
        cl.Notes
      FROM pipeline.CommercialListed cl
      LEFT JOIN core.Project p ON cl.ProjectId = p.ProjectId
      ORDER BY cl.CommercialListedId
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getCommercialListedById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    // Pull CORE data and Land Development specific data
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          cl.CommercialListedId,
          cl.ProjectId,
          -- CORE attributes (from core.Project)
          p.ProjectName,
          p.City,
          p.State,
          -- Land Development specific attributes
          cl.ListedDate,
          cl.Acreage,
          cl.LandPrice,
          cl.ListingStatus,
          cl.DueDiligenceDate,
          cl.ClosingDate,
          cl.Owner,
          cl.PurchasingEntity,
          cl.Broker,
          cl.Notes
        FROM pipeline.CommercialListed cl
        LEFT JOIN core.Project p ON cl.ProjectId = p.ProjectId
        WHERE cl.CommercialListedId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Commercial Listed record not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getCommercialListedByProjectId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    // Pull CORE data and Land Development specific data
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          cl.CommercialListedId,
          cl.ProjectId,
          -- CORE attributes (from core.Project)
          p.ProjectName,
          p.City,
          p.State,
          -- Land Development specific attributes
          cl.ListedDate,
          cl.Acreage,
          cl.LandPrice,
          cl.ListingStatus,
          cl.DueDiligenceDate,
          cl.ClosingDate,
          cl.Owner,
          cl.PurchasingEntity,
          cl.Broker,
          cl.Notes
        FROM pipeline.CommercialListed cl
        LEFT JOIN core.Project p ON cl.ProjectId = p.ProjectId
        WHERE cl.ProjectId = @projectId
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Commercial Listed record for this project not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const createCommercialListed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId,
      // Land Development specific attributes
      ListedDate,
      Acreage,
      LandPrice,
      ListingStatus,
      DueDiligenceDate,
      ClosingDate,
      Owner,
      PurchasingEntity,
      Broker,
      Notes
    } = req.body;

    if (!ProjectId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId is required' } });
      return;
    }

    const pool = await getConnection();
    
    // Insert Land Development specific data
    const result = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('ListedDate', sql.Date, ListedDate)
      .input('Acreage', sql.Decimal(18, 4), Acreage)
      .input('LandPrice', sql.Decimal(18, 2), LandPrice)
      .input('ListingStatus', sql.NVarChar(50), ListingStatus)
      .input('DueDiligenceDate', sql.Date, DueDiligenceDate)
      .input('ClosingDate', sql.Date, ClosingDate)
      .input('Owner', sql.NVarChar, Owner)
      .input('PurchasingEntity', sql.NVarChar, PurchasingEntity)
      .input('Broker', sql.NVarChar, Broker)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO pipeline.CommercialListed (
          ProjectId, ListedDate, Acreage, LandPrice, ListingStatus,
          DueDiligenceDate, ClosingDate, Owner, PurchasingEntity, Broker, Notes
        )
        OUTPUT INSERTED.*
        VALUES (
          @ProjectId, @ListedDate, @Acreage, @LandPrice, @ListingStatus,
          @DueDiligenceDate, @ClosingDate, @Owner, @PurchasingEntity, @Broker, @Notes
        )
      `);

    // Get the full record with CORE data
    const fullRecord = await pool.request()
      .input('id', sql.Int, result.recordset[0].CommercialListedId)
      .query(`
        SELECT 
          cl.CommercialListedId,
          cl.ProjectId,
          p.ProjectName,
          p.City,
          p.State,
          cl.ListedDate,
          cl.Acreage,
          cl.LandPrice,
          cl.ListingStatus,
          cl.DueDiligenceDate,
          cl.ClosingDate,
          cl.Owner,
          cl.PurchasingEntity,
          cl.Broker,
          cl.Notes
        FROM pipeline.CommercialListed cl
        LEFT JOIN core.Project p ON cl.ProjectId = p.ProjectId
        WHERE cl.CommercialListedId = @id
      `);

    res.status(201).json({ success: true, data: fullRecord.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Commercial Listed record for this project already exists' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const updateCommercialListed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      // Land Development specific attributes
      ListedDate,
      Acreage,
      LandPrice,
      ListingStatus,
      DueDiligenceDate,
      ClosingDate,
      Owner,
      PurchasingEntity,
      Broker,
      Notes
    } = req.body;

    const pool = await getConnection();
    
    // Build dynamic update query for Land Development fields
    const fields: string[] = [];
    const request = pool.request().input('id', sql.Int, id);

    if (ListedDate !== undefined) {
      fields.push('ListedDate = @ListedDate');
      request.input('ListedDate', sql.Date, ListedDate);
    }
    if (Acreage !== undefined) {
      fields.push('Acreage = @Acreage');
      request.input('Acreage', sql.Decimal(18, 4), Acreage);
    }
    if (LandPrice !== undefined) {
      fields.push('LandPrice = @LandPrice');
      request.input('LandPrice', sql.Decimal(18, 2), LandPrice);
    }
    if (ListingStatus !== undefined) {
      fields.push('ListingStatus = @ListingStatus');
      request.input('ListingStatus', sql.NVarChar(50), ListingStatus);
    }
    if (DueDiligenceDate !== undefined) {
      fields.push('DueDiligenceDate = @DueDiligenceDate');
      request.input('DueDiligenceDate', sql.Date, DueDiligenceDate);
    }
    if (ClosingDate !== undefined) {
      fields.push('ClosingDate = @ClosingDate');
      request.input('ClosingDate', sql.Date, ClosingDate);
    }
    if (Owner !== undefined) {
      fields.push('Owner = @Owner');
      request.input('Owner', sql.NVarChar, Owner);
    }
    if (PurchasingEntity !== undefined) {
      fields.push('PurchasingEntity = @PurchasingEntity');
      request.input('PurchasingEntity', sql.NVarChar, PurchasingEntity);
    }
    if (Broker !== undefined) {
      fields.push('Broker = @Broker');
      request.input('Broker', sql.NVarChar, Broker);
    }
    if (Notes !== undefined) {
      fields.push('Notes = @Notes');
      request.input('Notes', sql.NVarChar(sql.MAX), Notes);
    }

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    await request.query(`
      UPDATE pipeline.CommercialListed
      SET ${fields.join(', ')}
      WHERE CommercialListedId = @id
    `);

    // Get the updated record with CORE data
    const updated = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          cl.CommercialListedId,
          cl.ProjectId,
          p.ProjectName,
          p.City,
          p.State,
          cl.ListedDate,
          cl.Acreage,
          cl.LandPrice,
          cl.ListingStatus,
          cl.DueDiligenceDate,
          cl.ClosingDate,
          cl.Owner,
          cl.PurchasingEntity,
          cl.Broker,
          cl.Notes
        FROM pipeline.CommercialListed cl
        LEFT JOIN core.Project p ON cl.ProjectId = p.ProjectId
        WHERE cl.CommercialListedId = @id
      `);

    if (updated.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Commercial Listed record not found' } });
      return;
    }

    res.json({ success: true, data: updated.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const deleteCommercialListed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM pipeline.CommercialListed WHERE CommercialListedId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Commercial Listed record not found' } });
      return;
    }

    res.json({ success: true, message: 'Commercial Listed record deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// COMMERCIAL ACREAGE CONTROLLER
// ============================================================

export const getAllCommercialAcreage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT ca.*, p.ProjectName
      FROM pipeline.CommercialAcreage ca
      LEFT JOIN core.Project p ON ca.ProjectId = p.ProjectId
      ORDER BY ca.CommercialAcreageId
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getCommercialAcreageById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM pipeline.CommercialAcreage WHERE CommercialAcreageId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Commercial Acreage record not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const createCommercialAcreage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ProjectId, Location, Acreage, SquareFootage, BuildingFootprintSF } = req.body;

    if (!ProjectId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId is required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('Location', sql.NVarChar, Location)
      .input('Acreage', sql.Decimal(18, 4), Acreage)
      .input('SquareFootage', sql.Decimal(18, 2), SquareFootage)
      .input('BuildingFootprintSF', sql.Decimal(18, 2), BuildingFootprintSF)
      .query(`
        INSERT INTO pipeline.CommercialAcreage (ProjectId, Location, Acreage, SquareFootage, BuildingFootprintSF)
        OUTPUT INSERTED.*
        VALUES (@ProjectId, @Location, @Acreage, @SquareFootage, @BuildingFootprintSF)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Commercial Acreage record for this project already exists' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const updateCommercialAcreage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const acreageData = req.body;

    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);

    // Build dynamic update query - only update fields that are provided
    const fields: string[] = [];
    Object.keys(acreageData).forEach((key) => {
      if (key !== 'CommercialAcreageId' && acreageData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'ProjectId') {
          request.input(key, sql.Int, acreageData[key]);
        } else if (key === 'Acreage') {
          request.input(key, sql.Decimal(18, 4), acreageData[key]);
        } else if (key === 'SquareFootage' || key === 'BuildingFootprintSF') {
          request.input(key, sql.Decimal(18, 2), acreageData[key]);
        } else {
          request.input(key, sql.NVarChar, acreageData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    const result = await request.query(`
      UPDATE pipeline.CommercialAcreage
      SET ${fields.join(', ')}
      WHERE CommercialAcreageId = @id;
      SELECT * FROM pipeline.CommercialAcreage WHERE CommercialAcreageId = @id;
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Commercial Acreage record not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const deleteCommercialAcreage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM pipeline.CommercialAcreage WHERE CommercialAcreageId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Commercial Acreage record not found' } });
      return;
    }

    res.json({ success: true, message: 'Commercial Acreage record deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// CLOSED PROPERTY CONTROLLER
// ============================================================

export const getAllClosedProperties = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT cp.*, p.ProjectName
      FROM pipeline.ClosedProperty cp
      LEFT JOIN core.Project p ON cp.ProjectId = p.ProjectId
      ORDER BY cp.ClosedPropertyId
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getClosedPropertyById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM pipeline.ClosedProperty WHERE ClosedPropertyId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Closed Property record not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const createClosedProperty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId, Status, ClosingDate, Location, Address, Acreage,
      Units, Price, PricePerSF, ActOfSale, DueDiligenceDate,
      PurchasingEntity, CashFlag
    } = req.body;

    if (!ProjectId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId is required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('Status', sql.NVarChar, Status)
      .input('ClosingDate', sql.Date, ClosingDate)
      .input('Location', sql.NVarChar, Location)
      .input('Address', sql.NVarChar(500), Address)
      .input('Acreage', sql.Decimal(18, 4), Acreage)
      .input('Units', sql.Int, Units)
      .input('Price', sql.Decimal(18, 2), Price)
      .input('PricePerSF', sql.Decimal(18, 2), PricePerSF)
      .input('ActOfSale', sql.NVarChar, ActOfSale)
      .input('DueDiligenceDate', sql.Date, DueDiligenceDate)
      .input('PurchasingEntity', sql.NVarChar, PurchasingEntity)
      .input('CashFlag', sql.Bit, CashFlag)
      .query(`
        INSERT INTO pipeline.ClosedProperty (
          ProjectId, Status, ClosingDate, Location, Address, Acreage,
          Units, Price, PricePerSF, ActOfSale, DueDiligenceDate,
          PurchasingEntity, CashFlag
        )
        OUTPUT INSERTED.*
        VALUES (
          @ProjectId, @Status, @ClosingDate, @Location, @Address, @Acreage,
          @Units, @Price, @PricePerSF, @ActOfSale, @DueDiligenceDate,
          @PurchasingEntity, @CashFlag
        )
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Closed Property record for this project already exists' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const updateClosedProperty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const propertyData = req.body;

    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);

    // Build dynamic update query - only update fields that are provided
    const fields: string[] = [];
    Object.keys(propertyData).forEach((key) => {
      if (key !== 'ClosedPropertyId' && propertyData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'ProjectId' || key === 'Units') {
          request.input(key, sql.Int, propertyData[key]);
        } else if (key === 'Acreage') {
          request.input(key, sql.Decimal(18, 4), propertyData[key]);
        } else if (key === 'Price' || key === 'PricePerSF') {
          request.input(key, sql.Decimal(18, 2), propertyData[key]);
        } else if (key.includes('Date')) {
          request.input(key, sql.Date, propertyData[key]);
        } else if (key === 'CashFlag') {
          request.input(key, sql.Bit, propertyData[key]);
        } else if (key === 'Address') {
          request.input(key, sql.NVarChar(500), propertyData[key]);
        } else {
          request.input(key, sql.NVarChar, propertyData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    const result = await request.query(`
      UPDATE pipeline.ClosedProperty
      SET ${fields.join(', ')}
      WHERE ClosedPropertyId = @id;
      SELECT * FROM pipeline.ClosedProperty WHERE ClosedPropertyId = @id;
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Closed Property record not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const deleteClosedProperty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM pipeline.ClosedProperty WHERE ClosedPropertyId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Closed Property record not found' } });
      return;
    }

    res.json({ success: true, message: 'Closed Property record deleted successfully' });
  } catch (error) {
    next(error);
  }
};

